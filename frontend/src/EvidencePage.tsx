import { ArrowRight, CheckCircle2 } from "lucide-react";
import "./homepage.css";
import { PublicHeader, PublicFooter, TopicNavigation } from "./PublicNavigation";

export default function EvidencePage() {
  return <div className="public-home" id="top">
    <a className="skip-link" href="#evidence-content">Skip to content</a>
    <PublicHeader current="evidence" />
    <main id="evidence-content" tabIndex={-1}>
      <section className="home-width home-section evidence-intro">
        <p className="home-eyebrow">Evidence & Testing</p>
        <h1>Early feedback. Clear next steps.</h1>
        <p>Ten respondents shared how they prepare and learn hands-on tasks, whether they would use ShowOnce, and how much they trust AI checking. Their feedback helps identify what to test next.</p>
        <p className="home-note">Preliminary survey: 6 students and 4 teachers. This small sample does not establish learning gains, AI accuracy, or time saved.</p>
      </section>
      <section className="home-band" id="survey"><div className="home-width home-section">
        <p className="home-eyebrow">What respondents said</p><h2>Interest in the idea, with reservations about AI.</h2>
        <div className="evidence-metrics">
          <article><strong>8 of 10</strong><h3>Would use ShowOnce</h3><p>4 answered “Definitely” and 4 “Probably”. One was unsure and one answered “Probably not”.</p></article>
          <article><strong>3.3 / 5</strong><h3>Average getting-stuck score</h3><p>Reported difficulty when learning hands-on tasks. The scale runs from 1 (never) to 5 (very often).</p></article>
          <article><strong>2 of 4</strong><h3>Teachers report 3+ hours</h3><p>One reported 3–5 hours preparing a lesson and one over 5 hours. The other two reported 1–2 hours.</p></article>
        </div>
        <div className="evidence-trust"><h3>Would you trust AI to check work against approved steps?</h3><ul><li><strong>4 of 10</strong><span>Yes</span></li><li><strong>5 of 10</strong><span>Partly</span></li><li><strong>1 of 10</strong><span>No</span></li></ul><p>Most respondents expressed some reservation. Instructor review and clear limits remain central to the design.</p></div>
      </div></section>
      <section className="home-width home-section">
        <p className="home-eyebrow">Feedback into design</p><h2>What we need to pay attention to.</h2>
        <div className="evidence-feedback">
          <article><h3>Missed steps and lesson approval</h3><p>Responses raised concerns about AI missing an important step and who approves the lesson. ShowOnce requires instructor review before publishing.</p></article>
          <article><h3>Setup and questions</h3><p>Responses mentioned setup time, phone-camera lighting, and the ability to pause and ask questions. Test the complete flow on real devices, including live help.</p></article>
          <article><h3>Safety, privacy, and language</h3><p>Responses also raised hardware safety, recorded faces, and Bahasa Melayu support. These are priorities to investigate; the survey does not verify safety or language support.</p></article>
          <article><h3>Understanding and human support</h3><p>Some respondents worried about copying without understanding or preferred a live lecturer. Evaluate whether learners can explain and repeat the task independently.</p></article>
        </div>
        <p className="home-note">Concern groups summarise the ten open-text answers. They are not ranked by frequency.</p>
      </section>
      <section className="home-band"><div className="home-width home-section">
        <p className="home-eyebrow">Software verification</p><h2>What the technical checks establish.</h2>
        <div className="evidence-feedback">
          <article><h3><CheckCircle2 size={21} /> Automated checks</h3><p>On 14 October 2026, 88 backend tests and 9 frontend tests passed, together with the production build. These check software behaviour.</p></article>
          <article><h3><CheckCircle2 size={21} /> Browser workflows</h3><p>Local fixture checks passed capture, review, publishing, export, practice, and live-help controls. Homepage checks covered entry, consent, returning sessions, navigation, and layouts from 320 to 1440 pixels.</p></article>
        </div>
        <p className="home-note">Browser fixtures use synthetic media and test-only model results. Passing these checks does not measure real AI accuracy or participant learning.</p>
        <h3>Documented real AI exchanges</h3>
        <p>The project’s 12 October 2026 development record reports real Gemini calls using synthetic images, a synthetic camera, and locally generated speech. The model described a visible shape and returned voice and a transcript.</p>
        <p className="home-note">These short exchanges demonstrate an AI connection with synthetic inputs. They do not establish physical-circuit accuracy, sustained conversation quality, or learning outcomes. Source: <a href="https://github.com/adamharraz/showonce/blob/21f2a10/docs/LIVE_COACH.md#verification-and-limitations">Live Coach verification record</a>.</p>
      </div></section>
      <section className="home-width home-section home-ai">
        <div><p className="home-eyebrow">Next validation</p><h2>Test the task, not just the interface.</h2></div>
        <div><p>Run a pilot with one physical task and one screen task. Measure completion, errors, time, and participant feedback. Check whether learners can explain the steps and repeat the task.</p><p className="home-note">Task accuracy, response latency under real use, learning gains, and time saved remain unmeasured in this survey.</p><p className="home-note">Source: owner-supplied ShowOnce Validation Survey, Responses rows 2–11, confirmed as collected responses. Collection date and recruitment method were not supplied. Respondent names are not published.</p></div>
      </section>
      <section className="home-closing"><h2>See the workflow for yourself.</h2><a className="button primary" href="/enter">Open ShowOnce <ArrowRight size={18} /></a></section>
    </main>
    <TopicNavigation current="evidence" /><PublicFooter />
  </div>;
}
