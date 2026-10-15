import { ArrowRight } from "lucide-react";
import { PublicHeader, PublicFooter, TopicNavigation, topics, type Topic } from "./PublicNavigation";
import capturePreview from "./assets/homepage/capture.png";
import lessonPreview from "./assets/homepage/lesson.png";
import coachPreview from "./assets/homepage/coach.png";
import workbench from "./assets/electronics-workbench.png";
import "./homepage.css";

const introductions = {
  problem: { title: "Watching a task is only the beginning.", text: "A demonstration can make a task look straightforward. Repeating it alone means remembering the sequence, noticing small details, and deciding what to do when something looks different." },
  solution: { title: "Share the steps behind the skill.", text: "ShowOnce turns a camera or screen demonstration into suggested lesson steps for an instructor to review. Learners can then practise the published task and ask for live help." },
  value: { title: "Keep the demonstration, steps, and practice together.", text: "ShowOnce connects the instructor’s example to a reviewed lesson and a place to practise. Its value is the workflow: capture once, check the details, and share the result." },
  ai: { title: "AI helps turn what you show into steps.", text: "Demonstrations contain visual details, actions, and explanations. ShowOnce uses multimodal AI to suggest structured instructions and offer guidance using the context a learner shares." },
  impact: { title: "Help knowledge travel beyond one demonstration.", text: "The aim is to help instructors share practical knowledge and give learners a clear starting point for independent practice. The next step is to measure whether that happens in real tasks." },
};

