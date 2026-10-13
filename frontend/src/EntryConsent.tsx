import { useState } from "react";

export default function EntryConsent({
  onContinue,
}: {
  onContinue: () => void;
}) {
  const [agreed, setAgreed] = useState(false);
  return (
    <main className="entry-consent">
      <section className="panel" aria-labelledby="entry-title">
        <h1 id="entry-title">Welcome to ShowOnce</h1>
        <p>Before you enter, confirm:</p>
        <label className="check-label">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          I am 18+. Everyone I capture will be 18+ and consent to Google
          processing the camera, screen and audio I share. I will keep private
          information out of view.
        </label>
        <p className="fine">
          Live camera and audio are streamed, not recorded. Conversations are
          saved privately for seven days. Demonstration media may be saved with
          your lesson.
        </p>
        <button
          className="button primary"
          disabled={!agreed}
          onClick={onContinue}
        >
          Continue to ShowOnce
        </button>
      </section>
    </main>
  );
}
