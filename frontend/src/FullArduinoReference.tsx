import { useEffect, useRef, useState } from "react";
export default function FullArduinoReference() {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [slow, setSlow] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setReady(false);
    setSlow(false);
    const listener = (event: MessageEvent) => {
      if (
        event.source === frame.current?.contentWindow &&
        event.origin === "null" &&
        event.data?.type === "showonce:arduino-ready"
      )
        setReady(true);
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
        <p>Arduino Uno · 16 interactive lessons</p>
        <button
          className="text-button"
          onClick={() => setAttempt((n) => n + 1)}
        >
          Reload reference
        </button>
      </div>
      {!ready && (
        <p role="status">
          {slow
            ? "The 3D reference is taking longer to load. Try reloading, or use Circuit basics."
            : "Loading the 3D reference…"}
        </p>
      )}
      <iframe
        key={attempt}
        ref={frame}
        title="Arduino interactive course and simulator"
        src="/arduino-reference/"
        sandbox="allow-scripts"
        allow="camera 'none'; microphone 'none'; geolocation 'none'"
        referrerPolicy="no-referrer"
      />
      <p className="fine">
        Reference activities do not check your physical build or complete
        ShowOnce checkpoints. Follow your approved lesson for the actual board
        and wiring. Reference progress resets when this view reloads.
      </p>
      <details className="arduino-reference-about">
        <summary>About this reference</summary>
        <p>
          Learn Arduino, designed by{" "}
          <a href="https://x.com/DilumSanjaya" target="_blank" rel="noreferrer">
            Dilum Sanjaya
          </a>
          . Adapted from the public deployment snapshot supplied for this
          project, captured 23 October 2026.{" "}
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
          ShowOnce adds navigation and an isolated reference view. Original
          author credits and bundled notices are retained. This snapshot does
          not include a project-wide reuse licence.
        </p>
      </details>
    </section>
  );
}
