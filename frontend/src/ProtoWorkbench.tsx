import { useLayoutEffect, useRef, useState } from "react";

export type ProtoStarter = "board" | "led" | "sensor";

export default function ProtoWorkbench({
  starter,
  onGuided,
}: {
  starter?: ProtoStarter;
  onGuided: () => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "webgl" | "unavailable">("loading");
  const [attempt, setAttempt] = useState(0);
  useLayoutEffect(() => {
    const timeout = window.setTimeout(() => setStatus("unavailable"), 15000);
    function onStatus(event: MessageEvent) {
      if (event.source !== frame.current?.contentWindow || event.origin !== "null") return;
      if (event.data?.type !== "showonce:proto-lab-status") return;
      const state = event.data.state;
      if (state !== "ready" && state !== "webgl") return;
      window.clearTimeout(timeout);
      setStatus(state);
    }
    window.addEventListener("message", onStatus);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("message", onStatus);
    };
  }, [attempt]);

  const failed = status === "webgl" || status === "unavailable";
  return (
    <section className="proto-workbench" aria-label="3D Workbench">
      {status === "loading" && <p role="status">Loading the 3D workbench…</p>}
      {failed && (
        <div className="panel proto-workbench-fallback">
          <p role="status">
            {status === "webgl"
              ? "The 3D workbench needs WebGL. Enable graphics acceleration or open it in a browser with WebGL."
              : "The 3D workbench could not load."}
          </p>
          <button className="button secondary" onClick={() => {
            setStatus("loading");
            setAttempt((value) => value + 1);
          }}>Retry workbench</button>
          <button className="button secondary" onClick={onGuided}>Open guided view</button>
        </div>
      )}
      <iframe
        key={attempt}
        ref={frame}
        title="Proto Lab 3D Workbench"
        src={starter ? `/proto-lab/?starter=${starter}` : "/proto-lab/"}
        sandbox="allow-scripts allow-downloads"
        allow="camera 'none'; microphone 'none'; geolocation 'none'"
        referrerPolicy="no-referrer"
        hidden={failed}
      />
      <p className="fine">
        Use Save project to keep a JSON file for your next visit. Simulations illustrate
        component behavior and provide starter firmware. Proto Lab by Akash Talole.{" "}
        <a href="/proto-lab/LICENSE.txt" target="_blank" rel="noreferrer">MIT license</a>
      </p>
    </section>
  );
}
