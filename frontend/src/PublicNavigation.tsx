import { useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";

export const topics = [
  { slug: "problem", label: "The Problem" },
  { slug: "solution", label: "Our Solution" },
  { slug: "value", label: "Why ShowOnce" },
  { slug: "ai", label: "How AI Works" },
  { slug: "evidence", label: "Evidence & Testing" },
  { slug: "impact", label: "Impact & Next Steps" },
] as const;
export type Topic = typeof topics[number]["slug"];

export function PublicHeader({ current }: { current?: Topic }) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  return <header className="home-header">
    <a className="home-brand" href="/welcome" aria-label="ShowOnce home">ShowOnce<span>.</span></a>
    <nav aria-label="Homepage navigation">
      <a href={current ? "/welcome#how-it-works" : "#how-it-works"}>How it works</a>
      <div className="explore-navigation" ref={container}
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false); }}
        onKeyDown={event => { if (event.key === "Escape" && open) { event.preventDefault(); setOpen(false); trigger.current?.focus(); } }}>
        <button ref={trigger} className="explore-trigger" aria-expanded={open} aria-controls="explore-topics" onClick={() => setOpen(!open)}>Explore ShowOnce <ChevronDown size={17} /></button>
        <ul id="explore-topics" className="explore-topics" hidden={!open}>
          {topics.map(topic => <li key={topic.slug}><a href={`/about/${topic.slug}`} aria-current={current === topic.slug ? "page" : undefined}>{topic.label}</a></li>)}
        </ul>
      </div>
      <a className="button primary" href="/enter">Open ShowOnce <ArrowRight size={18} /></a>
    </nav>
  </header>;
}

export function TopicNavigation({ current }: { current: Topic }) {
  const index = topics.findIndex(topic => topic.slug === current);
  const previous = topics[index - 1];
  const next = topics[index + 1];
  return <nav className="topic-pagination home-width" aria-label="Explanation topics">
    <div>{previous && <a href={`/about/${previous.slug}`}><span>Previous topic</span>← {previous.label}</a>}</div>
    <div>{next && <a href={`/about/${next.slug}`}><span>Next topic</span>{next.label} →</a>}</div>
  </nav>;
}

export function PublicFooter() {
  return <footer className="home-footer home-width"><a className="home-brand" href="/welcome">ShowOnce<span>.</span></a><a href="/welcome">Back to homepage</a><a href="#top">Back to top ↑</a></footer>;
}
