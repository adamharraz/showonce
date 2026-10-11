import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Download,
  Eye,
  FileText,
  GraduationCap,
  Layers3,
  LogOut,
  Monitor,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Settings2,
  Smartphone,
  Square,
  Trash2,
  Video,
  Wifi,
  X,
  AlertCircle,
  BookOpen,
  Clock3,
  Mic,
  ScanLine,
} from "lucide-react";
import {
  api,
  download,
  getToken,
  setToken,
  wsURL,
  outcomeLabels,
  hostedAuth,
  restoreHostedAuth,
  logoutHostedAuth,
  type Config,
  type User,
  type Session,
  type Lesson,
  type Draft,
  type Step,
  type Question,
  type LessonCard,
  type Version,
  type Observation,
  type Assessment,
  type Job,
  type Source,
} from "./api";
import { acquire, useCapture } from "./capture";
import { unresolved, reorder } from "./review";

function usePath() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const handler = () => setPath(location.pathname);
    addEventListener("popstate", handler);
    return () => removeEventListener("popstate", handler);
  }, []);
  const navigate = useCallback((next: string) => {
    history.pushState({}, "", next);
    setPath(next);
  }, []);
  return [path, navigate] as const;
}
const time = (seconds: number) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
function Banner({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return (
    <div className={`banner ${tone}`}>
      <AlertCircle size={17} />
      <div>{children}</div>
    </div>
  );
}
function Empty({
  title,
  children,
  icon = <BookOpen size={30} />,
}: {
  title: string;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function Evidence({ id, label }: { id: string; label?: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let alive = true;
    let objectURL = "";
    fetch("/api/frames/" + id, {
      headers: { Authorization: "Bearer " + getToken() },
    })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        objectURL = URL.createObjectURL(await r.blob());
        if (alive) setUrl(objectURL);
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (objectURL) URL.revokeObjectURL(objectURL);
    };
  }, [id]);
  return (
    <figure className="evidence">
      {url ? (
        <img src={url} alt={label || "Demonstration reference screenshot"} />
      ) : (
        <div className="image-placeholder">
          <ScanLine size={20} /> Reference unavailable
        </div>
      )}
      {label && <figcaption>{label}</figcaption>}
    </figure>
  );
}

function Login({
  config,
  onLogin,
}: {
  config: Config;
  onLogin: (user: User) => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  async function local(role: string) {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ token: string; user: User }>(
        "/auth/local",
        "POST",
        { role },
      );
      setToken(result.token);
      onLogin(result.user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function signIn() {
    setBusy(true);
    setError("");
    try {
      const client = await hostedAuth(config);
      const { data, error } = await client.auth.signInWithPassword({
        email,
        password,
      });
      if (error || !data.session) throw error || new Error("Sign in failed");
      setToken(data.session.access_token);
      onLogin(await api<User>("/me"));
    } catch (e) {
      setToken("");
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-wrap">
      <div className="login-panel">
        <Logo />

        <h1>Sign in</h1>
        <p className="muted">
          Create and practice lessons for physical or screen-based tasks.
        </p>
        {config.local_login ? (
          <>
            <div className="local-note">
              <strong>Local development</strong>
              <p>Choose a role for this local session.</p>
            </div>
            <button
              disabled={busy}
              className="button primary full"
              onClick={() => local("instructor")}
            >
              Enter as instructor
            </button>
            <button
              disabled={busy}
              className="button secondary full"
              onClick={() => local("student")}
            >
              Enter as student <GraduationCap size={17} />
            </button>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void signIn();
            }}
          >
            <label>
              Email
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button disabled={busy} className="button primary full">
              {busy ? "Signing in…" : "Sign in"}
            </button>
            <p className="fine">
              Accounts are provided by your instructor. Public registration is
              disabled.
            </p>
          </form>
        )}
        {error && <Banner tone="error">{error}</Banner>}
        <div className="login-footer">
          <span className="dot" /> For consenting university participants aged
          18+
        </div>
      </div>
    </div>
  );
}
function Logo() {
  return (
    <div className="logo">
      <span className="logo-mark">
        <span />
        <span />
        <span />
        <span />
      </span>
      ShowOnce<span className="logo-period">.</span>
    </div>
  );
}

function Library({
  user,
  navigate,
}: {
  user: User;
  navigate: (path: string) => void;
}) {
  const [lessons, setLessons] = useState<LessonCard[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "draft" | "published">("all");
  const [query, setQuery] = useState("");
  const [taskType, setTaskType] = useState<"all" | "physical" | "screen">(
    "all",
  );
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [savedLessons, savedSessions] = await Promise.all([
        api<LessonCard[]>("/lessons"),
        api<Session[]>("/sessions"),
      ]);
      setLessons(savedLessons);
      setSessions(savedSessions);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const visibleLessons = lessons.filter(
    (lesson) =>
      (filter === "all" ||
        (filter === "published"
          ? !!lesson.latest_version
          : !lesson.latest_version)) &&
      (taskType === "all" ||
        (taskType === "screen"
          ? lesson.source === "screen"
          : lesson.source === "camera" || lesson.source === "phone")) &&
      `${lesson.title} ${lesson.summary}`
        .toLowerCase()
        .includes(query.toLowerCase().trim()),
  );
  const activePractice = sessions.find(
    (s) => s.mode === "practice" && s.state !== "finished",
  );
  const featured =
    lessons.find((l) => l.id === activePractice?.lesson_id) ||
    lessons.find((l) => !!l.latest_version);
  const drafts = lessons.filter((l) => l.owned && !l.latest_version);
  return (
    <>
      <div className="page-heading library-heading">
        <div>
          <h1>Your lessons</h1>
        </div>
        {user.role === "instructor" && (
          <button
            className="button primary"
            onClick={() => navigate("/studio")}
          >
            <Plus size={18} /> Record a demonstration
          </button>
        )}
      </div>
      {error && (
        <Banner tone="error">
          {error}{" "}
          <button className="text-button" onClick={() => void load()}>
            Retry loading
          </button>
        </Banner>
      )}
      {!loading && !error && featured && (
        <section
          className="practice-feature"
          aria-labelledby="continue-heading"
        >
          <h2 id="continue-heading">
            {activePractice ? "Continue practising" : "Ready to practise"}
          </h2>
          <div className="practice-feature-body">
            <div className="feature-media">
              <LessonPreview lesson={featured} />
              {featured.evidence_ids.length > 1 && (
                <div
                  className="frame-strip"
                  aria-label="Demonstration reference frames"
                >
                  {featured.evidence_ids.map((id, i) => (
                    <Evidence key={id} id={id} label={`Reference ${i + 1}`} />
                  ))}
                </div>
              )}
            </div>
            <div className="feature-copy">
              <h3>{activePractice?.title || featured.title}</h3>
              <p className="feature-status">
                {activePractice
                  ? `Saved session · ${activePractice.state.replaceAll("_", " ")}`
                  : `${featured.step_count} ${featured.step_count === 1 ? "step" : "steps"} · Published v${featured.latest_version}`}
              </p>
              {featured.summary && <p>{featured.summary}</p>}
              <button
                className="button primary"
                onClick={() =>
                  navigate(
                    activePractice
                      ? `/practice/${activePractice.id}`
                      : `/lesson/${featured.id}`,
                  )
                }
              >
                <Play size={17} />
                {activePractice ? "Resume practice" : "Open lesson"}
              </button>
            </div>
          </div>
        </section>
      )}
      <div
        className={
          "library-layout " + (drafts.length && !error ? "has-review" : "")
        }
      >
        <section className="library-main" aria-labelledby="library-title">
          <div className="library-section-heading">
            <h2 id="library-title">Lesson library</h2>
            <label className="lesson-search">
              <span className="sr-only">Search lessons</span>
              <input
                type="search"
                placeholder="Search lessons"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </div>
          <div className="task-filters" role="group" aria-label="Task type">
            {(["all", "physical", "screen"] as const).map((type) => (
              <button
                key={type}
                aria-pressed={taskType === type}
                onClick={() => setTaskType(type)}
              >
                {type === "all"
                  ? "All tasks"
                  : type === "physical"
                    ? "Physical tasks"
                    : "On screen"}
              </button>
            ))}
          </div>
          <div className="library-toolbar">
            <div
              className="lesson-filters"
              role="group"
              aria-label="Filter lessons"
            >
              {(
                [
                  "all",
                  "published",
                  ...(user.role === "instructor" ? ["draft"] : []),
                ] as const
              ).map((value) => (
                <button
                  key={value}
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value as typeof filter)}
                >
                  {value === "all"
                    ? "All lessons"
                    : value === "published"
                      ? "Published"
                      : "Drafts"}
                  {!loading && (
                    <span>
                      {
                        lessons.filter(
                          (l) =>
                            value === "all" ||
                            (value === "published"
                              ? !!l.latest_version
                              : !l.latest_version),
                        ).length
                      }
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
          {loading ? (
            <div className="library-loading" role="status">
              Loading your lessons…
            </div>
          ) : error ? null : !visibleLessons.length ? (
            <div className="library-empty">
              <Empty
                title={
                  lessons.length
                    ? "No lessons in this view"
                    : user.role === "instructor"
                      ? "A lesson begins with something you know."
                      : "Your next lesson is on its way."
                }
              >
                {lessons.length
                  ? "Try another search or filter."
                  : user.role === "instructor"
                    ? "Record a physical task or share your screen. You review the steps before anyone practices."
                    : "Your instructor's published lessons will appear here."}
              </Empty>
            </div>
          ) : (
            <div className="lesson-grid">
              {visibleLessons.map((l) => (
                <button
                  className="lesson-card"
                  key={l.id}
                  onClick={() =>
                    navigate(
                      l.owned && !l.latest_version
                        ? "/review/" + l.id
                        : "/lesson/" + l.id,
                    )
                  }
                >
                  <span className="lesson-thumbnail">
                    <LessonPreview lesson={l} />
                  </span>
                  <div className="lesson-card-top">
                    <span
                      className={
                        "badge " + (!l.latest_version ? "amber" : "green")
                      }
                    >
                      {l.latest_version
                        ? "Published · v" + l.latest_version
                        : "Draft"}
                    </span>
                  </div>
                  <h3>{l.title}</h3>
                  <p>
                    {l.summary ||
                      (l.source === "screen"
                        ? "Screen demonstration"
                        : l.source
                          ? "Physical demonstration"
                          : "Demonstration")}
                  </p>
                  <div className="lesson-card-bottom">
                    <span>
                      <Layers3 size={14} /> {l.step_count}{" "}
                      {l.step_count === 1 ? "step" : "steps"}
                    </span>
                    <ArrowRight size={17} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
        {!!drafts.length && !loading && !error && (
          <aside className="review-queue" aria-labelledby="review-queue-title">
            <h2 id="review-queue-title">In review</h2>
            {drafts.slice(0, 3).map((l) => (
              <button
                key={l.id}
                className="review-queue-entry"
                onClick={() => navigate(`/review/${l.id}`)}
              >
                <span className="lesson-thumbnail">
                  <LessonPreview lesson={l} />
                </span>
                <span>
                  <strong>{l.title}</strong>
                  <small>
                    {l.unresolved_count
                      ? `${l.unresolved_count} ${l.unresolved_count === 1 ? "question" : "questions"} to resolve`
                      : "Ready for your review"}
                  </small>
                  <span className="review-link">Review draft</span>
                </span>
              </button>
            ))}
          </aside>
        )}
      </div>
      {!!sessions.filter(
        (s) =>
          s.mode === "practice" || !lessons.some((l) => l.id === s.lesson_id),
      ).length && (
        <>
          <div className="section-heading">
            <h2>Recent sessions</h2>
          </div>
          <div className="panel session-list">
            {sessions
              .filter(
                (s) =>
                  s.mode === "practice" ||
                  !lessons.some((l) => l.id === s.lesson_id),
              )
              .slice(0, 5)
              .map((s) => (
                <button
                  key={s.id}
                  onClick={() =>
                    navigate(
                      (s.mode === "teach" ? "/studio/" : "/practice/") + s.id,
                    )
                  }
                >
                  <span className="stat-icon teal">
                    <Video size={18} />
                  </span>
                  <div>
                    <strong>{s.title}</strong>
                    <small>
                      {new Date(s.created_at).toLocaleString()} ·{" "}
                      {s.state.replaceAll("_", " ")}
                    </small>
                  </div>
                  <ArrowRight size={17} />
                </button>
              ))}
          </div>
        </>
      )}
    </>
  );
}

function LessonPreview({ lesson }: { lesson: LessonCard }) {
  return lesson.evidence_ids[0] ? (
    <Evidence id={lesson.evidence_ids[0]} />
  ) : (
    <span className="lesson-preview-empty">
      <Video size={24} />
      <span>No reference image</span>
    </span>
  );
}

function SourcePicker({
  value,
  onChange,
}: {
  value: Source;
  onChange: (s: Source) => void;
}) {
  return (
    <div className="source-picker">
      {(
        [
          ["camera", Video, "Webcam", "A hands-on demonstration"],
          ["phone", Smartphone, "Phone camera", "A closer view of your work"],
          ["screen", Monitor, "Share screen", "A software demonstration"],
        ] as const
      ).map(([s, Icon, title, desc]) => (
        <button
          aria-pressed={value === s}
          className={value === s ? "selected" : ""}
          key={s}
          onClick={() => onChange(s)}
        >
          <Icon size={22} />
          <strong>{title}</strong>
          <span>{desc}</span>
          {value === s && <CheckCircle2 className="source-check" size={17} />}
        </button>
      ))}
    </div>
  );
}

function Live({
  config,
  navigate,
  id,
  practice,
}: {
  config: Config;
  navigate: (p: string) => void;
  id?: string;
  practice?: Version;
}) {
  const [source, setSource] = useState<Source>("camera");
  const [microphone, setMicrophone] = useState(true);
  const [consent, setConsent] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const [observations, setObservations] = useState<Observation[]>([]);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState("");
  const [phoneURL, setPhoneURL] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [frameCount, setFrameCount] = useState(0);
  const socket = useRef<WebSocket | null>(null);
  const reconnect = useRef(0);
  const unmounted = useRef(false);
  const connectRef = useRef<(s: Session) => void>(() => {});
  const finishWaiter = useRef<{
    resolve: () => void;
    reject: () => void;
  } | null>(null);
  const limitStopped = useRef(false);
  const send = useCallback((data: unknown) => {
    if (socket.current?.readyState === WebSocket.OPEN)
      socket.current.send(JSON.stringify(data));
  }, []);
  const getElapsed = () =>
    Math.max(
      0,
      Date.now() -
        Date.parse(sessionRef.current?.created_at || new Date().toISOString()),
    );
  const capture = useCapture(
    send,
    getElapsed,
    connected && session?.state === "capturing",
    () => {
      send({ type: "control", action: "pause" });
      setNotice("Capture ended. Resume with a new camera or screen selection.");
    },
  );
  const captureStopRef = useRef(capture.stop);
  captureStopRef.current = capture.stop;
  const connect = useCallback(
    (s: Session) => {
      const ws = new WebSocket(wsURL(s.id));
      socket.current = ws;
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "authenticate", token: getToken() }));
        setConnected(true);
      };
      ws.onmessage = (e) => {
        const message = JSON.parse(e.data);
        if (message.type === "status") {
          sessionRef.current = message.session;
          setSession(message.session);
          if (message.session.state === "finished") {
            captureStopRef.current();
            finishWaiter.current?.resolve();
          }
        }
        if (message.type === "observations")
          setObservations(message.observations);
        if (
          message.type === "assessment" &&
          message.assessment.step_id === sessionRef.current?.step_id &&
          (message.assessment.step_revision || 0) ===
            (sessionRef.current?.step_revision || 0)
        )
          setAssessment(message.assessment);
        if (message.type === "frame_saved") setFrameCount((n) => n + 1);
        if (message.type === "notice") setNotice(message.message);
        if (message.type === "error") setError(message.message);
        if (message.type === "job") {
          setJob(message.job);
          if (message.job.state === "complete")
            navigate("/review/" + message.job.lesson_id);
        }
      };
      ws.onclose = () => {
        finishWaiter.current?.reject();
        setConnected(false);
        if (
          !unmounted.current &&
          sessionRef.current?.state !== "finished" &&
          reconnect.current < 1
        ) {
          reconnect.current++;
          setNotice(
            "Connection interrupted. Reconnecting once; any capture gap will be flagged.",
          );
          setTimeout(() => {
            if (!unmounted.current) connectRef.current(s);
          }, 1500);
        } else if (
          !unmounted.current &&
          sessionRef.current?.state !== "finished"
        ) {
          setNotice(
            "Connection interrupted. Saved work is preserved. Reconnect to continue.",
          );
        }
      };
    },
    [navigate],
  );
  connectRef.current = connect;
  useEffect(() => {
    unmounted.current = false;
    const interval = setInterval(() => {
      if (sessionRef.current) setElapsed(Math.floor(getElapsed() / 1000));
      send({ type: "ping" });
    }, 10000);
    const timer = setInterval(() => {
      if (sessionRef.current) setElapsed(Math.floor(getElapsed() / 1000));
      if (
        sessionRef.current &&
        !limitStopped.current &&
        getElapsed() >= (practice ? 600000 : 300000)
      ) {
        limitStopped.current = true;
        captureStopRef.current();
        send({ type: "control", action: "finish" });
        setNotice(
          "The session time limit was reached. Capture stopped; received evidence is being saved.",
        );
      }
    }, 1000);
    return () => {
      unmounted.current = true;
      clearInterval(interval);
      clearInterval(timer);
      socket.current?.close();
    };
  }, [send]);
  useEffect(() => {
    if (!id) return;
    void api<{
      session: Session;
      observations: Observation[];
      assessments: Assessment[];
      job: Job | null;
    }>("/sessions/" + id)
      .then((result) => {
        setSession(result.session);
        setSource(result.session.source);
        setObservations(result.observations);
        setJob(result.job);
        setAssessment(result.assessments.at(-1) || null);
        if (result.job?.state === "complete")
          navigate("/review/" + result.job.lesson_id);
        else if (result.session.state !== "finished")
          connectRef.current(result.session);
      })
      .catch((e) => setError(e.message));
  }, [id]);
  useEffect(() => {
    if (!session || practice) return;
    const timer = setInterval(() => {
      void api<{ job: Job | null }>("/sessions/" + session.id)
        .then((r) => {
          setJob(r.job);
          if (r.job?.state === "complete")
            navigate("/review/" + r.job.lesson_id);
        })
        .catch(() => {});
    }, 2500);
    return () => clearInterval(timer);
  }, [session?.id, practice]);
  async function pair(s: Session) {
    try {
      const t = await api<{ ticket: string; url: string }>(
        "/sessions/" + s.id + "/capture-ticket",
        "POST",
      );
      const url =
        t.url + `?mic=${microphone && !practice ? "1" : "0"}#` + t.ticket;
      setPhoneURL(url);
      const QRCode = await import("qrcode");
      setQr(
        await QRCode.toDataURL(url, {
          margin: 1,
          width: 200,
          color: { dark: "#302546", light: "#ffffff" },
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function start() {
    setError("");
    setBusy(true);
    let media: MediaStream | null = null;
    try {
      if (source !== "phone")
        media = await acquire(source, microphone && !practice);
      const s = await api<Session>("/sessions", "POST", {
        mode: practice ? "practice" : "teach",
        source,
        ...(practice
          ? { lesson_id: practice.lesson_id, version: practice.version }
          : {}),
      });
      setSession(s);
      connectRef.current(s);
      if (media) capture.setStream(media);
      if (source === "phone") await pair(s);
    } catch (e) {
      media?.getTracks().forEach((t) => t.stop());
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function resume() {
    setError("");
    try {
      if (!connected && session) {
        reconnect.current = 0;
        connectRef.current(session);
        await new Promise((r) => setTimeout(r, 600));
      }
      if (source !== "phone" && !capture.stream)
        capture.setStream(await acquire(source, microphone && !practice));
      send({ type: "control", action: "resume" });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function finish() {
    setBusy(true);
    const audioFlushed = await capture.flushAudio();
    capture.stop();
    if (session) {
      try {
        if (connected && socket.current?.readyState === WebSocket.OPEN) {
          // A control message follows the last frame on the same ordered socket.
          // Wait for the server's flush before issuing an HTTP finalization request.
          try {
            await new Promise<void>((resolve, reject) => {
              const timer = setTimeout(
                () => reject(new Error("Flush acknowledgement timed out")),
                60000,
              );
              finishWaiter.current = {
                resolve: () => {
                  clearTimeout(timer);
                  finishWaiter.current = null;
                  resolve();
                },
                reject: () => {
                  clearTimeout(timer);
                  finishWaiter.current = null;
                  reject(new Error("Capture disconnected during finish"));
                },
              };
              send({
                type: "control",
                action: "finish",
                audio_gap: !audioFlushed,
              });
            });
          } catch {
            setNotice(
              "Capture flush was interrupted. Finalizing the evidence already received; review any flagged gaps.",
            );
          }
        }
        if (practice) {
          const finished = await api<Session>(
            "/sessions/" + session.id + "/finish",
            "POST",
          );
          sessionRef.current = finished;
          setSession(finished);
        } else {
          const result = await api<Job>(
            "/sessions/" + session.id + "/finalize",
            "POST",
          );
          setJob(result);
        }
      } catch (e) {
        setError((e as Error).message);
      }
    }
    setBusy(false);
  }
  async function pause() {
    const flushed = await capture.flushAudio();
    send({ type: "control", action: "pause", audio_gap: !flushed });
  }
  async function selectStep(step: Step) {
    if (!session) return;
    try {
      const s = await api<Session>(
        "/sessions/" + session.id + "/step",
        "POST",
        { step_id: step.id },
      );
      sessionRef.current = s;
      setSession(s);
      setAssessment(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const activeStep =
    practice?.draft.steps.find((s) => s.id === session?.step_id) ||
    practice?.draft.steps[0];
  const stepIndex =
    practice?.draft.steps.findIndex((s) => s.id === activeStep?.id) || 0;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{practice ? practice.draft.title : "New demonstration"}</h1>
          <p>
            {practice
              ? "Follow each step and compare your work with the reference."
              : "Capture a physical task or share your screen. Review before publishing."}
          </p>
        </div>
        <span className="badge">
          <Clock3 size={14} /> {practice ? "10" : "5"} minute session
        </span>
      </div>
      {error && <Banner tone="error">{error}</Banner>}
      {notice && <Banner>{notice}</Banner>}
      {(!config.ai_configured || !config.free_tier_confirmed) && (
        <Banner tone="warning">
          <strong>AI analysis is not enabled.</strong> Capture and saved lessons
          are available. A free-tier Gemini project must be configured before
          new AI steps or feedback can appear.
        </Banner>
      )}
      {!session ? (
        <div className="panel setup-panel">
          <div className="section-heading">
            <h2>Capture source</h2>
          </div>
          <SourcePicker value={source} onChange={setSource} />
          <div className="setup-bottom">
            <div>
              {!practice && (
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={microphone}
                    onChange={(e) => setMicrophone(e.target.checked)}
                  />
                  <Mic size={16} /> Include natural narration
                </label>
              )}
              <label className="checkbox consent">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />{" "}
                Everyone captured is 18+ and consents to Google processing the
                media. I will keep private information off screen.
              </label>
            </div>
            <button
              className="button primary"
              disabled={!consent || busy}
              onClick={() => void start()}
            >
              <Play size={17} />
              {busy
                ? "Opening capture…"
                : practice
                  ? "Start practice"
                  : "Start demonstration"}
            </button>
          </div>
          <div className="setup-tip">
            <p>
              Keep details visible. Pause after each action and narrate hidden
              settings. Resolve unclear details during review.
            </p>
          </div>
        </div>
      ) : (
        <div className="live-grid">
          <section className="panel capture-panel">
            <div className="capture-heading">
              <span className="badge">
                <span
                  className={
                    "dot " + (session.state === "capturing" ? "" : "gray")
                  }
                />
                {session.state === "capturing"
                  ? "LIVE"
                  : session.state.replaceAll("_", " ").toUpperCase()}
              </span>
              <span className="time-code">
                {time(elapsed)} <span>/ {practice ? "10:00" : "05:00"}</span>
              </span>
            </div>
            <div
              className={"video-stage " + (source === "screen" ? "screen" : "")}
            >
              {source === "phone" ? (
                <div className="phone-stage">
                  {qr ? (
                    <>
                      <img src={qr} alt="Scan to pair the phone camera" />
                      <h3>Bring the camera closer</h3>
                      <p>
                        Scan this code on your phone. Pairing expires after two
                        minutes.
                      </p>
                      <button
                        className="text-button"
                        onClick={() => void pair(session)}
                      >
                        <RefreshCw size={14} /> Refresh pairing code
                      </button>
                      <details>
                        <summary>Open pairing link</summary>
                        <a href={phoneURL} target="_blank" rel="noreferrer">
                          Open on phone
                        </a>
                      </details>
                    </>
                  ) : (
                    <button
                      className="button secondary"
                      onClick={() => void pair(session)}
                    >
                      <Smartphone size={17} /> Pair phone camera
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <video ref={capture.videoRef} playsInline muted autoPlay />
                  {!capture.stream && (
                    <div className="stage-placeholder">
                      <Video size={38} />
                      <h3>
                        {session.state === "finished"
                          ? "Demonstration captured"
                          : "Ready to see your work"}
                      </h3>
                      <p>
                        {session.state === "finished"
                          ? "Your observations are saved."
                          : "Resume to select your camera or screen."}
                      </p>
                    </div>
                  )}
                  {capture.stream && (
                    <div className="view-brackets">
                      <i />
                      <i />
                      <i />
                      <i />
                    </div>
                  )}
                </>
              )}
              <div className="stage-bottom">
                <span>
                  <ScanLine size={13} />{" "}
                  {source === "screen" ? "Screen" : "Camera"} capture
                </span>
                <span>1 frame / second</span>
              </div>
            </div>
            <div className="capture-controls">
              <span className={"connection " + (connected ? "online" : "")}>
                <Wifi size={15} />
                {connected ? "Connected" : "Disconnected"}
              </span>
              <div>
                {session.state !== "finished" && (
                  <>
                    {session.state === "capturing" ? (
                      <button
                        className="button secondary"
                        onClick={() => void pause()}
                      >
                        <Pause size={15} /> Pause
                      </button>
                    ) : (
                      <button
                        className="button secondary"
                        onClick={() => void resume()}
                        disabled={session.state === "quota_paused"}
                      >
                        <Play size={15} /> Resume
                      </button>
                    )}
                    <button
                      className="button primary"
                      disabled={busy}
                      onClick={() => void finish()}
                    >
                      <Square size={14} />{" "}
                      {practice ? "Finish practice" : "Finish & review"}
                    </button>
                  </>
                )}
                {session.state === "finished" &&
                  !practice &&
                  job?.state !== "running" &&
                  job?.state !== "queued" && (
                    <button
                      className="button primary"
                      onClick={() => void finish()}
                    >
                      <RefreshCw size={15} /> Retry finalization
                    </button>
                  )}
              </div>
            </div>
            <div className="capture-meta">
              <span>{frameCount} frames received in this view</span>
              <span>
                Last analysis:{" "}
                {session.last_analysis_at
                  ? new Date(session.last_analysis_at).toLocaleTimeString()
                  : "awaiting first update"}
              </span>
            </div>
            {session.last_error && (
              <Banner tone="warning">{session.last_error.message}</Banner>
            )}
            {job && (
              <Banner tone={job.state === "failed" ? "error" : "info"}>
                {job.state === "running" || job.state === "queued"
                  ? "Organizing the captured evidence into your review draft…"
                  : job.error || "Tutorial ready for review."}
              </Banner>
            )}
          </section>
          <aside className="panel observation-panel">
            <div className="section-heading">
              <h2>{practice ? "Your next step" : "Steps taking shape"}</h2>
            </div>
            <p className="small muted">
              {practice
                ? "Only visible criteria can be checked automatically."
                : "Draft observations update while you demonstrate. You’ll review the final lesson."}
            </p>
            {practice && activeStep ? (
              <>
                <div className="step-count">
                  STEP {stepIndex + 1} OF {practice.draft.steps.length}
                </div>
                <h3>{activeStep.title}</h3>
                <p>{activeStep.instruction}</p>
                {activeStep.evidence_ids?.slice(0, 2).map((fid) => (
                  <Evidence key={fid} id={fid} label="Instructor reference" />
                ))}
                <div className="expected">
                  <Eye size={16} />
                  <div>
                    <strong>Look for</strong>
                    <p>{activeStep.expected_outcome}</p>
                  </div>
                </div>
                {activeStep.criteria?.map((c) => (
                  <div className="criterion" key={c.id}>
                    {c.mode === "visual" ? (
                      <Eye size={14} />
                    ) : (
                      <CircleHelp size={14} />
                    )}
                    <span>
                      {c.description}
                      <small>
                        {c.mode === "manual"
                          ? "Manual confirmation required"
                          : "Visual checkpoint"}
                      </small>
                    </span>
                  </div>
                ))}
                {assessment && assessment.step_id === activeStep.id && (
                  <div className={"assessment " + assessment.outcome}>
                    <strong>
                      {assessment.outcome === "met" ? (
                        <CheckCircle2 size={18} />
                      ) : (
                        <CircleHelp size={18} />
                      )}{" "}
                      {outcomeLabels[assessment.outcome]}
                    </strong>
                    <p>{assessment.explanation}</p>
                    {!!assessment.evidence_ids.length && (
                      <details className="feedback-evidence">
                        <summary>View assessed screenshots</summary>
                        <div className="evidence-row">
                          {assessment.evidence_ids.slice(0, 2).map((fid) => (
                            <Evidence
                              key={fid}
                              id={fid}
                              label="Student evidence for this feedback"
                            />
                          ))}
                        </div>
                      </details>
                    )}
                    {assessment.manual_unverified?.length > 0 && (
                      <small>
                        Still unverified:{" "}
                        {assessment.manual_unverified.join("; ")}
                      </small>
                    )}
                    <small>
                      Processing: {(assessment.latency_ms / 1000).toFixed(1)}s
                    </small>
                  </div>
                )}
                <div className="step-navigation">
                  <button
                    className="button secondary"
                    disabled={
                      !session ||
                      session.state === "finished" ||
                      stepIndex === 0
                    }
                    onClick={() =>
                      void selectStep(practice.draft.steps[stepIndex - 1])
                    }
                  >
                    Previous
                  </button>
                  <button
                    className="button primary"
                    disabled={
                      !session ||
                      session.state === "finished" ||
                      stepIndex === practice.draft.steps.length - 1
                    }
                    onClick={() =>
                      void selectStep(practice.draft.steps[stepIndex + 1])
                    }
                  >
                    Continue <ArrowRight size={15} />
                  </button>
                </div>
              </>
            ) : observations.length ? (
              <div className="observation-list">
                {observations.map((o, index) => (
                  <div className="observation" key={o.id}>
                    <span className="step-number">{index + 1}</span>
                    <div>
                      <span className="observation-time">
                        {time(Math.floor(o.timestamp_ms / 1000))} ·{" "}
                        {o.provenance}
                      </span>
                      <p>{o.action}</p>
                      {!!o.uncertainties?.length && (
                        <span className="uncertainty">
                          <CircleHelp size={13} /> {o.uncertainties[0]}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Empty title="No observations yet" icon={<Eye size={26} />}>
                Your observed actions will appear here once live AI analysis is
                enabled.
              </Empty>
            )}
          </aside>
        </div>
      )}
    </>
  );
}

function Questions({
  items,
  onChange,
}: {
  items: Question[];
  onChange: (items: Question[]) => void;
}) {
  return (
    <>
      {items.map((q, index) => (
        <label className="question" key={q.id}>
          <span>
            <CircleHelp size={15} />
            {q.text}
            {q.required && <small>Required</small>}
          </span>
          <textarea
            rows={2}
            placeholder="Clarify this detail based on your demonstration…"
            value={q.answer || ""}
            onChange={(e) =>
              onChange(
                items.map((item, i) =>
                  i === index ? { ...item, answer: e.target.value } : item,
                ),
              )
            }
          />
        </label>
      ))}
    </>
  );
}

function Review({
  id,
  navigate,
  config,
}: {
  id: string;
  navigate: (p: string) => void;
  config: Config;
}) {
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [dirty, setDirty] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    void api<Lesson>("/lessons/" + id + "/draft")
      .then(setLesson)
      .catch((e) => setError(e.message));
  }, [id]);
  function update(draft: Draft) {
    if (lesson) {
      setLesson({ ...lesson, draft });
      setDirty(true);
      setReviewed(false);
    }
  }
  async function save(manageBusy = true) {
    if (!lesson) return;
    if (manageBusy) setBusy(true);
    setError("");
    try {
      const l = await api<Lesson>("/lessons/" + id + "/draft", "PATCH", {
        revision: lesson.revision,
        draft: lesson.draft,
      });
      setLesson(l);
      setDirty(false);
      setNotice("Draft saved. Your published version is unchanged.");
      return l;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (manageBusy) setBusy(false);
    }
  }
  async function publish() {
    if (!lesson) return;
    setError("");
    setBusy(true);
    try {
      const l = dirty ? await save(false) : lesson;
      if (!l) return;
      await api<Version>("/lessons/" + id + "/publish", "POST", {
        revision: l.revision,
        reviewed,
      });
      navigate("/lesson/" + id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function revise() {
    if (!lesson) return;
    setBusy(true);
    setError("");
    setReviewed(false);
    try {
      const saved = dirty ? await save(false) : lesson;
      if (!saved) return;
      const revised = await api<Lesson>("/lessons/" + id + "/revise", "POST", {
        revision: saved.revision,
      });
      setLesson(revised);
      setDirty(false);
      setNotice(
        "Clarifications incorporated. Review the revised instructions and checkpoints before publishing.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!lesson)
    return (
      <>
        {error ? (
          <Banner tone="error">{error}</Banner>
        ) : (
          <div className="loading">
            <RefreshCw size={22} /> Loading the captured lesson…
          </div>
        )}
      </>
    );
  const draft = lesson.draft;
  const pending = unresolved(draft);
  const updateStep = (index: number, step: Step) =>
    update({
      ...draft,
      steps: draft.steps.map((s, i) => (i === index ? step : s)),
    });
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Review lesson</h1>
          <p>
            Check instructions, screenshots and checkpoints. Resolve required
            questions before publishing.
          </p>
        </div>
        <span className="badge amber">
          <FileText size={14} /> {dirty ? "Unsaved changes" : "Review draft"}
        </span>
      </div>
      {error && <Banner tone="error">{error}</Banner>}
      {notice && <Banner>{notice}</Banner>}
      <fieldset className="review-grid" disabled={busy}>
        <div>
          <section className="panel review-intro">
            <label>
              Lesson title
              <input
                className="title-input"
                value={draft.title}
                onChange={(e) => update({ ...draft, title: e.target.value })}
              />
            </label>
            <label>
              What students will learn
              <textarea
                rows={2}
                value={draft.summary || ""}
                onChange={(e) => update({ ...draft, summary: e.target.value })}
              />
            </label>
            <label>
              Materials, tools or software{" "}
              <span className="muted small">One per line</span>
              <textarea
                rows={3}
                value={(draft.materials || []).join("\n")}
                onChange={(e) =>
                  update({
                    ...draft,
                    materials: e.target.value.split("\n").filter(Boolean),
                  })
                }
              />
            </label>
            <Questions
              items={draft.questions || []}
              onChange={(questions) => update({ ...draft, questions })}
            />
          </section>
          <div className="section-heading">
            <h2>Step-by-step instructions</h2>
            <span className="muted small">{draft.steps.length} steps</span>
          </div>
          {draft.steps.map((step, index) => (
            <section className="panel review-step" key={step.id}>
              <div className="review-step-header">
                <span className="step-number">{index + 1}</span>
                <input
                  aria-label={`Step ${index + 1} title`}
                  value={step.title}
                  onChange={(e) =>
                    updateStep(index, { ...step, title: e.target.value })
                  }
                />
                <div>
                  <button
                    className="icon-button"
                    title="Move step up"
                    aria-label="Move step up"
                    disabled={index === 0}
                    onClick={() =>
                      update({
                        ...draft,
                        steps: reorder(draft.steps, index, -1),
                      })
                    }
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    className="icon-button"
                    title="Move step down"
                    aria-label="Move step down"
                    disabled={index === draft.steps.length - 1}
                    onClick={() =>
                      update({
                        ...draft,
                        steps: reorder(draft.steps, index, 1),
                      })
                    }
                  >
                    <ArrowDown size={16} />
                  </button>
                  <button
                    className="icon-button danger"
                    title="Delete step"
                    aria-label="Delete step"
                    onClick={() =>
                      update({
                        ...draft,
                        steps: draft.steps.filter((_, i) => i !== index),
                      })
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              <div className="review-step-body">
                <label>
                  Instruction
                  <textarea
                    rows={3}
                    value={step.instruction}
                    onChange={(e) =>
                      updateStep(index, {
                        ...step,
                        instruction: e.target.value,
                      })
                    }
                  />
                </label>
                <div className="evidence-row">
                  {step.evidence_ids?.map((fid) => (
                    <div key={fid}>
                      <Evidence
                        id={fid}
                        label={`${time(Math.floor((step.timestamp_ms || 0) / 1000))} · ${step.provenance}`}
                      />
                      <button
                        className="text-button danger"
                        onClick={() =>
                          updateStep(index, {
                            ...step,
                            evidence_ids: step.evidence_ids!.filter(
                              (f) => f !== fid,
                            ),
                            provenance: "instructor-confirmed",
                          })
                        }
                      >
                        <X size={12} /> Remove reference
                      </button>
                    </div>
                  ))}
                </div>
                <label>
                  Observable outcome
                  <textarea
                    rows={2}
                    value={step.expected_outcome}
                    onChange={(e) =>
                      updateStep(index, {
                        ...step,
                        expected_outcome: e.target.value,
                      })
                    }
                  />
                </label>
                <div className="section-heading compact">
                  <h4>Student checkpoints</h4>
                  <button
                    className="text-button"
                    onClick={() =>
                      updateStep(index, {
                        ...step,
                        criteria: [
                          ...(step.criteria || []),
                          {
                            id: crypto.randomUUID(),
                            description: "Confirm the expected outcome",
                            mode: "manual",
                          },
                        ],
                      })
                    }
                  >
                    <Plus size={13} /> Add
                  </button>
                </div>
                {step.criteria?.map((c, i) => (
                  <div className="criterion-edit" key={c.id}>
                    <input
                      aria-label="Checkpoint description"
                      value={c.description}
                      onChange={(e) =>
                        updateStep(index, {
                          ...step,
                          criteria: step.criteria!.map((x, n) =>
                            n === i ? { ...x, description: e.target.value } : x,
                          ),
                        })
                      }
                    />
                    <select
                      aria-label="Checkpoint verification method"
                      value={c.mode}
                      onChange={(e) =>
                        updateStep(index, {
                          ...step,
                          criteria: step.criteria!.map((x, n) =>
                            n === i
                              ? {
                                  ...x,
                                  mode: e.target.value as "manual" | "visual",
                                }
                              : x,
                          ),
                        })
                      }
                    >
                      <option value="manual">Manual check</option>
                      <option value="visual">Visual check</option>
                    </select>
                    <button
                      className="icon-button danger"
                      title="Remove checkpoint"
                      aria-label="Remove checkpoint"
                      onClick={() =>
                        updateStep(index, {
                          ...step,
                          criteria: step.criteria!.filter((_, n) => n !== i),
                        })
                      }
                    >
                      <X size={15} />
                    </button>
                  </div>
                ))}
                <Questions
                  items={step.questions || []}
                  onChange={(questions) =>
                    updateStep(index, { ...step, questions })
                  }
                />
                <div className="step-provenance">
                  <Eye size={13} />
                  <label>
                    Evidence source{" "}
                    <select
                      value={step.provenance}
                      onChange={(e) =>
                        updateStep(index, {
                          ...step,
                          provenance: e.target.value as Step["provenance"],
                        })
                      }
                    >
                      <option value="visible">Visible in demonstration</option>
                      <option value="narrated">Instructor narration</option>
                      <option value="instructor-confirmed">
                        Confirmed during review
                      </option>
                    </select>
                  </label>
                </div>
              </div>
            </section>
          ))}
          <button
            className="button secondary full add-step"
            onClick={() =>
              update({
                ...draft,
                steps: [
                  ...draft.steps,
                  {
                    id: crypto.randomUUID(),
                    title: "Additional step",
                    instruction: "Describe the demonstrated action.",
                    expected_outcome: "Describe the outcome.",
                    provenance: "instructor-confirmed",
                    timestamp_ms: 0,
                    evidence_ids: [],
                    criteria: [],
                    questions: [],
                  },
                ],
              })
            }
          >
            <Plus size={17} /> Add an instructor-confirmed step
          </button>
        </div>
        <aside>
          <div className="panel publish-panel">
            <h3>Publish lesson</h3>
            <p>
              Publishing creates a fixed version. Later draft edits will not
              change it.
            </p>
            <div className="review-check">
              <span>
                <CheckCircle2 size={16} /> {draft.steps.length} steps to review
              </span>
              <span className={pending.length ? "warning-text" : "green-text"}>
                <CircleHelp size={16} /> {pending.length} required
                clarifications
              </span>
              <span>
                <Layers3 size={16} />{" "}
                {draft.steps.reduce((n, s) => n + (s.criteria?.length || 0), 0)}{" "}
                checkpoints
              </span>
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={reviewed}
                onChange={(e) => setReviewed(e.target.checked)}
              />{" "}
              I reviewed the instructions, screenshots and checkpoints, and
              resolved essential missing details.
            </label>
            <button
              disabled={busy}
              className="button secondary full"
              onClick={() => void save()}
            >
              <FileText size={16} /> {busy ? "Saving…" : "Save draft"}
            </button>
            <button
              className="button secondary full"
              disabled={
                busy || !config.ai_configured || !config.free_tier_confirmed
              }
              onClick={() => void revise()}
            >
              <RefreshCw size={16} /> Apply clarifications with AI
            </button>
            <button
              className="text-button"
              onClick={() =>
                void download(
                  `/sessions/${lesson.session_id}/evidence/export`,
                  "showonce-evidence.zip",
                ).catch((e) => setError(e.message))
              }
            >
              <Download size={15} /> Export validation evidence
            </button>
            <button
              disabled={
                busy || !reviewed || pending.length > 0 || !draft.steps.length
              }
              className="button primary full"
              onClick={() => void publish()}
            >
              <Check size={16} /> Publish lesson
            </button>
            <p className="fine">
              Visual checking only establishes visible outcomes. Keep hidden or
              functional properties as manual checks.
            </p>
          </div>
        </aside>
      </fieldset>
    </>
  );
}

function LessonView({
  id,
  user,
  config,
  navigate,
}: {
  id: string;
  user: User;
  config: Config;
  navigate: (p: string) => void;
}) {
  const [version, setVersion] = useState<Version | null>(null);
  const [error, setError] = useState("");
  const [practicing, setPracticing] = useState(false);
  useEffect(() => {
    void api<LessonCard[]>("/lessons")
      .then(async (lessons) => {
        const l = lessons.find((x) => x.id === id);
        if (!l?.latest_version)
          throw new Error("This lesson has not been published");
        setVersion(
          await api<Version>(`/lessons/${id}/versions/${l.latest_version}`),
        );
      })
      .catch((e) => setError(e.message));
  }, [id]);
  if (!version)
    return error ? (
      <Banner tone="error">{error}</Banner>
    ) : (
      <div className="loading">Loading lesson…</div>
    );
  if (practicing)
    return <Live config={config} navigate={navigate} practice={version} />;
  const d = version.draft;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{d.title}</h1>
          <p>{d.summary}</p>
        </div>
        <span className="badge green">
          <CheckCircle2 size={14} /> Reviewed · version {version.version}
        </span>
      </div>
      <div className="lesson-toolbar">
        <button className="button primary" onClick={() => setPracticing(true)}>
          <Play size={17} /> Start guided practice
        </button>
        <button
          className="button secondary"
          onClick={() =>
            void download(
              `/lessons/${id}/versions/${version.version}/export?format=bundle`,
              "showonce-lesson.zip",
            ).catch((e) => setError(e.message))
          }
        >
          <Download size={16} /> Export lesson
        </button>
        {user.role === "instructor" && (
          <button
            className="text-button"
            onClick={() => navigate("/review/" + id)}
          >
            Open draft <ArrowRight size={15} />
          </button>
        )}
      </div>
      {error && <Banner tone="error">{error}</Banner>}
      <div className="read-grid">
        <aside className="panel materials-panel">
          <h3>Before you begin</h3>
          <p className="muted small">
            Materials, tools and software from the demonstration.
          </p>
          {d.materials?.map((m) => (
            <div className="material" key={m}>
              <Check size={14} />
              {m}
            </div>
          ))}
          {!d.materials?.length && <p>No materials were specified.</p>}
          <div className="lesson-meta">
            <Clock3 size={16} />
            {d.steps.length} steps · Go at your own pace
          </div>
          <QuestionsReadonly questions={d.questions || []} />
        </aside>
        <div>
          {d.steps.map((step, index) => (
            <section className="panel read-step" key={step.id}>
              <div className="read-step-heading">
                <span className="step-number">{index + 1}</span>
                <h2>{step.title}</h2>
              </div>
              <p>{step.instruction}</p>
              <div className="evidence-row">
                {step.evidence_ids?.map((fid) => (
                  <Evidence
                    key={fid}
                    id={fid}
                    label={`${time(Math.floor((step.timestamp_ms || 0) / 1000))} · Instructor demonstration`}
                  />
                ))}
              </div>
              <div className="expected">
                <Eye size={17} />
                <div>
                  <strong>Expected outcome</strong>
                  <p>{step.expected_outcome}</p>
                </div>
              </div>
              {step.criteria?.map((c) => (
                <div className="criterion" key={c.id}>
                  {c.mode === "visual" ? (
                    <Eye size={15} />
                  ) : (
                    <CircleHelp size={15} />
                  )}
                  <span>
                    {c.description}
                    <small>
                      {c.mode === "visual"
                        ? "Can be checked against visible evidence"
                        : "Needs manual confirmation"}
                    </small>
                  </span>
                </div>
              ))}
              <QuestionsReadonly questions={step.questions || []} />
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
function PracticeRestore({
  id,
  config,
  navigate,
}: {
  id: string;
  config: Config;
  navigate: (p: string) => void;
}) {
  const [version, setVersion] = useState<Version | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    void api<{ session: Session }>("/sessions/" + id)
      .then(async ({ session }) => {
        const number = session.version_id?.match(/-v(\d+)$/)?.[1];
        if (session.mode !== "practice" || !number)
          throw new Error("Practice session not found");
        setVersion(
          await api<Version>(
            `/lessons/${session.lesson_id}/versions/${number}`,
          ),
        );
      })
      .catch((e) => setError(e.message));
  }, [id]);
  if (!version)
    return error ? (
      <Banner tone="error">{error}</Banner>
    ) : (
      <div className="loading">Restoring practice…</div>
    );
  return (
    <Live id={id} practice={version} config={config} navigate={navigate} />
  );
}

function QuestionsReadonly({ questions }: { questions: Question[] }) {
  return (
    <>
      {questions
        .filter((q) => q.answer)
        .map((q) => (
          <div className="clarified" key={q.id}>
            <strong>
              <CircleHelp size={14} /> {q.text}
            </strong>
            <p>{q.answer}</p>
          </div>
        ))}
    </>
  );
}

function Setup({ config }: { config: Config }) {
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Connection & validation</h1>
          <p>Check service connections and prototype limits.</p>
        </div>
      </div>
      <div className="settings-grid">
        <section className="panel">
          <h3>Service connections</h3>
          {[
            ["Gemini API key", config.ai_configured],
            ["Free tier confirmed", config.free_tier_confirmed],
            ["Hosted persistence", config.storage_mode === "supabase"],
          ].map(([label, ready]) => (
            <div className="connection-row" key={String(label)}>
              <span>{label}</span>
              <span className={"badge " + (ready ? "green" : "amber")}>
                {ready ? "Configured" : "Not configured"}
              </span>
            </div>
          ))}
          <p className="fine">
            No paid fallback is enabled. A missing connection is never replaced
            with simulated AI.
          </p>
        </section>
        <section className="panel">
          <h3>Prototype limits</h3>
          <div className="connection-row">
            <span>Instructor capture</span>
            <strong>5 minutes</strong>
          </div>
          <div className="connection-row">
            <span>Student practice</span>
            <strong>10 minutes</strong>
          </div>
          <div className="connection-row">
            <span>Analysis cadence</span>
            <strong>{config.analysis_interval}s</strong>
          </div>
          <div className="connection-row">
            <span>Daily call guard</span>
            <strong>{config.daily_limit}</strong>
          </div>
          <div className="connection-row">
            <span>Concurrent live sessions</span>
            <strong>1</strong>
          </div>
        </section>
        <section className="panel wide">
          <h3>Validation is still required</h3>
          <p>
            This build implements capture, evidence, review and guidance. It
            does not establish model accuracy, real-world response time or TRL4
            by itself.
          </p>
          <div className="validation-items">
            <span>
              <Video size={20} />
              <strong>Demonstration extraction</strong>
              <small>Test essential steps and unsupported claims.</small>
            </span>
            <span>
              <Eye size={20} />
              <strong>Checkpoint assessment</strong>
              <small>Measure incorrect passes and uncertainty handling.</small>
            </span>
            <span>
              <GraduationCap size={20} />
              <strong>Beginner pilot</strong>
              <small>Observe completion and instructor review effort.</small>
            </span>
          </div>
        </section>
        {config.local_login && (
          <section className="panel wide">
            <h3>Enable real AI locally</h3>
            <p>
              Add your key to <code>backend/.env</code>, verify the Google
              project is on Free, then set <code>FREE_TIER_CONFIRMED=true</code>{" "}
              and restart the backend. Keep keys out of chat and source control.
            </p>
            <p className="fine">
              Hosted setup and account provisioning are documented in the
              project README. This page displays configuration status only and
              cannot enable billing.
            </p>
          </section>
        )}
      </div>
    </>
  );
}

function PhoneCapture({ id }: { id: string }) {
  const ticket = useRef(location.hash.slice(1));
  const [paired, setPaired] = useState(false);
  const [mode, setMode] = useState("teach");
  const [state, setState] = useState("capturing");
  const [error, setError] = useState("");
  const [consent, setConsent] = useState(false);
  const [mic, setMic] = useState(
    new URLSearchParams(location.search).get("mic") !== "0",
  );
  const socket = useRef<WebSocket | null>(null);
  const started = useRef(Date.now());
  const offset = useRef(0);
  const send = useCallback((data: unknown) => {
    if (socket.current?.readyState === WebSocket.OPEN)
      socket.current.send(JSON.stringify(data));
  }, []);
  const capture = useCapture(
    send,
    () => Math.max(0, Date.now() - started.current + offset.current),
    paired && state === "capturing",
    () => setError("Camera stopped. Request a new pairing code to reconnect."),
  );
  async function start() {
    try {
      const media = await acquire("camera", mic);
      capture.setStream(media);
      const ws = new WebSocket(wsURL(id));
      socket.current = ws;
      ws.onopen = () =>
        ws.send(
          JSON.stringify({ type: "authenticate", ticket: ticket.current }),
        );
      ws.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.type === "paired") {
          started.current = Date.now();
          offset.current = m.elapsed_ms;
          setMode(m.mode);
          setPaired(true);
          history.replaceState({}, "", location.pathname);
        }
        if (m.type === "pong" || m.type === "capture_state") {
          setState(m.state);
          if (m.state === "finished") capture.stop();
        }
        if (m.type === "error") setError(m.message);
      };
      ws.onclose = () => {
        setPaired(false);
        capture.stop();
        setError(
          "Phone disconnected. Generate a new code on the main page to reconnect.",
        );
      };
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    const interval = setInterval(() => send({ type: "ping" }), 5000);
    return () => {
      clearInterval(interval);
      socket.current?.close();
    };
  }, [send]);
  return (
    <div className="phone-page">
      <Logo />
      <span className="badge">
        <Smartphone size={14} /> Paired camera
      </span>
      <h1>Phone camera</h1>
      <p>Keep the work and important details in view.</p>
      {error && <Banner tone="error">{error}</Banner>}
      <div className="phone-video">
        <video ref={capture.videoRef} playsInline muted autoPlay />
        {!capture.stream && <Video size={44} />}
      </div>
      {!paired ? (
        <>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={mic}
              onChange={(e) => setMic(e.target.checked)}
            />{" "}
            Include this phone’s microphone
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />{" "}
            Everyone captured is 18+ and consents to Google processing this
            feed.
          </label>
          <button
            disabled={!consent}
            className="button primary full"
            onClick={() => void start()}
          >
            <Video size={17} /> Connect camera
          </button>
        </>
      ) : (
        <div className="banner">
          <span className={"dot " + (state === "capturing" ? "" : "gray")} />
          {state === "capturing"
            ? "Camera connected"
            : state.replaceAll("_", " ")}
          . Control {mode === "teach" ? "the demonstration" : "practice"} on the
          main page.
        </div>
      )}
      <p className="fine">
        The pairing link grants capture access only. It cannot publish a lesson
        or view private records.
      </p>
    </div>
  );
}

export default function App() {
  const [path, navigateRaw] = usePath();
  const navigate = useCallback((p: string) => navigateRaw(p), [navigateRaw]);
  const [config, setConfig] = useState<Config | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenu(false);
    };
    addEventListener("keydown", close);
    return () => removeEventListener("keydown", close);
  }, []);
  useEffect(() => {
    void api<Config>("/config")
      .then(async (c) => {
        setConfig(c);
        await restoreHostedAuth(c);
        if (getToken())
          void api<User>("/me")
            .then(setUser)
            .catch(() => setToken(""));
      })
      .catch((e) => setError(e.message));
  }, []);
  if (!config)
    return (
      <div className="loading full-page">
        <Logo />
        {error || "Connecting to ShowOnce…"}
      </div>
    );
  if (path.startsWith("/capture/"))
    return <PhoneCapture id={path.split("/")[2]} />;
  if (!user) return <Login config={config} onLogin={setUser} />;
  const section = path.startsWith("/studio")
    ? "studio"
    : path === "/settings"
      ? "settings"
      : "library";
  const go = (p: string) => {
    setMobileMenu(false);
    navigate(p);
  };
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className={"sidebar " + (mobileMenu ? "open" : "")}>
        <Logo />
        <span className="workspace-label">Workspace</span>
        <nav aria-label="Main navigation" id="main-navigation">
          <button
            aria-current={section === "library" ? "page" : undefined}
            className={section === "library" ? "active" : ""}
            onClick={() => go("/")}
          >
            <BookOpen size={18} /> Lesson library
          </button>
          {user.role === "instructor" && (
            <button
              aria-current={section === "studio" ? "page" : undefined}
              className={section === "studio" ? "active" : ""}
              onClick={() => go("/studio")}
            >
              <Video size={18} /> Demonstration studio
            </button>
          )}
          <button
            aria-current={section === "settings" ? "page" : undefined}
            className={section === "settings" ? "active" : ""}
            onClick={() => go("/settings")}
          >
            <Settings2 size={18} /> Connection & validation
          </button>
        </nav>

        <div className="sidebar-bottom">
          <span className="avatar">
            {user.role === "instructor" ? "I" : "S"}
          </span>
          <div>
            <strong>
              {user.role === "instructor"
                ? "Instructor workspace"
                : "Student workspace"}
            </strong>
            <span>
              {config.local_login ? "Local development" : "University learning"}
            </span>
          </div>
          <button
            className="icon-button"
            title="Sign out"
            aria-label="Sign out"
            onClick={() => {
              void logoutHostedAuth(config);
              setToken("");
              setUser(null);
              navigate("/");
            }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span className="mobile-brand">
            <Logo />
          </span>
          <button
            className="icon-button mobile-menu"
            aria-label={mobileMenu ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileMenu}
            aria-controls="main-navigation"
            onClick={() => setMobileMenu(!mobileMenu)}
          >
            <Layers3 size={20} />
            <span className="mobile-menu-label">
              {mobileMenu ? "Close" : "Menu"}
            </span>
          </button>
          <span>
            <strong>
              {path.startsWith("/review/")
                ? "Lesson review"
                : path.startsWith("/practice/")
                  ? "Practice"
                  : path.startsWith("/lesson/")
                    ? "Published lesson"
                    : section === "studio"
                      ? "Demonstration studio"
                      : section === "settings"
                        ? "Connection & validation"
                        : "Lesson library"}
            </strong>
          </span>
          <div>
            <span
              className={
                "status-pill " +
                (config.ai_configured && config.free_tier_confirmed
                  ? "ready"
                  : "")
              }
            >
              <span className="dot" />
              {config.ai_configured && config.free_tier_confirmed
                ? "AI ready"
                : "AI offline"}
            </span>
            <span className="top-avatar">
              {user.role === "instructor" ? "I" : "S"}
            </span>
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          {path.startsWith("/review/") ? (
            <Review
              id={path.split("/")[2]}
              navigate={navigate}
              config={config}
            />
          ) : path.startsWith("/lesson/") ? (
            <LessonView
              id={path.split("/")[2]}
              user={user}
              config={config}
              navigate={navigate}
            />
          ) : path.startsWith("/practice/") ? (
            <PracticeRestore
              key={path}
              id={path.split("/")[2]}
              config={config}
              navigate={navigate}
            />
          ) : path.startsWith("/studio") ? (
            <Live
              key={path}
              id={path.split("/")[2]}
              config={config}
              navigate={navigate}
            />
          ) : path === "/settings" ? (
            <Setup config={config} />
          ) : (
            <Library user={user} navigate={navigate} />
          )}
        </main>
      </div>
    </div>
  );
}
