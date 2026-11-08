import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { LabPart } from "./ElectronicsLab";

export default function PartQuestion({
  part,
  endpoint,
  onHighlight,
}: {
  part: LabPart;
  endpoint: string;
  onHighlight: (part: LabPart) => void;
}) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  async function ask() {
    if (busy) return;
    setBusy(true);
    setError("");
    setAnswer("");
    try {
      const result = await api<{ answer: string; highlight?: LabPart }>(
        endpoint,
        "POST",
        {
          part,
          question: question.trim() || `What does the ${part} do in this step?`,
        },
      );
      if (!active.current) return;
      setAnswer(result.answer);
      if (result.highlight) onHighlight(result.highlight);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="part-question">
      <label>
        Question about the model
        <input
          value={question}
          maxLength={500}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={`What does the ${part} do in this step?`}
        />
      </label>
      <button
        className="button secondary"
        disabled={busy}
        onClick={() => void ask()}
      >
        {busy ? "Asking…" : "Ask about this part"}
      </button>
      {answer && <p role="status">{answer}</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
