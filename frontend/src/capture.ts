import { useRef, useState, useEffect } from "react";
import type { Source } from "./api";

export async function acquire(
  source: Source,
  microphone: boolean,
): Promise<MediaStream> {
  if (!window.isSecureContext || !navigator.mediaDevices)
    throw new Error(
      "Camera and screen capture need HTTPS or localhost. Open the secure app URL.",
    );
  if (source === "screen") {
    const display = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 10 },
      audio: false,
    });
    if (microphone) {
      try {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        mic.getAudioTracks().forEach((t) => display.addTrack(t));
      } catch (e) {
        display.getTracks().forEach((t) => t.stop());
        throw e;
      }
    }
    return display;
  }
  return navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1600 },
      height: { ideal: 900 },
    },
    audio: microphone,
  });
}
function b64(bytes: Uint8Array) {
  let text = "";
  for (let i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
  return btoa(text);
}

export function useCapture(
  send: (data: unknown) => void,
  elapsed: () => number,
  enabled: boolean,
  onEnded: () => void,
) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const sendRef = useRef(send);
  sendRef.current = send;
  const elapsedRef = useRef(elapsed);
  elapsedRef.current = elapsed;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const endedRef = useRef(onEnded);
  endedRef.current = onEnded;
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const flushRef = useRef<(() => Promise<boolean>) | null>(null);
  useEffect(() => {
    workletRef.current?.port.postMessage({ enabled });
  }, [enabled]);
  useEffect(() => {
    if (!stream) return;
    const video = videoRef.current;
    if (video) {
      video.srcObject = stream;
      void video.play().catch(() => {});
    }
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d")!;
    let seq = 0;
    let audio: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let worklet: AudioWorkletNode | null = null;
    let workletURL = "";
    const prefix = crypto.randomUUID();
    const timer = setInterval(() => {
      if (!enabledRef.current || !video || video.readyState < 2) return;
      const factor = Math.min(1, 1600 / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * factor);
      canvas.height = Math.round(video.videoHeight * factor);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      sendRef.current({
        type: "frame",
        id: `${prefix}-${seq++}`,
        timestamp_ms: elapsedRef.current(),
        data: canvas.toDataURL("image/jpeg", 0.82).split(",")[1],
      });
    }, 1000);
    stream
      .getVideoTracks()
      .forEach((t) => t.addEventListener("ended", () => endedRef.current()));
    let disposed = false;
    if (stream.getAudioTracks().length) {
      void (async () => {
        try {
          audio = new AudioContext({ sampleRate: 16000 });
        } catch {
          audio = new AudioContext();
        }
        workletURL = URL.createObjectURL(
          new Blob(
            [
              `class PCM extends AudioWorkletProcessor {
                constructor(){super();this.parts=[];this.size=0;this.enabled=false;this.port.onmessage=e=>{if(e.data.flush){this.emit();this.port.postMessage('flushed');}else{this.enabled=!!e.data.enabled;if(!this.enabled){this.parts=[];this.size=0;}}};}
                emit(){if(!this.size)return;const out=new Float32Array(this.size);let p=0;for(const b of this.parts){out.set(b,p);p+=b.length;}this.port.postMessage(out);this.parts=[];this.size=0;}
                process(inputs){const a=inputs[0]?.[0];if(a&&this.enabled){this.parts.push(new Float32Array(a));this.size+=a.length;if(this.size>=sampleRate)this.emit();}return true;}
              }registerProcessor('pcm',PCM);`,
            ],
            { type: "application/javascript" },
          ),
        );
        await audio.audioWorklet.addModule(workletURL);
        if (disposed) return;
        source = audio.createMediaStreamSource(stream);
        worklet = new AudioWorkletNode(audio, "pcm");
        workletRef.current = worklet;
        worklet.port.postMessage({ enabled: enabledRef.current });
        let flushComplete: (() => void) | null = null;
        flushRef.current = () =>
          new Promise<boolean>((resolve) => {
            const timer = setTimeout(() => {
              flushComplete = null;
              resolve(false);
            }, 750);
            flushComplete = () => {
              clearTimeout(timer);
              resolve(true);
            };
            worklet!.port.postMessage({ flush: true });
          });
        source.connect(worklet);
        const mute = audio.createGain();
        mute.gain.value = 0;
        worklet.connect(mute);
        mute.connect(audio.destination);
        worklet.port.onmessage = (
          event: MessageEvent<Float32Array | string>,
        ) => {
          if (event.data === "flushed") {
            flushComplete?.();
            flushComplete = null;
            return;
          }
          if (!enabledRef.current) return;
          const input = event.data as Float32Array;
          const rate = audio!.sampleRate;
          const samples = Math.floor((input.length * 16000) / rate);
          const buffer = new ArrayBuffer(samples * 2);
          const view = new DataView(buffer);
          for (let n = 0; n < samples; n++) {
            const value = Math.max(
              -1,
              Math.min(
                1,
                input[
                  Math.min(input.length - 1, Math.floor((n * rate) / 16000))
                ],
              ),
            );
            view.setInt16(
              n * 2,
              value < 0 ? value * 32768 : value * 32767,
              true,
            );
          }
          sendRef.current({
            type: "audio",
            timestamp_ms: elapsedRef.current(),
            data: b64(new Uint8Array(buffer)),
          });
        };
        await audio.resume();
      })().catch(() => endedRef.current());
    }
    return () => {
      disposed = true;
      clearInterval(timer);
      source?.disconnect();
      worklet?.disconnect();
      workletRef.current = null;
      flushRef.current = null;
      void audio?.close();
      if (workletURL) URL.revokeObjectURL(workletURL);
      stream.getTracks().forEach((t) => t.stop());
    };
  }, [stream]);
  const stop = () => {
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
  };
  const flushAudio = () => flushRef.current?.() || Promise.resolve(true);
  return { stream, setStream, videoRef, stop, flushAudio };
}