function TopicContent({ topic }: { topic: Exclude<Topic, "evidence"> }) {
  if (topic === "problem") return <>
    <section className="home-band"><div className="home-width home-section"><h2>Two sides of the same learning gap.</h2><div className="evidence-feedback">
      <article><h3>For instructors</h3><p>Turning a demonstration into a written guide takes another pass: identify the steps, explain hidden choices, and describe what success looks like.</p></article>
      <article><h3>For learners</h3><p>A recording shows what happened. A learner may still need help finding the relevant step, understanding a difference, or working out why their result does not match.</p></article>
    </div></div></section>
    <section className="home-width home-section"><p className="home-eyebrow">Example situations</p><h2>Small details can change the result.</h2><div className="home-examples">
      <article><div className="home-example-art home-led"><img src={workbench} alt="Breadboard and LEDs on the ShowOnce workbench" /></div><div className="home-example-copy"><h3>Connecting an LED</h3><p>A learner can see an LED on a breadboard but still be unsure about its orientation, which holes connect, or which connection the instructor means.</p></div></article>
      <article><div className="home-example-copy"><p className="home-eyebrow">Screen task</p><h3>Creating a spreadsheet chart</h3><p>A quick demonstration may skip why a particular data range was selected or which chart setting changed. Those choices matter when the learner uses a different table.</p></div></article>
    </div><p className="home-note about-source">These examples describe the problem ShowOnce addresses. Our small survey records reported difficulties and interest; it does not establish how common the problem is across a wider population. <a href="/about/evidence">Read the survey results →</a></p></section>
  </>;
  if (topic === "solution") return <>
    <section className="home-band"><div className="home-width home-section"><h2>A demonstration becomes a reviewed lesson.</h2><ol className="solution-flow">
      <li><h3>Capture</h3><p>Use a webcam, paired phone camera, or screen sharing. Narrate the choices that are difficult to see.</p></li>
      <li><h3>Generate draft steps</h3><p>AI suggests instructions from the shared demonstration and identifies details needing clarification.</p></li>
      <li><h3>Review</h3><p>The instructor checks the instructions, resolves questions, and corrects missing or unclear details.</p></li>
      <li><h3>Publish</h3><p>Publish a reviewed version for learners to open and follow.</p></li>
      <li><h3>Practise</h3><p>Follow the approved steps and check progress. Ask for live help when useful.</p></li>
    </ol></div></section>
    <section className="home-width home-section"><h2>The tools behind the workflow.</h2><div className="home-features">
      <article><h3>Choose a capture source</h3><p>Teach physical tasks or screen-based tasks.</p><img src={capturePreview} alt="ShowOnce capture source choices" loading="lazy" /></article>
      <article><h3>Follow a published lesson</h3><p>Use reviewed instructions and expected outcomes.</p><img src={lessonPreview} alt="Published lesson interface showing an example spreadsheet task" loading="lazy" /><small>Interface preview · example lesson</small></article>
      <article><h3>Ask for live help</h3><p>Share your current camera or screen context and ask by voice or text.</p><img src={coachPreview} alt="ShowOnce live help setup" loading="lazy" /></article>
    </div></section>
  </>;
  if (topic === "value") return <>
    <section className="home-band"><div className="home-width home-section"><h2>Different ways to share a task.</h2><div className="comparison-scroll" role="region" aria-label="Learning workflow comparison" tabIndex={0}><table className="about-comparison"><thead><tr><th scope="col">Workflow</th><th scope="col">What it provides</th><th scope="col">What the creator or learner does</th></tr></thead><tbody>
      <tr><th scope="row">Watch a tutorial</th><td>A visual demonstration that can be replayed.</td><td>Find the relevant moment and interpret it for their own task.</td></tr>
      <tr><th scope="row">Write instructions manually</th><td>A guide the author can organise and edit.</td><td>Write the steps, select references, and explain expected outcomes.</td></tr>
      <tr><th scope="row">Use ShowOnce</th><td>A demonstration, AI-suggested draft, instructor-reviewed lesson, practice flow, and optional live help.</td><td>Check and correct the draft before publishing, then evaluate suggestions against the actual task.</td></tr>
    </tbody></table></div><p className="home-note about-source">This compares typical workflows, not every tutorial platform. Faster preparation or better learning with ShowOnce has not yet been demonstrated.</p></div></section>
    <section className="home-width home-section"><h2>What makes the workflow useful.</h2><div className="home-steps">
      <article><h3>Start from an example</h3><p>The demonstration supplies the starting material for a draft lesson.</p></article><article><h3>Keep instructor judgment</h3><p>A person reviews the details and approves the published instructions.</p></article><article><h3>Continue into practice</h3><p>Learners can follow the lesson and ask questions using their current context.</p></article>
    </div></section>
  </>;
  if (topic === "ai") return <>
    <section className="home-band"><div className="home-width home-section"><h2>Two AI roles in the current app.</h2><div className="evidence-feedback">
      <article><p className="home-eyebrow">Lesson processing</p><h3>Gemini 3.5 Flash-Lite</h3><p><strong>Input:</strong> shared demonstration frames, narration where available, task context, and instructor clarifications.</p><p><strong>Output:</strong> suggested steps, questions, and checkpoint feedback for the application’s review and practice flows.</p><p className="home-note">Configured model: <code>gemini-3.5-flash-lite</code></p></article>
      <article><p className="home-eyebrow">Live help</p><h3>Gemini 3.8 Live</h3><p><strong>Input:</strong> shared camera or screen frames, microphone audio or typed questions, and lesson context when selected.</p><p><strong>Output:</strong> conversational guidance by voice and text while the learner works.</p><p className="home-note">Configured model: <code>gemini-3.8-live</code></p></article>
    </div><p className="home-note">Model names describe the repository configuration checked on 14 October 2026. Actual access depends on the configured service.</p></div></section>
    <section className="home-width home-section home-ai"><div><p className="home-eyebrow">Why AI is relevant</p><h2>Actions and questions need context.</h2></div><div><p>A demonstration combines visible actions and spoken explanations. Multimodal AI can use those inputs to propose a structured draft and respond to a question about the current view.</p><p>Instructors remain responsible for reviewing and publishing lessons. Learners should check guidance against the task and ask for clarification when something is unclear.</p></div></section>
    <section className="home-band"><div className="home-width home-section"><h2>What a camera cannot establish.</h2><p>Hidden settings, obscured parts, and ambiguous images can lead to missed details or incorrect suggestions. Visual guidance does not verify a physical board’s pinout, electrical continuity, or safe operation.</p><p>Real task accuracy and learning gains still need evaluation. <a href="/about/evidence">See the evidence and limits →</a></p></div></section>
  </>;
  return <>
    <section className="home-band"><div className="home-width home-section"><h2>Who could benefit.</h2><div className="evidence-feedback">
      <article><h3>Instructors and trainers</h3><p>A way to turn demonstrated knowledge into reusable, reviewed lessons. Preparation time and review effort are outcomes to measure.</p></article>
      <article><h3>Learners</h3><p>A place to follow steps, compare expected outcomes, and ask questions while practising. Independent understanding and completion are outcomes to measure.</p></article>
    </div></div></section>
    <section className="home-width home-section"><p className="home-eyebrow">Proposed pilot · not completed</p><h2>Start with two tasks we can observe.</h2><div className="evidence-feedback">
      <article><h3>One physical task</h3><p>Use an instructor-reviewed LED breadboard task with appropriate supervision. Record completed steps, errors, questions, and time.</p></article>
      <article><h3>One screen task</h3><p>Create a spreadsheet chart from a small table. Check the selected data, chart output, completion time, and the learner’s explanation.</p></article>
    </div><h3>Measure what changes</h3><p>Compare results with the same tasks taught using existing instructions. Record task completion, errors, time, instructor preparation and review effort, and participant feedback. Ask learners to explain and repeat the task.</p><p className="home-note">The pilot design, participant count, and recruitment are still to be agreed. No improvement is claimed in advance.</p></section>
    <section className="home-band"><div className="home-width home-section"><h2>Next development priorities.</h2><ol className="home-steps">
      <li><span>01</span><h3>Test real use</h3><p>Evaluate task accuracy, response time, camera setup, and interruptions using real devices.</p></li>
      <li><span>02</span><h3>Act on feedback</h3><p>Improve unclear steps and setup friction. Investigate language needs, including the request for Bahasa Melayu support.</p></li>
      <li><span>03</span><h3>Assess broader adoption</h3><p>Measure usage cost, service reliability, accessibility, and instructor effort before expanding to more tasks or users.</p></li>
    </ol></div></section>
  </>;
}

export default function AboutPage({ topic }: { topic: Exclude<Topic, "evidence"> }) {
  const intro = introductions[topic];
  return <div className="public-home" id="top"><a className="skip-link" href="#about-content">Skip to content</a><PublicHeader current={topic} />
    <main id="about-content" tabIndex={-1}>
      <section className="home-width home-section evidence-intro"><p className="home-eyebrow">{topics.find(item => item.slug === topic)?.label}</p><h1>{intro.title}</h1><p>{intro.text}</p></section>
      <TopicContent topic={topic} />
      <section className="home-closing"><h2>Explore the working app.</h2><a className="button primary" href="/enter">Open ShowOnce <ArrowRight size={18} /></a></section>
    </main><TopicNavigation current={topic} /><PublicFooter />
  </div>;
}
