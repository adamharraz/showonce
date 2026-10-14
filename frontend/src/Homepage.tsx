import { ArrowRight, Video, BookOpen, Mic, Check } from "lucide-react";
import workbench from "./assets/electronics-workbench.png";
import capturePreview from "./assets/homepage/capture.png";
import lessonPreview from "./assets/homepage/lesson.png";
import coachPreview from "./assets/homepage/coach.png";
import "./homepage.css";
import { PublicHeader, PublicFooter } from "./PublicNavigation";

export default function Homepage() {
  const enter = <a className="button primary" href="/enter">Open ShowOnce <ArrowRight size={18} /></a>;
  return <div className="public-home" id="top">
    <a className="skip-link" href="#home-content">Skip to content</a>
    <PublicHeader />
    <main id="home-content" tabIndex={-1}>
      <section className="home-hero home-width">
        <div className="home-hero-copy">
          <p className="home-eyebrow">Learn from what you do</p>
          <h1>Turn your demonstration into a lesson others can <em>practise.</em></h1>
          <p>Show a physical task on camera or share your screen. AI suggests the steps, you review them, and learners practise with guidance.</p>
          <div className="home-actions">{enter}<a className="home-text-link" href="#how-it-works">See how it works ↓</a></div>
        </div>
        <figure className="home-workbench"><img src={workbench} alt="Colourful electronics workbench with a breadboard, LEDs, jumper wires and a microcontroller" /><figcaption>Hands-on skills. On-screen skills. Shared knowledge.</figcaption></figure>
      </section>
      <section className="home-band" id="how-it-works">
        <div className="home-width home-section">
          <p className="home-eyebrow">How it works</p><h2>From “watch me” to “your turn”.</h2>
          <ol className="home-steps">
            <li><span>01</span><h3>Demonstrate</h3><p>Record your camera or screen. Explain what you’re doing as you go.</p></li>
            <li><span>02</span><h3>Review</h3><p>Check the AI-suggested steps, resolve questions, and add missing details.</p></li>
            <li><span>03</span><h3>Share and practise</h3><p>Publish your lesson so learners can follow the steps and practise the task.</p></li>
          </ol>
        </div>
      </section>
      <section className="home-width home-section" aria-labelledby="examples-title">
        <p className="home-eyebrow">Example tasks</p><h2 id="examples-title">A skill at the bench. A skill on screen.</h2>
        <div className="home-examples">
          <article><div className="home-example-art home-led" aria-hidden="true"><img src={workbench} alt="" /></div><div className="home-example-copy"><span>Physical task · Example</span><h3>Connect an LED</h3><p>Demonstrate component placement and explain each connection in a breadboard circuit.</p></div></article>
          <article><div className="home-example-art home-sheet" aria-hidden="true"><div className="sheet-window"><div className="sheet-toolbar">Task: create a chart</div><div className="sheet-content"><div className="sheet-cells"><span>Month</span><span>Total</span><span>Jan</span><span>12</span><span>Feb</span><span>18</span><span>Mar</span><span>24</span></div><div className="sheet-chart"><i /><i /><i /></div></div></div></div><div className="home-example-copy"><span>Screen task · Example</span><h3>Create a spreadsheet chart</h3><p>Share your screen to show how you select data, insert a chart, and label the results.</p></div></article>
        </div>
      </section>
      <section className="home-band" id="possibilities">
        <div className="home-width home-section">
          <p className="home-eyebrow">What you can do</p><h2>One place to teach, practise, and ask.</h2>
          <div className="home-features">
            <article><div className="home-feature-title"><Video /><h3>Teach a task</h3></div><p>Capture your demonstration, review the suggested steps, and publish a lesson.</p><img src={capturePreview} alt="ShowOnce capture setup with webcam, phone camera and screen sharing choices" loading="lazy" /></article>
            <article><div className="home-feature-title"><BookOpen /><h3>Practise a lesson</h3></div><p>Open a published lesson, follow its reviewed steps, and check your progress.</p><img src={lessonPreview} alt="ShowOnce published lesson interface with steps and a practice action; example content" loading="lazy" /><small>Interface preview · example lesson</small></article>
            <article><div className="home-feature-title"><Mic /><h3>Get live help</h3></div><p>Share your camera or screen and ask questions by voice or text as you work.</p><img src={coachPreview} alt="ShowOnce live help setup with webcam and screen sharing options" loading="lazy" /></article>
          </div>
        </div>
      </section>
      <section className="home-width home-section home-ai" aria-labelledby="ai-title">
        <div><p className="home-eyebrow">How AI helps</p><h2 id="ai-title">A starting point you can review. Help you can ask for.</h2></div>
        <div><p>AI uses the demonstration you share to suggest lesson steps. During live help, it uses camera or screen context and your questions to offer guidance.</p><p className="home-review-note"><Check size={22} /> Instructors review and publish lessons.</p><p className="home-note">AI can miss details or make mistakes. Check suggestions against your task; camera guidance does not verify wiring or electrical continuity.</p></div>
      </section>
      <section className="home-closing"><h2>Ready to show what you know?</h2><p>Start with one task. Make it easier for someone else to learn.</p>{enter}</section>
    </main>
    <PublicFooter />
  </div>;
}
