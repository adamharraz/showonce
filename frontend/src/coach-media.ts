import { useEffect, useRef, useState } from "react";

export function bytesToBase64(bytes: Uint8Array): string {
  let value = "";
  for (let i = 0; i < bytes.length; i += 4096)
    value += String.fromCharCode(...bytes.subarray(i, i + 4096));
  return btoa(value);
}

export function pcm16(input: Float32Array, sourceRate: number): Uint8Array {
  const count = Math.floor((input.length * 16000) / sourceRate);
  const buffer = new ArrayBuffer(count * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < count; i++) {
    const sample = Math.max(
      -1,
      Math.min(
        1,
        input[Math.min(input.length - 1, Math.floor((i * sourceRate) / 16000))],
      ),
    );
    view.setInt16(i * 2, sample < 0 ? sample * 32768 : sample * 32767, true);
  }
  return new Uint8Array(buffer);
}

export function decodePcm(data: string): Float32Array<ArrayBuffer> {
  const raw = atob(data.replaceAll("-", "+").replaceAll("_", "/"));
  const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  const values = new Float32Array(Math.floor(bytes.length / 2));
  for (let i = 0; i < values.length; i++)
    values[i] = view.getInt16(i * 2, true) / 32768;
  return values;
}

export class CoachSpeaker {
  context: AudioContext | null = null;
  sources = new Set<AudioBufferSourceNode>();
  next = 0;
  muted = false;
  onSpeaking: (speaking: boolean) => void;
  constructor(onSpeaking: (speaking: boolean) => void) {
    this.onSpeaking = onSpeaking;
  }
  async prepare() {
    if (!this.context || this.context.state === "closed")
      this.context = new AudioContext();
    await this.context.resume();
  }
  feed(data: string, sampleRate: number) {
    if (this.muted || !this.context || this.context.state === "closed") return;
    const values = decodePcm(data);
    if (!values.length) return;
    if (this.next - this.context.currentTime > 8) this.interrupt();
    const buffer = this.context.createBuffer(1, values.length, sampleRate);
    buffer.copyToChannel(values, 0);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      if (!this.sources.size) this.onSpeaking(false);
    };
    const at = Math.max(this.context.currentTime + 0.015, this.next);
    source.start(at);
    this.next = at + buffer.duration;
    this.onSpeaking(true);
  }
  interrupt() {
    for (const source of this.sources) {
      source.onended = null;
      try {
        source.stop();
      } catch {}
    }
    this.sources.clear();
    this.next = 0;
    this.onSpeaking(false);
  }
  async close() {
    this.interrupt();
    await this.context?.close().catch(() => {});
    this.context = null;
  }
}

export function useCoachMedia(
  send: (message: unknown) => void,
  enabled: boolean,
  mic: boolean,
  onEnded: () => void,
  onError: (message: string) => void,
) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const state = useRef({ send, enabled, mic, onEnded, onError });
  state.current = { send, enabled, mic, onEnded, onError };
  const capture = useRef<(() => boolean) | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  useEffect(() => {
    workletRef.current?.port.postMessage({ enabled: enabled && mic });
  }, [enabled, mic]);
  useEffect(() => {
    if (!stream) return;
    const video = videoRef.current;
    if (video) {
      video.srcObject = stream;
      void video.play().catch(() => {});
    }
    const canvas = document.createElement("canvas");
    let lastFrame = 0;
    capture.current = () => {
      if (
        !state.current.enabled ||
        !video ||
        video.readyState < 2 ||
        performance.now() - lastFrame < 1000
      )
        return false;
      const ratio = Math.min(
        1,
        768 / Math.max(video.videoWidth, video.videoHeight),
      );
      canvas.width = Math.round(video.videoWidth * ratio);
      canvas.height = Math.round(video.videoHeight * ratio);
      canvas
        .getContext("2d")!
        .drawImage(video, 0, 0, canvas.width, canvas.height);
      state.current.send({
        type: "frame",
        data: canvas.toDataURL("image/jpeg", 0.75).split(",")[1],
      });
      lastFrame = performance.now();
      return true;
    };
    const frameTimer = setInterval(() => capture.current?.(), 2500);
    const ended = () => state.current.onEnded();
    stream.getVideoTracks().forEach((t) => t.addEventListener("ended", ended));
    let disposed = false;
    let audio: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let worklet: AudioWorkletNode | null = null;
    let url = "";
    if (stream.getAudioTracks().length)
      void (async () => {
        audio = new AudioContext();
        url = URL.createObjectURL(
          new Blob(
            [
              `
        class LivePCM extends AudioWorkletProcessor {
          constructor(){super();this.blocks=[];this.size=0;this.enabled=false;this.port.onmessage=e=>{this.enabled=!!e.data.enabled;if(!this.enabled){this.blocks=[];this.size=0;}};}
          process(inputs){const a=inputs[0]?.[0];if(a&&this.enabled){this.blocks.push(new Float32Array(a));this.size+=a.length;if(this.size>=sampleRate*.04){const out=new Float32Array(this.size);let offset=0;for(const b of this.blocks){out.set(b,offset);offset+=b.length;}this.port.postMessage(out);this.blocks=[];this.size=0;}}return true;}
        } registerProcessor('live-pcm',LivePCM);
      `,
            ],
            { type: "application/javascript" },
          ),
        );
        await audio.audioWorklet.addModule(url);
        if (disposed) return;
        source = audio.createMediaStreamSource(stream);
        worklet = new AudioWorkletNode(audio, "live-pcm");
        workletRef.current = worklet;
        worklet.port.postMessage({
          enabled: state.current.enabled && state.current.mic,
        });
        worklet.port.onmessage = (e: MessageEvent<Float32Array>) => {
          if (state.current.enabled && state.current.mic)
            state.current.send({
              type: "audio",
              data: bytesToBase64(pcm16(e.data, audio!.sampleRate)),
            });
        };
        source.connect(worklet);
        const silent = audio.createGain();
        silent.gain.value = 0;
        worklet.connect(silent);
        silent.connect(audio.destination);
        await audio.resume();
      })().catch(() =>
        state.current.onError(
          "The microphone could not start. You can continue by typing, or restart with microphone access.",
        ),
      );
    return () => {
      disposed = true;
      clearInterval(frameTimer);
      capture.current = null;
      workletRef.current = null;
      stream
        .getVideoTracks()
        .forEach((t) => t.removeEventListener("ended", ended));
      source?.disconnect();
      worklet?.disconnect();
      void audio?.close().catch(() => {});
      if (url) URL.revokeObjectURL(url);
      stream.getTracks().forEach((t) => t.stop());
    };
  }, [stream]);
  const stop = () => {
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
  };
  return {
    stream,
    setStream,
    videoRef,
    stop,
    snapshot: () => capture.current?.() || false,
  };
}
