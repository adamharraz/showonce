import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Camera,
  Eye,
  Mic,
  MicOff,
  Monitor,
  Pause,
  Play,
  Radio,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
} from "lucide-react";
import { api, getToken, type Config, type Version } from "./api";
import { CoachSpeaker, useCoachMedia } from "./coach-media";
import ComponentPanel from "./ComponentPanel";
import { emptyScene, type ComponentScene } from "./components-api";

type State =
  | "idle"
  | "connecting"
  | "capturing"
  | "paused"
  | "reconnecting"
  | "finished"
  | "error";
type Message = { role: "user" | "assistant"; text: string; partial: boolean };
const duration = (seconds: number) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;

export default function LiveCoach({
  config,
  lessonId,
  versionNumber,
}: {
  config: Config;
  lessonId?: string;
  versionNumber?: number;
}) {
  const [state, setState] = useState<State>("idle");
  const [source, setSource] = useState<"camera" | "screen">("camera");
  const [consent, setConsent] = useState(false);
  const [mic, setMic] = useState(true);
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [goal, setGoal] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [frames, setFrames] = useState(0);
  const [turns, setTurns] = useState(0);
  const [lesson, setLesson] = useState<Version | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [componentScene, setComponentScene] =
    useState<ComponentScene>(emptyScene);
  const [inspecting, setInspecting] = useState(false);
  const [componentNotice, setComponentNotice] = useState("");
  const [history, setHistory] = useState<
    {
      id: string;
      created_at: string;
      goal: string;
      messages: Omit<Message, "partial">[];
      component_scene?: ComponentScene;
    }[]
  >([]);
  const socket = useRef<WebSocket | null>(null);
  const speaker = useRef<CoachSpeaker | null>(null);
  const started = useRef(0);
  const heartbeat = useRef<ReturnType<typeof setInterval> | null>(null);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  const finishRef = useRef<() => void>(() => {});
  if (!speaker.current) speaker.current = new CoachSpeaker(setSpeaking);
  const send = (message: unknown) => {
    const ws = socket.current;
    if (ws?.readyState === WebSocket.OPEN) {
      if (ws.bufferedAmount > 500000) {
        finishRef.current();
        setError(
          "The connection could not keep up. Restart when your connection is stable.",
        );
        return;
      }
      ws.send(JSON.stringify(message));
    }
  };
  const media = useCoachMedia(
    send,
    state === "capturing",
    mic && !inspecting,
    () => finishRef.current(),
    (message) => {
      setError(message);
      setMic(false);
    },
  );
  const mediaRef = useRef(media);
  mediaRef.current = media;
  const finish = () => {
    const ws = socket.current;
    socket.current = null;
    if (ws?.readyState === WebSocket.OPEN)
      ws.send(JSON.stringify({ type: "control", action: "finish" }));
    ws?.close();
    if (heartbeat.current) clearInterval(heartbeat.current);
    mediaRef.current.stop();
    speaker.current?.interrupt();
    setState("finished");
    setInspecting(false);
    setMessages((old) => old.map((m) => ({ ...m, partial: false })));
  };
  finishRef.current = finish;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const ws = socket.current;
      socket.current = null;
      if (ws?.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ type: "control", action: "finish" }));
      ws?.close();
      if (heartbeat.current) clearInterval(heartbeat.current);
      mediaRef.current.stream?.getTracks().forEach((t) => t.stop());
      void speaker.current?.close();
    };
  }, []);
  useEffect(() => {
    if (lessonId && versionNumber)
      void api<Version>(`/lessons/${lessonId}/versions/${versionNumber}`)
        .then(setLesson)
        .catch((e) => setError(e.message));
  }, [lessonId, versionNumber]);
  useEffect(() => {
    messagesEnd.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [messages]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (started.current && !["idle", "finished", "error"].includes(state))
        setElapsed(Math.floor((Date.now() - started.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [state]);

  function transcript(role: Message["role"], delta: string, partial = true) {
    setMessages((old) => {
      const last = old[old.length - 1];
      if (partial && last?.role === role && last.partial)
        return [...old.slice(0, -1), { ...last, text: last.text + delta }];
      return [
        ...old.map((m) => ({ ...m, partial: false })),
        { role, text: delta, partial },
      ].slice(-100);
    });
  }

  useEffect(() => {
    if (!inspecting) return;
    const timeout = setTimeout(() => {
      setInspecting(false);
      setComponentNotice(
        "The inspection did not finish within a minute. Try a closer view when the assistant is ready.",
      );
    }, 60000);
    return () => clearTimeout(timeout);
  }, [inspecting]);

  async function start() {
    if (!consent || state === "connecting") return;
    setError("");
    setNotice("");
    setState("connecting");
    setMessages([]);
    setSessionId(null);
    setComponentScene(emptyScene());
    setComponentNotice("");
    setInspecting(false);
    setFrames(0);
    setTurns(0);
    setStepIndex(0);
    setElapsed(0);
    started.current = 0;
    let captured: MediaStream | null = null;
    try {
      await speaker.current!.prepare();
      speaker.current!.muted = muted;
      if (!navigator.mediaDevices || !window.isSecureContext)
        throw new Error(
          "Use HTTPS or localhost for camera and microphone access.",
        );
      const audio = mic
        ? {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          }
        : false;
      if (source === "screen") {
        captured = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: 10 },
          audio: false,
        });
        if (mic) {
          try {
            const microphone = await navigator.mediaDevices.getUserMedia({
              audio,
            });
            microphone.getAudioTracks().forEach((t) => captured!.addTrack(t));
          } catch (e) {
            captured.getTracks().forEach((t) => t.stop());
            throw e;
          }
        }
      } else
        captured = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio,
        });
      if (!mounted.current) {
        captured.getTracks().forEach((t) => t.stop());
        return;
      }
      media.setStream(captured);
      const ws = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/coaching/stream`,
      );
      socket.current = ws;
      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: "authenticate",
            token: getToken(),
            consent: true,
            source,
            goal,
            ...(lessonId
              ? { lesson_id: lessonId, version: versionNumber }
              : {}),
          }),
        );
        heartbeat.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN)
            ws.send(JSON.stringify({ type: "ping" }));
        }, 15000);
      };
      ws.onmessage = (event) => {
        if (!mounted.current || socket.current !== ws) return;
        const message = JSON.parse(event.data);
        switch (message.type) {
          case "ready":
            setSessionId(message.id);
            started.current =
              Date.now() -
              (message.limit_seconds - message.remaining_seconds) * 1000;
            setState("capturing");
            setNotice("Connected. Show your workspace and ask a question.");
            break;
          case "status":
            setInspecting(false);
            setState(
              message.state === "connecting" && started.current
                ? "reconnecting"
                : message.state,
            );
            speaker.current?.interrupt();
            break;
          case "audio":
            speaker.current?.feed(message.data, message.sample_rate || 24000);
            break;
          case "speaking":
            setTurns(message.turns);
            break;
          case "transcript":
            transcript(message.role, message.text);
            break;
          case "text_sent":
            transcript("user", message.text, false);
            setText("");
            break;
          case "transcript_end":
            setMessages((old) =>
              old.map((m) =>
                m.role === message.role ? { ...m, partial: false } : m,
              ),
            );
            break;
          case "interrupted":
            speaker.current?.interrupt();
            setMessages((old) => old.map((m) => ({ ...m, partial: false })));
            break;
          case "turn_complete":
            setTurns(message.turns);
            setInspecting(false);
            break;
          case "frame_seen":
            setFrames((old) => old + 1);
            break;
          case "component_inspecting":
            setInspecting(true);
            setComponentNotice(
              "Inspecting one camera snapshot. Microphone sharing resumes when the reply finishes.",
            );
            break;
          case "component_scene":
            setComponentScene(message.scene);
            setComponentNotice(
              message.scene.components.length
                ? "Reference models loaded. Review suggested identities and unresolved details."
                : "No supported components were identified in this snapshot.",
            );
            break;
          case "component_notice":
            setInspecting(false);
            setComponentNotice(message.message);
            break;
          case "error":
            setError(message.message);
            finishRef.current();
            setState("error");
            break;
          case "finished":
            setNotice(message.reason);
            finishRef.current();
            break;
        }
      };
      ws.onerror = () => {
        if (socket.current === ws) {
          setError(
            "Could not connect to the live assistant. Your existing lessons remain available.",
          );
          finishRef.current();
          setState("error");
        }
      };
      ws.onclose = () => {
        if (socket.current !== ws) return;
        socket.current = null;
        if (heartbeat.current) clearInterval(heartbeat.current);
        mediaRef.current.stop();
        speaker.current?.interrupt();
        setState((old) =>
          old === "error" || old === "finished" ? old : "finished",
        );
        setNotice("Connection ended. Your conversation has been saved.");
      };
    } catch (e) {
      captured?.getTracks().forEach((t) => t.stop());
      media.stop();
      speaker.current?.interrupt();
      if (mounted.current) {
        setError((e as Error).message);
        setState("error");
      }
    }
  }

  function ask(value: string) {
    if (state === "capturing" && value.trim())
      send({ type: "text", text: value.trim() });
  }
  const running = [
    "capturing",
    "paused",
    "reconnecting",
    "connecting",
  ].includes(state);
  const ready = state === "capturing";
  const step = lesson?.draft.steps[stepIndex];
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR LIVE LAB PARTNER</span>
          <h1>Learn with someone beside you.</h1>
          <p>Show your workspace. Ask naturally. Get guidance as you work.</p>
        </div>
        <span className="badge green">Free-tier mode</span>
      </div>
      {error && (
        <div className="banner error" role="alert">
          {error}
        </div>
      )}
      <div className="coach-layout">
        <section className="coach-workspace">
          <div className="coach-camera panel">
            <div className="coach-camera-heading">
              <span>
                <Camera size={17} />{" "}
                {source === "camera" ? "Your workbench" : "Your shared screen"}
              </span>
              <span className={"coach-live-pill " + (ready ? "on" : "")}>
                <span className="dot" /> {ready ? "LIVE" : state.toUpperCase()}
              </span>
            </div>
            <div className="coach-video-stage">
              <video
                ref={media.videoRef}
                autoPlay
                muted
                playsInline
                aria-label="Live workspace camera"
              />
              {!media.stream && (
                <div className="coach-camera-empty">
                  <Camera size={40} />
                  <h2>Your workspace, in focus.</h2>
                  <p>
                    Point the camera at what you’re working on.
                    <br />
                    Your assistant will watch and listen.
                  </p>
                </div>
              )}
              {media.stream && state === "paused" && (
                <div className="coach-pause-overlay">
                  <Pause size={30} /> Camera sharing paused
                </div>
              )}
              {ready && (
                <span className="coach-camera-caption">
                  <Eye size={13} />{" "}
                  {frames
                    ? "Assistant receiving your camera"
                    : "Waiting for the first camera frame"}
                </span>
              )}
            </div>
            <div className="coach-camera-footer">
              <span>
                {duration(elapsed)} / {duration(config.coach_limit_seconds)}
              </span>
              <span>
                {frames} frames shared · {turns} replies
              </span>
            </div>
          </div>
          {!running ? (
            <section className="panel coach-setup">
              <h3>Set up your workspace</h3>
              <div className="coach-source-buttons">
                <button
                  className={
                    "button " + (source === "camera" ? "primary" : "secondary")
                  }
                  onClick={() => setSource("camera")}
                >
                  <Camera size={16} /> Webcam
                </button>
                <button
                  className={
                    "button " + (source === "screen" ? "primary" : "secondary")
                  }
                  onClick={() => setSource("screen")}
                >
                  <Monitor size={16} /> Share screen
                </button>
              </div>
              <label>
                What are you working on? <span className="muted">Optional</span>
                <input
                  value={goal}
                  maxLength={2000}
                  placeholder="For example, assembling a breadboard circuit"
                  onChange={(e) => setGoal(e.target.value)}
                />
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={mic}
                  onChange={(e) => setMic(e.target.checked)}
                />{" "}
                Use microphone for spoken conversation
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />{" "}
                Everyone captured is 18+ and consents to Google processing this
                feed.
              </label>
              <button
                className="button primary"
                disabled={
                  !consent ||
                  !config.coach_enabled ||
                  !config.ai_configured ||
                  !config.free_tier_confirmed ||
                  (!!lessonId && !lesson)
                }
                onClick={() => void start()}
              >
                <Radio size={17} />{" "}
                {state === "idle"
                  ? "Start live coaching"
                  : "Start a new session"}
              </button>
              <p className="fine">
                Camera and audio are streamed, not recorded. The conversation is
                saved privately for seven days. You can type with the microphone
                off.
              </p>
            </section>
          ) : (
            <div className="panel coach-controls">
              <button
                className="button secondary"
                disabled={!ready && state !== "paused"}
                onClick={() => {
                  speaker.current?.interrupt();
                  if (ready) {
                    setState("reconnecting");
                    send({ type: "control", action: "pause" });
                  } else {
                    setState("reconnecting");
                    send({ type: "control", action: "resume" });
                  }
                }}
              >
                {state === "paused" ? <Play size={16} /> : <Pause size={16} />}{" "}
                {state === "paused" ? "Resume" : "Pause sharing"}
              </button>
              <button
                className="button secondary"
                disabled={!media.stream?.getAudioTracks().length}
                onClick={() => {
                  setMic(!mic);
                  send({ type: "microphone", enabled: !mic });
                }}
              >
                {mic ? <Mic size={16} /> : <MicOff size={16} />}{" "}
                {mic ? "Mute mic" : "Unmute mic"}
              </button>
              <button
                className="button secondary"
                onClick={() => {
                  const next = !muted;
                  setMuted(next);
                  speaker.current!.muted = next;
                  if (next) speaker.current?.interrupt();
                }}
              >
                {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}{" "}
                {muted ? "Enable voice" : "Mute voice"}
              </button>
              <button className="button secondary" onClick={finish}>
                <Square size={16} /> Finish
              </button>
            </div>
          )}
          {step && (
            <section className="panel coach-lesson">
              <span className="eyebrow">
                APPROVED LESSON · STEP {stepIndex + 1} OF{" "}
                {lesson!.draft.steps.length}
              </span>
              <h3>{step.title}</h3>
              <p>{step.instruction}</p>
              <p className="fine">
                {step.criteria
                  .filter((c) => c.mode === "manual")
                  .map((c) => `Manual check: ${c.description}`)
                  .join(" · ")}
              </p>
              <button
                className="button secondary"
                disabled={!ready || stepIndex >= lesson!.draft.steps.length - 1}
                onClick={() => {
                  const next = stepIndex + 1;
                  speaker.current?.interrupt();
                  setStepIndex(next);
                  send({ type: "step", step_id: lesson!.draft.steps[next].id });
                }}
              >
                Continue to next step
              </button>
              <p className="fine">
                Continue is your choice. Spoken coaching does not mark formal
                checkpoints passed.
              </p>
            </section>
          )}
          <ComponentPanel
            scene={componentScene}
            sessionId={sessionId}
            ready={ready && frames > 0}
            inspecting={inspecting}
            notice={componentNotice}
            inspect={() => {
              media.snapshot();
              send({ type: "inspect_components" });
            }}
            onChange={(scene) => {
              setComponentScene(scene);
              setInspecting(false);
              setComponentNotice(
                "Your correction is saved. The next question will include it for the assistant.",
              );
            }}
          />
          {!running && (
            <details
              className="panel coach-history"
              onToggle={(e) => {
                if (e.currentTarget.open)
                  void api<typeof history>("/coaching/sessions")
                    .then(setHistory)
                    .catch((e) => setError(e.message));
              }}
            >
              <summary>Recent conversations</summary>
              <p className="fine">
                Saved privately for seven days. Opening a conversation does not
                run the AI.
              </p>
              {history.map((record) => (
                <button
                  key={record.id}
                  className="text-button"
                  onClick={() => {
                    setSessionId(record.id);
                    setComponentScene(record.component_scene || emptyScene());
                    setComponentNotice(
                      "Saved reference inventory. Start a new session to inspect a fresh view.",
                    );
                    setMessages(
                      record.messages.map((message) => ({
                        ...message,
                        partial: false,
                      })),
                    );
                    setNotice(
                      "Viewing a saved conversation. Start a new session for fresh live guidance.",
                    );
                  }}
                >
                  {record.goal || "Live coaching session"} ·{" "}
                  {new Date(record.created_at).toLocaleDateString()}
                </button>
              ))}
              {!history.length && (
                <p className="fine">No saved conversations yet.</p>
              )}
            </details>
          )}
        </section>
        <aside className="panel coach-assistant">
          <div className="coach-assistant-heading">
            <span className={"coach-avatar " + (speaking ? "speaking" : "")}>
              <Sparkles size={22} />
            </span>
            <div>
              <h3>ShowOnce assistant</h3>
              <span>
                {speaking
                  ? "Speaking…"
                  : ready
                    ? mic
                      ? "Listening and watching"
                      : "Watching · microphone off"
                    : state === "paused"
                      ? "Sharing paused"
                      : "Ready when you are"}
              </span>
            </div>
          </div>
          <div className="coach-messages" aria-live="polite">
            {!messages.length && (
              <div className="coach-chat-empty">
                <span className="coach-orbit">
                  <Sparkles size={26} />
                </span>
                <h3>
                  A little guidance,
                  <br />
                  right when you need it.
                </h3>
                <p>
                  Ask what’s visible, how to approach a step, or whether
                  something looks different.
                </p>
                <span>Replies come from your live session.</span>
              </div>
            )}
            {messages.map((m, i) => (
              <div className={"coach-message " + m.role} key={i}>
                <span>{m.role === "assistant" ? "ShowOnce" : "You"}</span>
                <p>
                  {m.text}
                  {m.partial && <i className="coach-cursor" />}
                </p>
              </div>
            ))}
            <div ref={messagesEnd} />
          </div>
          <div className="coach-chat-footer">
            <button
              className="coach-look-button"
              disabled={!ready}
              onClick={() => {
                media.snapshot();
                ask(
                  "Look at my current camera view. Describe only what you can visibly establish and ask for a clearer view if needed.",
                );
              }}
            >
              <Eye size={15} /> Look at this now
            </button>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                ask(text);
              }}
            >
              <input
                aria-label="Message the live assistant"
                value={text}
                maxLength={2000}
                placeholder={
                  ready
                    ? "Ask your assistant…"
                    : "Start a session to ask a question"
                }
                disabled={!ready}
                onChange={(e) => setText(e.target.value)}
              />
              <button
                aria-label="Send message"
                disabled={!ready || !text.trim()}
              >
                <ArrowUp size={18} />
              </button>
            </form>
            <p className="fine">
              {notice ||
                "Your assistant can only assess what the camera reveals."}
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
