import { useEffect, useRef, useState } from "react";
import {
  ARDUINO_TOPICS,
  readReferenceState,
  type ArduinoTopic,
} from "./arduino-reference";
export default function FullArduinoReference({
  topic,
  onTopicChange,
}: {
  topic: ArduinoTopic;
  onTopicChange: (topic: ArduinoTopic) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [slow, setSlow] = useState(false);
  const [webgl, setWebgl] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const topicRef = useRef(topic);
  topicRef.current = topic;
  const onChange = useRef(onTopicChange);
  onChange.current = onTopicChange;
  // Keep one frame while the reader changes topics; send only an allowlisted ID.
  const initialTopic = useRef(topic);
  const pendingTopic = useRef<ArduinoTopic | null>(topic);
  const reportedTopic = useRef<ArduinoTopic>(topic);
  const readyRef = useRef(false);
  function selectFromHost(next: ArduinoTopic) {
    pendingTopic.current =
      next === reportedTopic.current && readyRef.current ? null : next;
    onChange.current(next);
    if (readyRef.current && pendingTopic.current)
      frame.current?.contentWindow?.postMessage(
        { type: "showonce:select-topic", topic: next },
        "*",
      );
  }
  useEffect(() => {
    if (topic !== reportedTopic.current) pendingTopic.current = topic;
    if (ready && pendingTopic.current)
      frame.current?.contentWindow?.postMessage(
        { type: "showonce:select-topic", topic: pendingTopic.current },
        "*",
      );
  }, [topic, ready]);
  useEffect(() => {
    readyRef.current = false;
    setReady(false);
    setSlow(false);
    setWebgl(true);
    const listener = (event: MessageEvent) => {
      if (
        event.source !== frame.current?.contentWindow ||
        event.origin !== "null"
      )
        return;
      const state = readReferenceState(event.data);
      if (!state) return;
      readyRef.current = state.ready;
      setReady(state.ready);
      setWebgl(state.webgl);
      if (!state.ready) return;
      if (pendingTopic.current && state.topic !== pendingTopic.current) {
        frame.current?.contentWindow?.postMessage(
          { type: "showonce:select-topic", topic: pendingTopic.current },
          "*",
        );
        return;
      }
      pendingTopic.current = null;
      reportedTopic.current = state.topic;
      onChange.current(state.topic);
    };
    window.addEventListener("message", listener);
    const timer = setTimeout(() => setSlow(true), 30000);
    return () => {
      window.removeEventListener("message", listener);
      clearTimeout(timer);
    };
  }, [attempt]);
  return (
    <section
      className="arduino-reference"
      aria-label="Arduino learning reference"
    >
      <div className="arduino-reference-toolbar">
        <label>
          Reference topic
          <select
            value={topic}
            onChange={(e) => selectFromHost(e.target.value as ArduinoTopic)}
          >
            {ARDUINO_TOPICS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
        <button
          className="text-button"
          onClick={() => {
            initialTopic.current = topicRef.current;
            pendingTopic.current = topicRef.current;
            readyRef.current = false;
            setAttempt((n) => n + 1);
          }}
        >
          Reload reference
        </button>
      </div>
      {!ready && (
        <p role="status">
          {slow
            ? "The reference is still loading. You can switch to Circuit basics below."
            : "Loading the reference…"}
        </p>
      )}
      {ready && !webgl && (
        <p className="reference-notice" role="status">
          This browser has WebGL disabled. Lesson text is available; the 3D view
          needs a WebGL-enabled browser.
        </p>
      )}
      <iframe
        key={attempt}
        ref={frame}
        title="Arduino interactive course and simulator"
        src={`/arduino-reference/#${initialTopic.current}`}
        sandbox="allow-scripts"
        allow="camera 'none'; microphone 'none'; geolocation 'none'"
        referrerPolicy="no-referrer"
      />
      <p className="fine">
        Arduino Uno reference. Follow your own lesson for the board, GPIO and
        wiring. Reference activities do not complete ShowOnce checkpoints.
      </p>
      <details className="arduino-reference-about">
        <summary>About this reference</summary>
        <p>
          Learn Arduino by{" "}
          <a href="https://x.com/DilumSanjaya" target="_blank" rel="noreferrer">
            Dilum Sanjaya
          </a>
          . This is a local adaptation of the supplied 23 October 2026
          deployment.{" "}
          <a
            href="https://learn-arduino-red.vercel.app/"
            target="_blank"
            rel="noreferrer"
          >
            Original website
          </a>
          .
        </p>
        <p>
          Original credits and bundled notices are retained. No project-wide
          reuse licence was included. Progress inside this isolated reference
          resets when it reloads.
        </p>
      </details>
    </section>
  );
}
