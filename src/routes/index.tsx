import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Gauge,
  Loader2,
  Search,
  Smartphone,
  XCircle,
} from "lucide-react";

import { ScoreGauge, scoreTone } from "@/components/ScoreGauge";
import { isValidUrl, runAudit, type AuditResult, type Issue, type Severity } from "@/lib/audit";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SEO Auditor — Free Website SEO Health Check" },
      {
        name: "description",
        content:
          "Paste any URL and get an instant SEO health report: on-page checks, Core Web Vitals performance, and technical issues scored 0-100.",
      },
      { property: "og:title", content: "SEO Auditor — Free Website SEO Health Check" },
      {
        property: "og:description",
        content:
          "Instant SEO health report for any URL: on-page, performance and technical scores with plain-English fixes.",
      },
    ],
  }),
  component: Index,
});

type Phase = "input" | "loading" | "results";

function Index() {
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<Phase>("input");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AuditResult | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidUrl(url)) {
      setError("That doesn't look like a valid website address. Try something like example.com");
      return;
    }
    setError(null);
    setPhase("loading");
    try {
      const res = await runAudit(url);
      setResult(res);
      setPhase("results");
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "We couldn't scan this page — it may be blocking automated requests. Try another URL.",
      );
      setPhase("input");
    }
  }

  function reset() {
    setResult(null);
    setError(null);
    setPhase("input");
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-5xl px-6 py-12">
        <header className="flex items-center gap-2 text-sm font-medium text-foreground">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Search className="size-4" />
          </span>
          SEO Auditor
        </header>

        {phase === "results" && result ? (
          <Results result={result} onReset={reset} />
        ) : (
          <InputScreen
            url={url}
            setUrl={setUrl}
            onSubmit={handleSubmit}
            loading={phase === "loading"}
            error={error}
          />
        )}
      </div>
    </main>
  );
}

/* ------------------------------- Input ------------------------------ */

function InputScreen({
  url,
  setUrl,
  onSubmit,
  loading,
  error,
}: {
  url: string;
  setUrl: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  loading: boolean;
  error: string | null;
}) {
  return (
    <section className="flex min-h-[70vh] flex-col items-center justify-center text-center">
      <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
        Audit any website&apos;s SEO in seconds
      </h1>
      <p className="mt-4 max-w-lg text-base text-muted-foreground">
        Paste a URL and get a plain-English health report covering on-page tags, page speed and
        technical setup.
      </p>

      <form onSubmit={onSubmit} className="mt-10 w-full max-w-xl">
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={loading}
            placeholder="example.com"
            aria-label="Website URL"
            className="h-12 flex-1 rounded-xl border border-border bg-card px-4 text-base text-foreground shadow-[var(--shadow-card)] outline-none transition placeholder:text-muted-foreground focus:border-ring focus:ring-4 focus:ring-ring/15 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : null}
            {loading ? "Scanning…" : "Run Audit"}
            {!loading && <ArrowRight className="size-4" />}
          </button>
        </div>

        {error ? (
          <p className="mt-4 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </form>

      {loading ? (
        <div className="mt-10 flex flex-col items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="size-6 animate-spin text-primary" />
          <p>Scanning page… this can take up to a minute.</p>
        </div>
      ) : null}
    </section>
  );
}

/* ------------------------------ Results ----------------------------- */

const CATEGORY_META = [
  { key: "onPage", label: "On-Page SEO", icon: Search },
  { key: "performance", label: "Performance", icon: Gauge },
  { key: "technical", label: "Mobile & Technical", icon: Smartphone },
] as const;

const toneColor = {
  good: "var(--score-good)",
  mid: "var(--score-mid)",
  bad: "var(--score-bad)",
};

function Results({ result, onReset }: { result: AuditResult; onReset: () => void }) {
  return (
    <section className="py-10">
      <div className="flex flex-col items-center text-center">
        <p className="text-sm text-muted-foreground">Report for</p>
        <p className="mt-1 max-w-full truncate text-lg font-medium text-foreground">{result.url}</p>
        <div className="mt-8">
          <ScoreGauge score={result.overallScore} label="Overall SEO score" />
        </div>
      </div>

      {result.warnings.length > 0 ? (
        <div className="mt-8 rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-muted-foreground">
          {result.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      ) : null}

      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {CATEGORY_META.map(({ key, label, icon: Icon }) => {
          const score = result.categories[key];
          return (
            <div
              key={key}
              className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]"
            >
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Icon className="size-4" />
                {label}
              </div>
              <div className="mt-4 flex items-end gap-1">
                <span
                  className="text-4xl font-semibold tabular-nums tracking-tight"
                  style={{ color: score === null ? "var(--color-muted-foreground)" : toneColor[scoreTone(score)] }}
                >
                  {score === null ? "—" : score}
                </span>
                <span className="pb-1 text-sm text-muted-foreground">/ 100</span>
              </div>
              <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${score ?? 0}%`,
                    backgroundColor: score === null ? "transparent" : toneColor[scoreTone(score)],
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-12">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Issues Found</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {result.issues.filter((i) => i.severity !== "passed").length} things to look at,{" "}
          {result.issues.filter((i) => i.severity === "passed").length} checks passed.
        </p>
        <div className="mt-5 space-y-3">
          {result.issues.map((issue) => (
            <IssueCard key={issue.id} issue={issue} />
          ))}
        </div>
      </div>

      <div className="mt-12 flex justify-center">
        <button
          onClick={onReset}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 text-sm font-medium text-foreground shadow-[var(--shadow-card)] transition hover:bg-secondary"
        >
          Run another audit
        </button>
      </div>
    </section>
  );
}

const SEVERITY_META: Record<
  Severity,
  { label: string; icon: typeof CheckCircle2; color: string; bg: string }
> = {
  critical: {
    label: "Critical",
    icon: XCircle,
    color: "var(--score-bad)",
    bg: "color-mix(in oklab, var(--score-bad) 10%, transparent)",
  },
  warning: {
    label: "Warning",
    icon: AlertTriangle,
    color: "var(--score-mid)",
    bg: "color-mix(in oklab, var(--score-mid) 14%, transparent)",
  },
  passed: {
    label: "Passed",
    icon: CheckCircle2,
    color: "var(--score-good)",
    bg: "color-mix(in oklab, var(--score-good) 12%, transparent)",
  },
};

function IssueCard({ issue }: { issue: Issue }) {
  const [open, setOpen] = useState(issue.severity === "critical");
  const meta = SEVERITY_META[issue.severity];
  const Icon = meta.icon;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-secondary/60"
      >
        <Icon className="size-5 shrink-0" style={{ color: meta.color }} />
        <span className="flex-1 text-sm font-medium text-foreground">{issue.title}</span>
        <span
          className="hidden rounded-full px-2.5 py-1 text-xs font-medium sm:inline"
          style={{ color: meta.color, backgroundColor: meta.bg }}
        >
          {meta.label}
        </span>
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <div className="border-t border-border px-5 py-4 text-sm leading-relaxed text-muted-foreground">
          {issue.description}
        </div>
      ) : null}
    </div>
  );
}
