import React, { useCallback, useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type {
  Job,
  JobEvent,
  NormalizedSource,
  SettingsView,
  BrandingView,
} from "../server/contracts";
import type { BrandingConfig, ResolvedBranding, VideoPlan } from "../automation/types";
import "./styles.css";

const nav = [
  ["/", "⌂", "Home"],
  ["/dashboard", "◫", "Dashboard"],
  ["/videos/new", "＋", "Create Video"],
  ["/queue", "≡", "Job Queue"],
  ["/scheduler", "◷", "Scheduler"],
  ["/videos", "▷", "Completed Videos"],
  ["/settings", "⚙", "Settings"],
];
const date = (v: string | null) =>
  v
    ? new Date(v).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";
const label = (v: string) => v.toLowerCase().replaceAll("_", " ");
const duration = (v?: number) =>
  v === undefined
    ? "Duration pending"
    : `${Math.floor(v / 60)}:${Math.floor(v % 60)
        .toString()
        .padStart(2, "0")}`;
const artifact = (j: Job, kind = "video") =>
  `/api/jobs/${j.id}/artifacts/${kind}`;
async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch("/api" + url, {
    ...options,
    headers:
      options.body instanceof FormData
        ? undefined
        : { "Content-Type": "application/json", ...options.headers },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Request failed.");
  return data;
}
function Badge({ status }: { status: string }) {
  return (
    <span className={`badge ${status.toLowerCase()}`}>
      <i />
      {label(status)}
    </span>
  );
}
function Empty({
  title = "Nothing here yet",
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon" aria-hidden="true">◇</span>
      <h3>{title}</h3>
      <p>{children}</p>
      <a className="button subtle" href="/videos/new">
        Create Video <span>↗</span>
      </a>
    </div>
  );
}
function Header({
  eyebrow,
  title,
  children,
  action,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{children}</p>
      </div>
      {action}
    </header>
  );
}
function App() {
  const [route, setRoute] = useState(location.pathname),
    [jobs, setJobs] = useState<Job[]>([]),
    [settings, setSettings] = useState<SettingsView>(),
    [error, setError] = useState(""),
    [loaded, setLoaded] = useState(false),
    [toast, setToast] = useState(""),
    [mobile, setMobile] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const [queue, s] = await Promise.all([
        api<{ jobs: Job[] }>("/jobs"),
        api<SettingsView>("/settings"),
      ]);
      setJobs(queue.jobs);
      setSettings(s);
      setLoaded(true);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    const pop = () => {
      setRoute(location.pathname);
      setMobile(false);
      window.scrollTo(0, 0);
    };
    const click = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest("a");
      if (
        a &&
        a.origin === location.origin &&
        !a.pathname.startsWith("/api") &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.shiftKey &&
        e.button === 0
      ) {
        e.preventDefault();
        history.pushState({}, "", a.href);
        pop();
      }
    };
    window.addEventListener("popstate", pop);
    document.addEventListener("click", click);
    return () => {
      window.removeEventListener("popstate", pop);
      document.removeEventListener("click", click);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5500);
    return () => clearTimeout(timer);
  }, [toast]);
  const notify = (message: string) => setToast(message);
  const action = async (job: Job, kind: string, scheduledAt?: string) => {
    if (
      kind === "cancel" &&
      !window.confirm(`Cancel “${job.title}”? You can retry it later.`)
    )
      return;
    try {
      await api(`/jobs/${job.id}/action`, {
        method: "POST",
        body: JSON.stringify({ action: kind, scheduledAt }),
      });
      await refresh();
      notify(
        kind === "now"
          ? "Job queued. Start the worker when ready."
          : "Job updated.",
      );
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const actions = (job: Job) => <JobActions job={job} action={action} />;
  const completed = jobs.filter((j) => j.status === "COMPLETED"),
    pending = jobs.filter((j) => !["COMPLETED", "CANCELED"].includes(j.status));
  return (
    <div className="app">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <aside className={mobile ? "sidebar open" : "sidebar"}>
        <a className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">t.</span>
          <span>
            TINITIATE<small>VIDEO STUDIO</small>
          </span>
        </a>
        <div className="nav-caption">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {nav.map(([url, icon, name]) => (
            <a
              key={url}
              className={route === url || (url === "/settings" && route.startsWith("/settings/")) ? "selected" : ""}
              href={url}
              aria-current={route === url || (url === "/settings" && route.startsWith("/settings/")) ? "page" : undefined}
            >
              <span aria-hidden="true">{icon}</span>
              {name}
              {name === "Job Queue" && pending.length > 0 && (
                <b aria-hidden="true">{pending.length}</b>
              )}
            </a>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span
            className={`status-dot ${settings?.workerPaused ? "paused" : ""}`}
          />
          <div>
            Local workspace
            <small>
              {settings?.offline
                ? "Offline verification"
                : settings?.workerPaused
                  ? "Worker paused"
                  : "Worker running"}
            </small>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <div className="topbar">
          <button
            className="mobile-toggle"
            aria-label="Toggle navigation"
            onClick={() => setMobile(!mobile)}
          >
            ☰
          </button>
          <span>
            Video Studio <span className="slash">/</span>{" "}
            {route === "/settings/branding"
              ? "Branding"
              : nav.find((n) => n[0] === route)?.[2] ?? "Job details"}
          </span>
          <span className="local-label">● LOCAL INSTANCE</span>
        </div>
        <main id="main">
          {error && (
            <div className="alert" role="alert">
              {error} <button onClick={() => void refresh()}>Try again</button>
            </div>
          )}
          {route === "/" ? (
            <Home />
          ) : !loaded ? (
            <div className="skeleton" aria-label="Loading workspace">
              <div />
              <div />
              <div />
            </div>
          ) : route === "/dashboard" ? (
            <Dashboard jobs={jobs} settings={settings!} />
          ) : route === "/videos/new" ? (
            <Create settings={settings!} refresh={refresh} notify={notify} />
          ) : route === "/queue" ? (
            <>
              <Header
                eyebrow="PRODUCTION"
                title="Job queue"
                action={
                  <a className="button primary" href="/videos/new">
                    ＋ Create Video
                  </a>
                }
              >
                Every source, every stage. Follow your videos from input to
                output.
              </Header>
              <div className="worker-strip">
                <span>
                  <span
                    className={`status-dot ${settings?.workerPaused ? "paused" : ""}`}
                  />
                  {settings?.workerPaused
                    ? "Worker paused • queued jobs are waiting"
                    : "Worker running • due jobs are picked automatically"}
                </span>
                <a href="/settings">Worker settings ↗</a>
              </div>
              <div className="queue-grid">
                <section>
                  <div className="section-heading">
                    <h2>
                      To generate <small>{pending.length}</small>
                    </h2>
                    <span>LIVE QUEUE</span>
                  </div>
                  {pending.length ? (
                    pending.map((j) => (
                      <JobRow key={j.id} job={j} actions={actions(j)} />
                    ))
                  ) : (
                    <Empty title="Your queue is clear">
                      No videos are waiting to be generated.
                    </Empty>
                  )}
                </section>
                <section>
                  <div className="section-heading">
                    <h2>
                      Completed <small>{completed.length}</small>
                    </h2>
                    <a href="/videos">View library ↗</a>
                  </div>
                  {completed.length ? (
                    completed
                      .slice(0, 8)
                      .map((j) => (
                        <JobRow key={j.id} job={j} actions={actions(j)} />
                      ))
                  ) : (
                    <Empty title="Ready when you are">
                      Your validated videos will appear here after generation.
                    </Empty>
                  )}
                </section>
              </div>
              {jobs.some((j) => j.status === "CANCELED") && (
                <details className="canceled">
                  <summary>Canceled jobs</summary>
                  {jobs
                    .filter((j) => j.status === "CANCELED")
                    .map((j) => (
                      <JobRow key={j.id} job={j} actions={actions(j)} />
                    ))}
                </details>
              )}
            </>
          ) : route === "/scheduler" ? (
            <Scheduler jobs={jobs} actions={actions} />
          ) : route === "/videos" ? (
            <Library jobs={completed} />
          ) : route === "/settings/branding" ? (
            <BrandingPage notify={notify} />
          ) : route === "/settings" ? (
            <SettingsPage
              settings={settings!}
              refresh={refresh}
              notify={notify}
            />
          ) : route.startsWith("/jobs/") ? (
            <Detail key={route} id={route.split("/")[2]} actions={actions} />
          ) : (
            <Empty title="Page not found">
              Use the navigation to return to your workspace.
            </Empty>
          )}
        </main>
        <footer className="footer">
          Tinitiate AI <span>From knowledge to video.</span>
        </footer>
      </div>
      {toast && (
        <div className="toast" role="status">
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
function Home() {
  return (
    <>
      <div className="hero">
        <div className="eyebrow">
          <span className="gold-dot" /> YOUR KNOWLEDGE. A NEW FORMAT.
        </div>
        <h1>
          Great content.
          <br />
          Now, <em>great video.</em>
        </h1>
        <p>
          Turn structured learning content, documents and web sources into
          professionally narrated technical videos.
        </p>
        <div className="hero-actions">
          <a className="button primary" href="/videos/new">
            Create your first video <span>↗</span>
          </a>
          <a className="button subtle" href="/queue">
            View queue →
          </a>
        </div>
        <div className="formats">
          MARKDOWN <i /> POWERPOINT <i /> PDF <i /> WORD <i /> TEXT <i /> WEB
        </div>
      </div>
      <div className="product-preview">
        <div className="preview-chrome">
          <span>CONTENT → CLARITY</span>
          <span>TINITIATE AI</span>
        </div>
        <div className="preview-content">
          <div>
            <span className="eyebrow">BUILT FOR TECHNICAL LEARNING</span>
            <h2>
              Ideas deserve
              <br />
              more than a document.
            </h2>
            <p>
              Code, architecture and source-backed insights.
              <br />
              Planned, narrated and brought to life.
            </p>
          </div>
          <div className="visual-flow">
            <div>
              <span>01</span> Your source <b>▤</b>
            </div>
            <div className="flow-line" />
            <div>
              <span>02</span> A story, structured <b>✧</b>
            </div>
            <div className="flow-line" />
            <div className="gold-border">
              <span>03</span> A video, validated <b>▷</b>
            </div>
          </div>
        </div>
        <div className="preview-bottom">
          PRODUCT WORKFLOW PREVIEW <span>H.264 MP4 · Narrated · Validated</span>
        </div>
      </div>
      <section className="home-section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">FROM SOURCE TO SCREEN</div>
            <h2>One workflow. Every step accounted for.</h2>
          </div>
        </div>
        <div className="steps">
          {[
            "Source",
            "Extraction",
            "AI planning",
            "Narration",
            "Voice",
            "Visuals",
            "Rendering",
            "Validated MP4",
          ].map((s, i) => (
            <div key={s}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              <h3>{s}</h3>
            </div>
          ))}
        </div>
      </section>
      <section className="home-columns">
        <div>
          <div className="eyebrow">BRING YOUR KNOWLEDGE</div>
          <h2>
            Files or links.
            <br />
            Always your source.
          </h2>
          <p>
            Upload Markdown, Word, PowerPoint, PDF or text files. Or paste HTTPS
            document links and readable web pages. Each source becomes an
            independent video.
          </p>
          <p>
            Markdown keeps headings, code and technical structure explicit,
            giving the planner a clear foundation.
          </p>
        </div>
        <div className="feature-list">
          <article>
            <span>01</span>
            <div>
              <h3>A plan that follows your content</h3>
              <p>
                OpenRouter builds a structured video plan and narration with
                code, diagrams and source-backed metrics.
              </p>
            </div>
          </article>
          <article>
            <span>02</span>
            <div>
              <h3>A voice with room to explain</h3>
              <p>
                ElevenLabs narrates the final script. Automatic duration follows
                the actual voice recording.
              </p>
            </div>
          </article>
          <article>
            <span>03</span>
            <div>
              <h3>A finished, checked MP4</h3>
              <p>
                Remotion renders technical visuals. Validation gates completion
                before preview and download.
              </p>
            </div>
          </article>
          <article>
            <span>04</span>
            <div>
              <h3>Work now. Or schedule ahead.</h3>
              <p>
                Batch independent jobs, follow their progress and revisit the
                complete source-to-video record.
              </p>
            </div>
          </article>
        </div>
      </section>
    </>
  );
}
function JobRow({ job, actions }: { job: Job; actions?: ReactNode }) {
  return (
    <article className="job-row">
      <div className="file-icon">
        {job.status === "COMPLETED" ? "▷" : job.sourceType.slice(0, 3)}
      </div>
      <div className="job-info">
        <a href={`/jobs/${job.id}`} className="job-title">
          {job.title}
        </a>
        <p title={job.sourceReference}>
          {job.sourceOriginalName || job.sourceReference}
        </p>
        <div className="row-meta">
          <Badge status={job.status} />
          <span>
            {job.status === "COMPLETED"
              ? `${duration(job.actualDuration)} · ${date(job.completedAt)}`
              : job.scheduledAt
                ? date(job.scheduledAt)
                : date(job.createdAt)}
          </span>
        </div>
        {job.errorMessage && (
          <p className="error-text">
            {label(job.errorStage ?? "Failed")}: {job.errorMessage}
          </p>
        )}
        {actions && <div className="row-actions">{actions}</div>}
      </div>
    </article>
  );
}
function JobActions({
  job,
  action,
}: {
  job: Job;
  action: (j: Job, a: string, s?: string) => Promise<void>;
}) {
  const [reschedule, setReschedule] = useState(false),
    [time, setTime] = useState("");
  return (
    <>
      {job.status === "COMPLETED" ? (
        <>
          <a href={`/jobs/${job.id}?tab=Output`}>Preview</a>
          <a href={`${artifact(job)}?download=1`}>Download ↓</a>
        </>
      ) : null}
      {["FAILED", "CANCELED"].includes(job.status) && (
        <button onClick={() => void action(job, "retry")}>Retry ↻</button>
      )}
      {["SCHEDULED", "QUEUED"].includes(job.status) && (
        <>
          {job.status === "SCHEDULED" && (
            <button onClick={() => void action(job, "now")}>
              Generate now
            </button>
          )}
          <button onClick={() => setReschedule(!reschedule)}>Reschedule</button>
          <button onClick={() => void action(job, "cancel")}>Cancel</button>
        </>
      )}
      <a href={`/jobs/${job.id}`}>Open job ↗</a>
      {reschedule && (
        <form
          className="reschedule"
          onSubmit={(e) => {
            e.preventDefault();
            void action(job, "reschedule", new Date(time).toISOString()).then(
              () => setReschedule(false),
            );
          }}
        >
          <label>
            New time · {Intl.DateTimeFormat().resolvedOptions().timeZone}
            <input
              aria-label="New schedule time"
              type="datetime-local"
              required
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </label>
          <button className="button subtle">Save schedule</button>
        </form>
      )}
    </>
  );
}
function Dashboard({
  jobs,
  settings,
}: {
  jobs: Job[];
  settings: SettingsView;
}) {
  const active = jobs.filter((j) =>
    [
      "PLANNING",
      "GENERATING_VOICE",
      "ALIGNING_TIMING",
      "RENDERING",
      "VALIDATING",
    ].includes(j.status),
  );
  const stats = [
    ["Waiting", jobs.filter((j) => j.status === "QUEUED").length],
    ["Scheduled", jobs.filter((j) => j.status === "SCHEDULED").length],
    ["Processing", active.length],
    ["Completed", jobs.filter((j) => j.status === "COMPLETED").length],
    ["Failed", jobs.filter((j) => j.status === "FAILED").length],
  ];
  return (
    <>
      <Header
        eyebrow="WORKSPACE OVERVIEW"
        title="Dashboard"
        action={
          <a className="button primary" href="/videos/new">
            ＋ Create Video
          </a>
        }
      >
        A clear view of your video production.
      </Header>
      <div className="stats">
        {stats.map(([name, n]) => (
          <a
            href={
              name === "Completed"
                ? "/videos"
                : name === "Scheduled"
                  ? "/scheduler"
                  : "/queue"
            }
            key={name}
          >
            <span>{name}</span>
            <strong>{n}</strong>
          </a>
        ))}
      </div>
      <div className="dashboard-grid">
        <section>
          <div className="section-heading">
            <h2>Current work</h2>
            <Badge status={settings.workerPaused ? "PAUSED" : "RUNNING"} />
          </div>
          {active.length ? (
            active.map((j) => <JobRow key={j.id} job={j} />)
          ) : (
            <div className="quiet-panel">
              <h3>
                {settings.workerPaused
                  ? "The worker is paused"
                  : "Ready for the next source"}
              </h3>
              <p>
                {settings.workerPaused
                  ? "Review your queue, then start the worker in Settings."
                  : "Eligible jobs will be picked automatically."}
              </p>
              <a href="/settings">Manage worker ↗</a>
            </div>
          )}
          <div className="section-heading">
            <h2>Recent activity</h2>
            <a href="/queue">View queue ↗</a>
          </div>
          {jobs.length ? (
            jobs.slice(0, 5).map((j) => <JobRow key={j.id} job={j} />)
          ) : (
            <Empty title="A fresh workspace">
              Create a video to start your production history.
            </Empty>
          )}
        </section>
        <section>
          <div className="section-heading">
            <h2>Coming up</h2>
            <a href="/scheduler">Schedule ↗</a>
          </div>
          {jobs
            .filter((j) => j.status === "SCHEDULED")
            .sort((a, b) => a.scheduledAt!.localeCompare(b.scheduledAt!))
            .slice(0, 3)
            .map((j) => (
              <JobRow key={j.id} job={j} />
            ))}
          {!jobs.some((j) => j.status === "SCHEDULED") && (
            <p className="muted-block">No upcoming scheduled jobs.</p>
          )}
          <div className="section-heading">
            <h2>Recently completed</h2>
            <a href="/videos">Library ↗</a>
          </div>
          {jobs
            .filter((j) => j.status === "COMPLETED")
            .slice(0, 3)
            .map((j) => (
              <JobRow key={j.id} job={j} />
            ))}
          {!jobs.some((j) => j.status === "COMPLETED") && (
            <p className="muted-block">Validated videos will appear here.</p>
          )}
        </section>
      </div>
    </>
  );
}
function Create({
  settings,
  refresh,
  notify,
}: {
  settings: SettingsView;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [mode, setMode] = useState("urls"),
    [urls, setUrls] = useState<string[]>([]),
    [draft, setDraft] = useState(""),
    [files, setFiles] = useState<File[]>([]),
    [theme, setTheme] = useState(settings.theme),
    [timing, setTiming] = useState("now"),
    [schedule, setSchedule] = useState(""),
    [durationMode, setDurationMode] = useState(settings.durationMode),
    [seconds, setSeconds] = useState(settings.durationSeconds ?? 60),
    [introBranding, setIntroBranding] = useState<"inherit" | "dynamic" | "uploaded" | "none">("inherit"),
    [outroBranding, setOutroBranding] = useState<"inherit" | "dynamic" | "uploaded" | "none">("inherit"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [created, setCreated] = useState<Job[]>([]),
    [drag, setDrag] = useState(false);
  const addUrls = () => {
    try {
      const added = draft
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      for (const value of added) {
        const u = new URL(value);
        if (u.protocol !== "https:" || u.username || u.password)
          throw new Error("Use HTTPS URLs without credentials.");
      }
      if (urls.length + added.length > 20)
        throw new Error("Add up to 20 URLs per batch.");
      setUrls([...urls, ...added]);
      setDraft("");
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const addFiles = (incoming: FileList | File[]) => {
    const all = [...files, ...Array.from(incoming)];
    if (all.length > 20) {
      setError("Add up to 20 files per batch.");
      return;
    }
    setFiles(all);
    setError("");
  };
  const validFile = (f: File) =>
    /\.(md|txt|pdf|docx|pptx)$/i.test(f.name) &&
    f.size > 0 &&
    f.size <= 20 * 1024 * 1024;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (draft.trim()) {
      setError(
        "Add the URLs in the text box to your source list before creating jobs.",
      );
      return;
    }
    if (!urls.length && !files.length) {
      setError("Add at least one source.");
      return;
    }
    if (files.some((f) => !validFile(f))) {
      setError("Remove invalid files before continuing.");
      return;
    }
    setBusy(true);
    const results: Job[] = [];
    try {
      const options = {
        theme,
        durationMode,
        ...(durationMode === "fixed" ? { durationSeconds: seconds } : {}),
        ...(introBranding !== "inherit" || outroBranding !== "inherit"
          ? {
              brandingOverride: {
                ...(introBranding !== "inherit"
                  ? { intro: { mode: introBranding } }
                  : {}),
                ...(outroBranding !== "inherit"
                  ? { outro: { mode: outroBranding } }
                  : {}),
              },
            }
          : {}),
        scheduledAt:
          timing === "schedule" ? new Date(schedule).toISOString() : null,
      };
      if (files.length) {
        const form = new FormData();
        form.append("options", JSON.stringify(options));
        files.forEach((f) => form.append("files", f));
        const result = await api<{ jobs: Job[] }>("/jobs/uploads", {
          method: "POST",
          body: form,
        });
        results.push(...result.jobs);
        setFiles([]);
      }
      if (urls.length) {
        const result = await api<{ jobs: Job[] }>("/jobs/urls", {
          method: "POST",
          body: JSON.stringify({ urls, options }),
        });
        results.push(...result.jobs);
        setUrls([]);
      }
      setCreated(results);
      notify(`${results.length} independent jobs created.`);
      await refresh();
    } catch (err) {
      if (results.length) {
        setCreated(results);
        await refresh();
      }
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Header eyebrow="NEW PRODUCTION" title="Create video">
        Bring the source. We’ll take it from here.
      </Header>
      {created.length > 0 && (
        <div className="success-panel" role="status">
          <h2>{created.length} jobs created</h2>
          <p>
            {settings.workerPaused
              ? "Your jobs are saved. Start the worker in Settings when ready to generate."
              : "Your jobs will run when eligible."}
          </p>
          <a className="button primary" href="/queue">
            Open queue →
          </a>
          <div>
            {created.map((j) => (
              <a className="created-link" href={`/jobs/${j.id}`} key={j.id}>
                {j.title} ↗
              </a>
            ))}
          </div>
        </div>
      )}
      <form onSubmit={submit} className="create-layout">
        <div>
          <section className="form-section">
            <div className="step-title">
              <span>01</span>
              <div>
                <h2>Add your sources</h2>
                <p>One source becomes one independent video.</p>
              </div>
            </div>
            <div className="tabs" role="tablist" aria-label="Source mode">
              <button
                type="button"
                role="tab"
                aria-selected={mode === "urls"}
                onClick={() => setMode("urls")}
              >
                ↗ URL / Web Source {urls.length > 0 && `(${urls.length})`}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "files"}
                onClick={() => setMode("files")}
              >
                ↑ Upload Files {files.length > 0 && `(${files.length})`}
              </button>
            </div>
            {mode === "urls" ? (
              <div className="source-mode">
                <label htmlFor="urls">Paste one or more HTTPS URLs</label>
                <textarea
                  id="urls"
                  rows={4}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={
                    "https://example.com/technical-guide\nhttps://github.com/team/course/blob/main/lesson.md"
                  }
                />
                <div className="field-bottom">
                  <small>
                    Web pages, GitHub Markdown and direct document links.
                  </small>
                  <button
                    className="button subtle"
                    type="button"
                    onClick={addUrls}
                  >
                    ＋ Add URLs
                  </button>
                </div>
                {urls.map((u, i) => (
                  <div className="source-row" key={`${u}-${i}`}>
                    <span className="file-icon">URL</span>
                    <div>
                      <strong>
                        {new URL(u).pathname.split("/").pop() ||
                          new URL(u).hostname}
                      </strong>
                      <small>{u}</small>
                      <span className="valid-text">
                        HTTPS accepted · content checked during extraction
                      </span>
                    </div>
                    <button
                      type="button"
                      aria-label={`Remove ${u}`}
                      onClick={() => setUrls(urls.filter((_, n) => n !== i))}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="source-mode">
                <div
                  className={`dropzone ${drag ? "dragging" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDrag(true);
                  }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDrag(false);
                    addFiles(e.dataTransfer.files);
                  }}
                >
                  <span>↑</span>
                  <h3>Drop your knowledge here</h3>
                  <p>or choose files from your computer</p>
                  <label className="button subtle">
                    Browse files
                    <input
                      type="file"
                      multiple
                      accept=".md,.txt,.pdf,.docx,.pptx"
                      aria-label="Upload source files"
                      onChange={(e) => {
                        if (e.target.files) addFiles(e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <small>MD, TXT, PDF, DOCX, PPTX · Up to 20 MB each</small>
                </div>
                {files.map((f, i) => (
                  <div className="source-row" key={`${f.name}-${i}`}>
                    <span className="file-icon">
                      {f.name.split(".").pop()?.toUpperCase()}
                    </span>
                    <div>
                      <strong>{f.name}</strong>
                      <small>{(f.size / 1024).toFixed(1)} KB</small>
                      <span
                        className={validFile(f) ? "valid-text" : "error-text"}
                      >
                        {validFile(f)
                          ? "Ready for content validation"
                          : "Unsupported type, empty file or over 20 MB"}
                      </span>
                    </div>
                    <button
                      type="button"
                      aria-label={`Remove ${f.name}`}
                      onClick={() => setFiles(files.filter((_, n) => n !== i))}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className="form-section">
            <div className="step-title">
              <span>02</span>
              <div>
                <h2>Make it yours</h2>
                <p>Shared settings. Independent results.</p>
              </div>
            </div>
            <div className="fields">
              <label>
                Visual theme
                <select
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                >
                  {settings.themes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Video duration
                <select
                  value={durationMode}
                  onChange={(e) =>
                    setDurationMode(e.target.value as "auto" | "fixed")
                  }
                >
                  <option value="auto">Auto · follows the narration</option>
                  <option value="fixed">Fixed duration</option>
                </select>
              </label>
              {durationMode === "fixed" && (
                <label>
                  Duration in seconds
                  <input
                    type="number"
                    min="1"
                    step="any"
                    required
                    value={seconds}
                    onChange={(e) => setSeconds(Number(e.target.value))}
                  />
                </label>
              )}
            </div>
            <p className="hint">
              Automatic timing uses the actual voice recording, with room for a
              natural ending.
            </p>
          </section>
          <section className="form-section">
            <div className="step-title">
              <span>03</span>
              <div>
                <h2>Branding for this batch</h2>
                <p>Use the global branding setup or change how this batch starts and ends.</p>
              </div>
            </div>
            <div className="fields">
              <label>
                Intro
                <select
                  value={introBranding}
                  onChange={(e) =>
                    setIntroBranding(
                      e.target.value as "inherit" | "dynamic" | "uploaded" | "none",
                    )
                  }
                >
                  <option value="inherit">Use global setting</option>
                  <option value="dynamic">Use dynamic intro</option>
                  <option value="uploaded">Use uploaded intro</option>
                  <option value="none">No intro</option>
                </select>
              </label>
              <label>
                Outro
                <select
                  value={outroBranding}
                  onChange={(e) =>
                    setOutroBranding(
                      e.target.value as "inherit" | "dynamic" | "uploaded" | "none",
                    )
                  }
                >
                  <option value="inherit">Use global setting</option>
                  <option value="dynamic">Use dynamic outro</option>
                  <option value="uploaded">Use uploaded outro</option>
                  <option value="none">No outro</option>
                </select>
              </label>
            </div>
            <p className="hint">
              Uploaded choices use the assets in <a href="/settings/branding">global branding settings</a>. Existing jobs keep their own resolved branding.
            </p>
          </section>
          <section className="form-section">
            <div className="step-title">
              <span>04</span>
              <div>
                <h2>Choose your timing</h2>
                <p>Generate now or plan ahead.</p>
              </div>
            </div>
            <div className="radio-options">
              <label>
                <input
                  type="radio"
                  name="timing"
                  checked={timing === "now"}
                  onChange={() => setTiming("now")}
                />{" "}
                Generate now
              </label>
              <label>
                <input
                  type="radio"
                  name="timing"
                  checked={timing === "schedule"}
                  onChange={() => setTiming("schedule")}
                />{" "}
                Schedule
              </label>
            </div>
            {timing === "schedule" && (
              <label>
                Date and time ·{" "}
                {Intl.DateTimeFormat().resolvedOptions().timeZone}
                <input
                  required
                  type="datetime-local"
                  value={schedule}
                  onChange={(e) => setSchedule(e.target.value)}
                />
              </label>
            )}
          </section>
        </div>
        <aside className="create-summary">
          <div className="eyebrow">YOUR PRODUCTION</div>
          <h2>
            {urls.length + files.length}{" "}
            <span>video{urls.length + files.length !== 1 ? "s" : ""}</span>
          </h2>
          <dl>
            <dt>Web sources</dt>
            <dd>{urls.length}</dd>
            <dt>Uploaded files</dt>
            <dd>{files.length}</dd>
            <dt>Duration</dt>
            <dd>
              {durationMode === "auto" ? "Automatic" : `${seconds} seconds`}
            </dd>
            <dt>Generation</dt>
            <dd>{timing === "now" ? "When worker is ready" : "Scheduled"}</dd>
          </dl>
          <p>
            Each source gets its own plan, narration, voice and validated MP4.
          </p>
          {settings.workerPaused && (
            <div className="notice">
              Worker paused. Jobs will be saved until you start it in Settings.
            </div>
          )}
          {error && (
            <div role="alert" className="alert">
              {error}
            </div>
          )}
          <button className="button primary full" disabled={busy}>
            {busy
              ? "Validating sources…"
              : timing === "schedule"
                ? "Schedule videos →"
                : "Create video jobs →"}
          </button>
          <small>
            Generation uses your configured planner and voice providers.
          </small>
        </aside>
      </form>
    </>
  );
}
function Scheduler({
  jobs,
  actions,
}: {
  jobs: Job[];
  actions: (j: Job) => ReactNode;
}) {
  const scheduled = jobs
    .filter((j) => j.status === "SCHEDULED")
    .sort((a, b) => a.scheduledAt!.localeCompare(b.scheduledAt!));
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const group = (j: Job) =>
    new Date(j.scheduledAt!).toDateString() === today.toDateString()
      ? "Today"
      : new Date(j.scheduledAt!).toDateString() === tomorrow.toDateString()
        ? "Tomorrow"
        : Date.parse(j.scheduledAt!) < Date.now()
          ? "Due / awaiting worker"
          : "Later";
  return (
    <>
      <Header
        eyebrow="PLAN AHEAD"
        title="Scheduler"
        action={
          <a className="button primary" href="/videos/new">
            ＋ Schedule a video
          </a>
        }
      >
        Your production calendar, in{" "}
        {Intl.DateTimeFormat().resolvedOptions().timeZone}.
      </Header>
      <div className="worker-strip">
        Scheduled jobs run at or after their due time while the server and
        worker are running.
      </div>
      {scheduled.length ? (
        ["Due / awaiting worker", "Today", "Tomorrow", "Later"].map(
          (g) =>
            scheduled.some((j) => group(j) === g) && (
              <section className="schedule-group" key={g}>
                <div className="section-heading">
                  <h2>{g}</h2>
                  <span>
                    {scheduled.filter((j) => group(j) === g).length} JOBS
                  </span>
                </div>
                {scheduled
                  .filter((j) => group(j) === g)
                  .map((j) => (
                    <JobRow key={j.id} job={j} actions={actions(j)} />
                  ))}
              </section>
            ),
        )
      ) : (
        <Empty title="Room for what’s next">
          Schedule a source to build your upcoming production list.
        </Empty>
      )}
    </>
  );
}
function Library({ jobs }: { jobs: Job[] }) {
  const [search, setSearch] = useState(""),
    [sort, setSort] = useState("newest"),
    [theme, setTheme] = useState("");
  const filtered = jobs
    .filter(
      (j) =>
        (!theme || j.theme === theme) &&
        `${j.title} ${j.sourceReference}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "title"
        ? a.title.localeCompare(b.title)
        : sort === "duration"
          ? (b.actualDuration ?? 0) - (a.actualDuration ?? 0)
          : sort === "oldest"
            ? (a.completedAt ?? "").localeCompare(b.completedAt ?? "")
            : (b.completedAt ?? "").localeCompare(a.completedAt ?? ""),
    );
  return (
    <>
      <Header eyebrow="YOUR OUTPUT" title="Completed videos">
        Validated, narrated and ready to share.
      </Header>
      <div className="library-toolbar">
        <label className="search-label">
          Search videos
          <input
            type="search"
            placeholder="Search by title or source…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          Theme
          <select value={theme} onChange={(e) => setTheme(e.target.value)}>
            <option value="">All themes</option>
            {[...new Set(jobs.map((j) => j.theme))].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="title">Title</option>
            <option value="duration">Longest first</option>
          </select>
        </label>
      </div>
      <p className="hint">
        {filtered.length} validated video{filtered.length !== 1 ? "s" : ""}
      </p>
      {filtered.length ? (
        <div className="video-grid">
          {filtered.map((j) => (
            <article className="video-tile" key={j.id}>
              <a href={`/jobs/${j.id}?tab=Output`} className="poster">
                <img
                  src={artifact(j, "poster")}
                  alt={`Preview of ${j.title}`}
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
                <span className="play-symbol">▷</span>
                <span className="video-duration">
                  {duration(j.actualDuration)}
                </span>
              </a>
              <div className="video-tile-body">
                <Badge status={j.status} />
                <h3>
                  <a href={`/jobs/${j.id}`}>{j.title}</a>
                </h3>
                <p>{j.sourceOriginalName}</p>
                <small>
                  {date(j.completedAt)} · {j.theme}
                </small>
                <div className="row-actions">
                  <a href={`/jobs/${j.id}?tab=Output`}>Preview</a>
                  <a href={`${artifact(j)}?download=1`}>Download ↓</a>
                  <a href={`/jobs/${j.id}`}>Details ↗</a>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title={
            jobs.length ? "No matching videos" : "Your library starts here"
          }
        >
          {jobs.length
            ? "Try another search or theme filter."
            : "Completed videos appear only after the validation pipeline succeeds."}
        </Empty>
      )}
    </>
  );
}
type DetailData = {
  job: Job;
  events: JobEvent[];
  source: NormalizedSource | null;
  plan: VideoPlan | null;
  narration: string | null;
  audioDuration: number | null;
};
function Detail({
  id,
  actions,
}: {
  id: string;
  actions: (j: Job) => ReactNode;
}) {
  const [data, setData] = useState<DetailData>(),
    [error, setError] = useState(""),
    [tab, setTab] = useState(
      new URLSearchParams(location.search).get("tab") ?? "Overview",
    );
  useEffect(() => {
    let live = true;
    const update = () =>
      api<DetailData>(`/jobs/${id}`)
        .then((d) => {
          if (live) {
            setData(d);
            setError("");
          }
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    void update();
    const timer = setInterval(() => void update(), 2500);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [id]);
  if (error)
    return (
      <div className="alert" role="alert">
        {error}
      </div>
    );
  if (!data)
    return (
      <div className="skeleton">
        <div />
        <div />
      </div>
    );
  const { job, events, source, plan } = data;
  const timeline = [
    "SOURCE_ACCEPTED",
    "EXTRACTING",
    "PLANNING",
    "NARRATION_PREPARED",
    "GENERATING_VOICE",
    "ALIGNING_TIMING",
    "RENDERING",
    "VALIDATING",
    "COMPLETED",
  ];
  return (
    <>
      <a className="back-link" href="/queue">
        ← Job queue
      </a>
      <Header
        eyebrow={`JOB ${id.slice(0, 8)}`}
        title={job.title}
        action={<Badge status={job.status} />}
      >
        {job.sourceReference}
      </Header>
      <div className="detail-meta">
        <span>Created {date(job.createdAt)}</span>
        {job.scheduledAt && <span>Scheduled {date(job.scheduledAt)}</span>}
        <span>{job.theme}</span>
        <span>Attempt {job.attempt}</span>
      </div>
      <div className="detail-actions">{actions(job)}</div>
      {job.errorMessage && (
        <div className="alert" role="alert">
          <strong>{label(job.errorStage ?? "Generation")} failed</strong>
          <p>{job.errorMessage}</p>
          <span>
            Saved source, plan and audio artifacts are retained for retry.
          </span>
        </div>
      )}
      <div className="tabs detail-tabs" role="tablist" aria-label="Job details">
        {[
          "Overview",
          "Source",
          "Video Plan",
          "Narration",
          "Output",
          "Logs",
        ].map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="detail-body">
        {tab === "Overview" ? (
          <>
            <h2>Production timeline</h2>
            <p className="hint">
              Stage timestamps from this job’s latest attempt.
            </p>
            <div className="timeline">
              {timeline.map((stage) => {
                const list = events.filter(
                  (e) =>
                    e.stage === stage &&
                    (stage === "SOURCE_ACCEPTED" || e.attempt === job.attempt),
                );
                const start = list.find((e) => e.status === "STARTED"),
                  end = list.findLast((e) => e.status === "COMPLETED"),
                  failure = list.findLast((e) => e.status === "FAILED");
                return (
                  <div
                    className={`timeline-item ${failure ? "has-error" : end ? "finished" : start ? "current" : ""}`}
                    key={stage}
                  >
                    <span className="timeline-marker">
                      {end ? "✓" : failure ? "!" : ""}
                    </span>
                    <div>
                      <h3>{label(stage)}</h3>
                      <p>
                        {failure
                          ? failure.message
                          : end
                            ? `Completed ${date(end.createdAt)}`
                            : start
                              ? "In progress"
                              : "Waiting"}
                      </p>
                      {start && <small>Started {date(start.createdAt)}</small>}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : tab === "Source" ? (
          <>
            <h2>Source record</h2>
            <dl className="metadata">
              <dt>Identity</dt>
              <dd>{job.sourceReference}</dd>
              <dt>Location</dt>
              <dd>{label(job.sourceLocationType)}</dd>
              <dt>Format</dt>
              <dd>{job.sourceType}</dd>
              {source?.provenance.pageCount && (
                <>
                  <dt>Pages</dt>
                  <dd>{source.provenance.pageCount}</dd>
                </>
              )}
              {source?.provenance.slideCount && (
                <>
                  <dt>Slides</dt>
                  <dd>{source.provenance.slideCount}</dd>
                </>
              )}
            </dl>
            {source ? (
              <>
                {source.provenance.warnings.map((w) => (
                  <p className="notice" key={w}>
                    {w}
                  </p>
                ))}
                <h3>Extracted content</h3>
                <pre>{source.content}</pre>
                {source.provenance.assets.length > 0 && (
                  <details>
                    <summary>
                      Embedded asset metadata ({source.provenance.assets.length}
                      )
                    </summary>
                    {source.provenance.assets.map((a) => (
                      <p key={a.name}>
                        {a.name} · {a.bytes} bytes
                      </p>
                    ))}
                  </details>
                )}
              </>
            ) : (
              <p className="muted-block">
                Content extraction begins when the worker picks this job.
              </p>
            )}
          </>
        ) : tab === "Video Plan" ? (
          <>
            {plan ? (
              <>
                <div className="plan-stats">
                  <div>
                    <small>Duration</small>
                    <strong>{duration(plan.durationSeconds)}</strong>
                  </div>
                  <div>
                    <small>Frame rate</small>
                    <strong>{plan.fps} FPS</strong>
                  </div>
                  <div>
                    <small>Resolution</small>
                    <strong>
                      {plan.width} × {plan.height}
                    </strong>
                  </div>
                  <div>
                    <small>Scenes</small>
                    <strong>{plan.scenes.length}</strong>
                  </div>
                </div>
                <p className="hint">Theme: {plan.theme}</p>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Visual type</th>
                        <th>Headline</th>
                        <th>Timing</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.scenes.map((s, i) => (
                        <tr key={s.id}>
                          <td>{i + 1}</td>
                          <td>{s.type}</td>
                          <td>{s.headline}</td>
                          <td>
                            {(s.startFrame / plan.fps).toFixed(1)}–
                            {(
                              (s.startFrame + s.durationInFrames) /
                              plan.fps
                            ).toFixed(1)}
                            s
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="muted-block">
                The structured video plan will appear after planning succeeds.
              </p>
            )}
          </>
        ) : tab === "Narration" ? (
          <>
            <h2>Generated narration</h2>
            <p className="hint">
              {data.audioDuration
                ? `Measured voice duration: ${data.audioDuration.toFixed(2)} seconds`
                : "Measured audio duration will appear after voice generation."}
            </p>
            {data.narration ? (
              <div className="narration">{data.narration}</div>
            ) : (
              <p className="muted-block">
                Narration has not been prepared yet.
              </p>
            )}
          </>
        ) : tab === "Output" ? (
          <>
            {job.status === "COMPLETED" ? (
              <>
                <video
                  className="video-player"
                  controls
                  preload="metadata"
                  poster={artifact(job, "poster")}
                  src={artifact(job)}
                />
                <div className="output-footer">
                  <span>
                    <Badge status="COMPLETED" /> {duration(job.actualDuration)}{" "}
                    · H.264 MP4
                  </span>
                  <a
                    className="button primary"
                    href={`${artifact(job)}?download=1`}
                  >
                    Download MP4 ↓
                  </a>
                </div>
              </>
            ) : (
              <Empty title="Output is still ahead">
                Preview and download unlock after successful validation.
              </Empty>
            )}
          </>
        ) : (
          <>
            <h2>Stage log</h2>
            <div className="logs">
              {events.map((e) => (
                <div key={e.id}>
                  <time>{date(e.createdAt)}</time>
                  <span>
                    #{e.attempt} {label(e.stage)}
                  </span>
                  <p>{e.message}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
function SettingsPage({
  settings,
  refresh,
  notify,
}: {
  settings: SettingsView;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [theme, setTheme] = useState(settings.theme),
    [concurrency, setConcurrency] = useState(settings.concurrency),
    [autoStart, setAutoStart] = useState(settings.autoStart),
    [durationMode, setDurationMode] = useState(settings.durationMode),
    [seconds, setSeconds] = useState(settings.durationSeconds ?? 60),
    [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/settings", {
        method: "PUT",
        body: JSON.stringify({
          theme,
          concurrency,
          autoStart,
          durationMode,
          ...(durationMode === "fixed" ? { durationSeconds: seconds } : {}),
        }),
      });
      await refresh();
      notify("Settings saved.");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const toggle = async () => {
    if (
      settings.workerPaused &&
      !window.confirm(
        "Start the worker? Due jobs will use the configured OpenRouter and ElevenLabs services and may incur charges.",
      )
    )
      return;
    try {
      await api("/worker", {
        method: "POST",
        body: JSON.stringify({ paused: !settings.workerPaused }),
      });
      await refresh();
      notify(
        settings.workerPaused
          ? "Worker started."
          : "Worker paused. Active jobs will finish safely.",
      );
    } catch (e) {
      notify((e as Error).message);
    }
  };
  return (
    <>
      <Header
        eyebrow="WORKSPACE CONFIGURATION"
        title="Settings"
        action={<a className="button subtle" href="/settings/branding">Video branding →</a>}
      >
        Your defaults, providers and production worker.
      </Header>
      <form onSubmit={save} className="settings-form">
        <section className="settings-section">
          <div>
            <h2>Video defaults</h2>
            <p>
              Applied to new jobs. Existing jobs retain their configuration.
            </p>
          </div>
          <div>
            <label>
              Theme
              <select value={theme} onChange={(e) => setTheme(e.target.value)}>
                {settings.themes.map((t) => (
                  <option value={t.id} key={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Duration
              <select
                value={durationMode}
                onChange={(e) =>
                  setDurationMode(e.target.value as "auto" | "fixed")
                }
              >
                <option value="auto">Automatic</option>
                <option value="fixed">Fixed</option>
              </select>
            </label>
            {durationMode === "fixed" && (
              <label>
                Seconds
                <input
                  type="number"
                  min="1"
                  required
                  value={seconds}
                  onChange={(e) => setSeconds(Number(e.target.value))}
                />
              </label>
            )}
          </div>
        </section>
        <section className="settings-section">
          <div>
            <h2>Connected providers</h2>
            <p>Credentials are configured locally on the server.</p>
          </div>
          <div className="provider-list">
            {[
              ["OpenRouter API key", settings.plannerConfigured],
              ["ElevenLabs API key", settings.voiceConfigured],
              ["ElevenLabs voice", settings.voiceIdConfigured],
            ].map(([name, configured]) => (
              <div key={String(name)}>
                <span>{name}</span>
                <strong className={configured ? "valid-text" : "muted"}>
                  {configured ? "Configured ✓" : "Not configured"}
                </strong>
              </div>
            ))}
            <p className="hint">
              Planner: {settings.plannerModel}
              <br />
              Voice model: {settings.voiceModel}
            </p>
          </div>
        </section>
        <section className="settings-section">
          <div>
            <h2>Worker</h2>
            <p>
              Pick due jobs automatically while the server is running. Pause
              stops new claims; active jobs finish safely.
            </p>
          </div>
          <div>
            <div className="worker-control">
              <Badge status={settings.workerPaused ? "PAUSED" : "RUNNING"} />
              <button
                type="button"
                className="button subtle"
                disabled={settings.offline}
                onClick={() => void toggle()}
              >
                {settings.workerPaused ? "Start worker" : "Pause worker"}
              </button>
            </div>
            {settings.offline && (
              <p className="notice">
                Offline verification mode prevents job execution.
              </p>
            )}
            <label>
              Concurrent job preparation
              <select
                value={concurrency}
                onChange={(e) => setConcurrency(Number(e.target.value))}
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <p className="hint">
              The existing video engine runs one job at a time. Source
              preparation can run concurrently.
            </p>
            <label className="check-label">
              <input
                type="checkbox"
                checked={autoStart}
                onChange={(e) => setAutoStart(e.target.checked)}
              />{" "}
              Start worker automatically on server startup
            </label>
            <p className="hint">
              Default timing: generate when eligible. Scheduled times are stored
              in UTC and displayed in your local timezone.
            </p>
          </div>
        </section>
        <section className="settings-section">
          <div>
            <h2>Storage & output</h2>
            <p>Persistent, managed storage within this project.</p>
          </div>
          <div>
            <p>{settings.storage}</p>
            <p>{settings.output}</p>
            <p className="hint">
              Uploads and cached artifacts remain available across restarts and
              retries.
            </p>
          </div>
        </section>
        <div className="settings-save">
          <button className="button primary" disabled={busy}>
            {busy ? "Saving…" : "Save settings"}
          </button>
        </div>
      </form>
    </>
  );
}

type BrandingSlot = "logo" | "intro" | "outro";
type BrandingMode = "dynamic" | "uploaded" | "none";

function BrandingAssetControl({
  slot,
  asset,
  accept,
  label,
  busy,
  onUpload,
  onRemove,
}: {
  slot: BrandingSlot;
  asset?: string;
  accept: string;
  label: string;
  busy: boolean;
  onUpload: (file: File) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const id = `branding-${slot}-asset`;
  return (
    <div className="asset-control">
      <div className="asset-preview">
        {asset && slot === "logo" ? (
          <img src={`/api/branding/assets/logo?asset=${encodeURIComponent(asset)}`} alt="Current brand logo" />
        ) : asset ? (
          <video src={`/api/branding/assets/${slot}?asset=${encodeURIComponent(asset)}`} muted preload="metadata" aria-label={`Current uploaded ${slot} video`} />
        ) : (
          <span aria-hidden="true">◇</span>
        )}
      </div>
      <div>
        <strong>{asset ? `Current ${label.toLowerCase()}` : `No ${label.toLowerCase()} uploaded`}</strong>
        <small>{asset ?? `Choose a ${label.toLowerCase()} to make it available globally.`}</small>
        <div className="asset-actions">
          <label className="button subtle" htmlFor={id}>
            {asset ? "Replace" : "Upload"}
          </label>
          <input
            className="visually-hidden"
            id={id}
            type="file"
            accept={accept}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) void onUpload(file);
            }}
          />
          {asset && (
            <button className="button text-button" type="button" onClick={() => void onRemove()} disabled={busy}>
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function BrandingPage({ notify }: { notify: (message: string) => void }) {
  const [data, setData] = useState<BrandingView>();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<BrandingSlot>();
  const [previewTitle, setPreviewTitle] = useState("AWS Data Engineering");
  const [preview, setPreview] = useState<ResolvedBranding>();
  useEffect(() => {
    let mounted = true;
    void api<BrandingView>("/branding")
      .then((result) => {
        if (mounted) setData(result);
      })
      .catch((reason: Error) => {
        if (mounted) setError(reason.message);
      });
    return () => {
      mounted = false;
    };
  }, []);
  const update = (change: (branding: BrandingConfig) => BrandingConfig) =>
    setData((current) =>
      current ? { ...current, branding: change(current.branding) } : current,
    );
  const updateBrand = (key: keyof BrandingView["brand"], value: string) =>
    setData((current) =>
      current ? { ...current, brand: { ...current.brand, [key]: value } } : current,
    );
  const saveBranding = async () => {
    if (!data) return;
    setSaving(true);
    setError("");
    try {
      const result = await api<BrandingView>("/branding", {
        method: "PUT",
        body: JSON.stringify(data),
      });
      setData(result);
      notify("Global video branding saved.");
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const upload = async (slot: BrandingSlot, file: File) => {
    setUploading(slot);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await api<{ asset: string; branding: BrandingView }>(
        `/branding/assets/${slot}`,
        { method: "POST", body: form },
      );
      setData(result.branding);
      notify(`${slot[0].toUpperCase()}${slot.slice(1)} asset uploaded.`);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setUploading(undefined);
    }
  };
  const remove = async (slot: BrandingSlot) => {
    setUploading(slot);
    setError("");
    try {
      setData(await api<BrandingView>(`/branding/assets/${slot}`, { method: "DELETE" }));
      notify(`${slot[0].toUpperCase()}${slot.slice(1)} asset removed.`);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setUploading(undefined);
    }
  };
  const previewBranding = async () => {
    if (!data) return;
    setError("");
    try {
      const result = await api<{ branding: ResolvedBranding }>("/branding/preview", {
        method: "POST",
        body: JSON.stringify({
          title: previewTitle.trim() || "AWS Data Engineering",
          brand: data.brand,
          branding: data.branding,
        }),
      });
      setPreview(result.branding);
      notify("Branding preview updated locally.");
    } catch (reason) {
      setError((reason as Error).message);
    }
  };
  if (!data)
    return error ? (
      <div className="alert" role="alert">{error}</div>
    ) : (
      <div className="skeleton" aria-label="Loading branding settings"><div /><div /></div>
    );
  const { brand, branding } = data;
  const setIntro = (change: Partial<BrandingConfig["intro"]>) =>
    update((value) => ({ ...value, intro: { ...value.intro, ...change } }));
  const setOutro = (change: Partial<BrandingConfig["outro"]>) =>
    update((value) => ({ ...value, outro: { ...value.outro, ...change } }));
  return (
    <>
      <Header
        eyebrow="GLOBAL VIDEO BRANDING"
        title="Branding"
        action={<a className="button subtle" href="/settings">← Settings</a>}
      >
        Set the shared identity, intro and outro used by new video jobs. Previewing stays local and never contacts a planner or voice provider.
      </Header>
      {error && <div className="alert" role="alert">{error}</div>}
      <div className="branding-layout">
        <div className="branding-form">
          <section className="branding-section">
            <div>
              <div className="eyebrow">IDENTITY</div>
              <h2>Global brand details</h2>
              <p>These values are resolved into each new job so later global edits do not rewrite existing output.</p>
            </div>
            <div className="fields">
              <label>Brand name<input value={brand.name} onChange={(e) => updateBrand("name", e.target.value)} /></label>
              <label>Tagline<input value={brand.tagline} onChange={(e) => updateBrand("tagline", e.target.value)} /></label>
              <label>Call to action<input value={brand.cta} onChange={(e) => updateBrand("cta", e.target.value)} /></label>
              <label>Website<input value={brand.website} onChange={(e) => updateBrand("website", e.target.value)} /></label>
              <label>Email<input type="email" value={brand.email} onChange={(e) => updateBrand("email", e.target.value)} /></label>
              <label>Phone<input value={brand.phone} onChange={(e) => updateBrand("phone", e.target.value)} /></label>
              <label className="full-field">Address<textarea rows={2} value={brand.address} onChange={(e) => updateBrand("address", e.target.value)} /></label>
            </div>
            <BrandingAssetControl
              slot="logo"
              asset={branding.logoAsset}
              accept="image/png,image/jpeg,image/webp"
              label="Logo"
              busy={uploading === "logo"}
              onUpload={(file) => upload("logo", file)}
              onRemove={() => remove("logo")}
            />
          </section>
          <section className="branding-section">
            <div>
              <div className="eyebrow">OPENING</div>
              <h2>Intro</h2>
              <p>The default dynamic intro lasts exactly four seconds: logo, brand name, tagline, then a short hold. Frame timing follows each video plan’s FPS.</p>
            </div>
            <div className="branding-controls">
              <label className="check-label"><input type="checkbox" checked={branding.intro.enabled} onChange={(e) => setIntro({ enabled: e.target.checked })} /> Include an intro</label>
              <div className="fields">
                <label>Intro mode<select value={branding.intro.mode} onChange={(e) => setIntro({ mode: e.target.value as BrandingMode })}><option value="dynamic">Dynamic</option><option value="uploaded">Uploaded video</option><option value="none">None</option></select></label>
                <label>Duration in seconds<input type="number" min="0.1" max="30" step="0.1" disabled={!branding.intro.enabled || branding.intro.mode === "none"} value={branding.intro.durationSeconds} onChange={(e) => setIntro({ durationSeconds: Number(e.target.value) })} /></label>
              </div>
              <BrandingAssetControl
                slot="intro"
                asset={branding.intro.asset}
                accept="video/mp4,video/webm"
                label="Intro video"
                busy={uploading === "intro"}
                onUpload={(file) => upload("intro", file)}
                onRemove={() => remove("intro")}
              />
              {branding.intro.enabled && branding.intro.mode === "dynamic" && <div className="animation-grid">
                {([
                  ["logo", "Logo"],
                  ["brandName", "Brand name"],
                  ["tagline", "Tagline"],
                ] as const).map(([key, name]) => {
                  const item = branding.intro[key];
                  return <fieldset key={key}><legend>{name}</legend><label className="check-label"><input type="checkbox" checked={item.enabled} onChange={(e) => setIntro({ [key]: { ...item, enabled: e.target.checked } })} /> Show</label><label>Animation<select value={item.animation} onChange={(e) => setIntro({ [key]: { ...item, animation: e.target.value as "enter-scale" | "fade-up" | "fade" } })}><option value="enter-scale">Enter and scale</option><option value="fade-up">Fade up</option><option value="fade">Fade</option></select></label><label>Seconds<input type="number" min="0.1" max="15" step="0.1" value={item.durationSeconds} onChange={(e) => setIntro({ [key]: { ...item, durationSeconds: Number(e.target.value) } })} /></label></fieldset>;
                })}
                <label>Hold after tagline<input type="number" min="0" max="15" step="0.1" value={branding.intro.holdDurationSeconds} onChange={(e) => setIntro({ holdDurationSeconds: Number(e.target.value) })} /></label>
              </div>}
            </div>
          </section>
          <section className="branding-section">
            <div>
              <div className="eyebrow">CLOSING</div>
              <h2>Outro</h2>
              <p>Dynamic outros use your shared contact details and call to action. A QR code is created only for the HTTPS destination you supply.</p>
            </div>
            <div className="branding-controls">
              <label className="check-label"><input type="checkbox" checked={branding.outro.enabled} onChange={(e) => setOutro({ enabled: e.target.checked })} /> Include an outro</label>
              <div className="fields">
                <label>Outro mode<select value={branding.outro.mode} onChange={(e) => setOutro({ mode: e.target.value as BrandingMode })}><option value="dynamic">Dynamic</option><option value="uploaded">Uploaded video</option><option value="none">None</option></select></label>
                <label>Duration in seconds<input type="number" min="0.1" max="30" step="0.1" disabled={!branding.outro.enabled || branding.outro.mode === "none"} value={branding.outro.durationSeconds} onChange={(e) => setOutro({ durationSeconds: Number(e.target.value) })} /></label>
              </div>
              <BrandingAssetControl
                slot="outro"
                asset={branding.outro.asset}
                accept="video/mp4,video/webm"
                label="Outro video"
                busy={uploading === "outro"}
                onUpload={(file) => upload("outro", file)}
                onRemove={() => remove("outro")}
              />
              {branding.outro.enabled && branding.outro.mode === "dynamic" && <>
                <div className="toggle-grid">
                  {([
                    ["showVideoTitle", "Video title"], ["showWebsite", "Website"], ["showEmail", "Email"], ["showPhone", "Phone"], ["showAddress", "Address"], ["showTagline", "Tagline"],
                  ] as const).map(([key, name]) => <label className="check-label" key={key}><input type="checkbox" checked={branding.outro[key]} onChange={(e) => setOutro({ [key]: e.target.checked })} /> Show {name}</label>)}
                </div>
                <fieldset className="qr-settings"><legend>QR code</legend><label className="check-label"><input type="checkbox" checked={branding.outro.showQrCode} onChange={(e) => setOutro({ showQrCode: e.target.checked })} /> Show a QR code</label>{branding.outro.showQrCode && <div className="fields"><label className="full-field">HTTPS destination<input type="url" placeholder="https://example.com/enroll" value={branding.outro.qrDestination ?? ""} onChange={(e) => setOutro({ qrDestination: e.target.value || undefined })} /></label><label>Size in pixels<input type="number" min="1" max="600" value={branding.outro.qrSize} onChange={(e) => setOutro({ qrSize: Number(e.target.value) })} /></label><label>Position<select value={branding.outro.qrPosition} onChange={(e) => setOutro({ qrPosition: e.target.value as "left" | "right" })}><option value="right">Right</option><option value="left">Left</option></select></label><label className="full-field">Label<input value={branding.outro.qrLabel} onChange={(e) => setOutro({ qrLabel: e.target.value })} /></label></div>}<p className="hint">Leave the destination blank to keep the QR code out of the rendered video.</p></fieldset>
              </>}
            </div>
          </section>
          <div className="branding-actions">
            <button className="button primary" type="button" disabled={saving || Boolean(uploading)} onClick={() => void saveBranding()}>{saving ? "Saving…" : "Save branding"}</button>
          </div>
        </div>
        <aside className="branding-preview-panel">
          <div className="eyebrow">LOCAL PREVIEW</div>
          <h2>Check the resolved output</h2>
          <p>This preview only resolves your local configuration. It does not call OpenRouter or ElevenLabs.</p>
          <label>Sample video title<input value={previewTitle} maxLength={160} onChange={(e) => setPreviewTitle(e.target.value)} /></label>
          <button className="button subtle full" type="button" onClick={() => void previewBranding()}>Preview branding</button>
          {preview ? <div className="resolved-preview" aria-live="polite"><div className="preview-mark">{preview.logoAsset ? <img src={`/api/branding/assets/logo?asset=${encodeURIComponent(preview.logoAsset)}`} alt={`${preview.brandName} logo`} /> : <span aria-hidden="true">t.</span>}</div><strong>{preview.brandName}</strong><span>{preview.tagline}</span><h3>{preview.videoTitle}</h3><p>{preview.cta}</p><dl><dt>Intro</dt><dd>{preview.intro.enabled ? `${preview.intro.mode} · ${preview.intro.frames} frames` : "Off"}</dd><dt>Outro</dt><dd>{preview.outro.enabled ? `${preview.outro.mode} · ${preview.outro.frames} frames` : "Off"}</dd><dt>QR code</dt><dd>{preview.outro.qrEnabled ? "Configured" : "Off"}</dd></dl></div> : <p className="hint">Choose Preview branding to see the title, resolved timing and QR status.</p>}
        </aside>
      </div>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
