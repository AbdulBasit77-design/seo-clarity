/**
 * SEO Auditor — all audit logic lives here.
 *
 * Tweak scoring rules in one place:
 *  - ON_PAGE_CHECKS  : each check returns an Issue; score = passed weight / total weight
 *  - TECHNICAL_CHECKS: same idea for robots/sitemap/https/noindex
 *  - performance     : comes straight from PageSpeed Insights (0-1 -> 0-100)
 *
 * Runs entirely in the browser. Page HTML is fetched through a public CORS
 * proxy because most sites block direct cross-origin requests.
 */

export type Severity = "critical" | "warning" | "passed";
export type CategoryKey = "onPage" | "performance" | "technical";

export interface Issue {
  id: string;
  category: CategoryKey;
  severity: Severity;
  title: string;
  description: string;
}

export interface AuditResult {
  url: string;
  overallScore: number;
  categories: Record<CategoryKey, number | null>;
  issues: Issue[];
  /** Non-fatal notes, e.g. "performance check unavailable". */
  warnings: string[];
}

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

/** Plug a Google API key here if you hit rate limits (leave "" for keyless). */
const PAGESPEED_API_KEY = "";

const PAGESPEED_ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

/** Public CORS proxy used to fetch the target page's HTML / robots / sitemap. */
const proxy = (target: string) =>
  `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function isValidUrl(input: string): boolean {
  try {
    const u = new URL(normalizeUrl(input));
    return /^https?:$/.test(u.protocol) && /\./.test(u.hostname) && u.hostname.length > 3;
  } catch {
    return false;
  }
}

const issue = (
  id: string,
  category: CategoryKey,
  severity: Severity,
  title: string,
  description: string,
): Issue => ({ id, category, severity, title, description });

/** passed = 1 point, warning = 0.5, critical = 0. */
function scoreFromIssues(issues: Issue[]): number {
  if (issues.length === 0) return 0;
  const total = issues.reduce(
    (sum, i) => sum + (i.severity === "passed" ? 1 : i.severity === "warning" ? 0.5 : 0),
    0,
  );
  return Math.round((total / issues.length) * 100);
}

async function fetchText(url: string, timeoutMs = 20000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(proxy(url), { signal: controller.signal });
    if (!res.ok) throw new Error(`Proxy responded ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/* 1. Performance — Google PageSpeed Insights                          */
/* ------------------------------------------------------------------ */

async function runPerformanceAudit(
  url: string,
): Promise<{ score: number; issues: Issue[] }> {
  const params = new URLSearchParams({ url, strategy: "mobile" });
  if (PAGESPEED_API_KEY) params.set("key", PAGESPEED_API_KEY);

  const res = await fetch(`${PAGESPEED_ENDPOINT}?${params.toString()}`);
  if (!res.ok) throw new Error(`PageSpeed responded ${res.status}`);
  const data = await res.json();

  const lh = data?.lighthouseResult;
  const audits = lh?.audits ?? {};
  const rawScore = lh?.categories?.performance?.score;
  const score = typeof rawScore === "number" ? Math.round(rawScore * 100) : 0;

  const issues: Issue[] = [];

  const metric = (
    id: string,
    key: string,
    label: string,
    goodMs: number,
    poorMs: number,
    unit: "s" | "",
  ) => {
    const a = audits[key];
    if (!a || typeof a.numericValue !== "number") return;
    const v = a.numericValue;
    const shown = a.displayValue ?? (unit === "s" ? `${(v / 1000).toFixed(1)}s` : `${v}`);
    const severity: Severity = v <= goodMs ? "passed" : v <= poorMs ? "warning" : "critical";
    issues.push(
      issue(
        id,
        "performance",
        severity,
        severity === "passed" ? `${label} is good (${shown})` : `${label} is slow (${shown})`,
        severity === "passed"
          ? `${label} is within Google's recommended threshold, which supports both rankings and user experience.`
          : `Google recommends keeping ${label} under ${(goodMs / 1000).toFixed(1)}s. Slower values can hurt rankings and make the page feel sluggish.`,
      ),
    );
  };

  metric("lcp", "largest-contentful-paint", "Largest Contentful Paint", 2500, 4000, "s");
  metric("inp", "interactive", "Time to Interactive", 3800, 7300, "s");
  metric("tbt", "total-blocking-time", "Total Blocking Time", 200, 600, "");

  const cls = audits["cumulative-layout-shift"];
  if (cls && typeof cls.numericValue === "number") {
    const v = cls.numericValue;
    const severity: Severity = v <= 0.1 ? "passed" : v <= 0.25 ? "warning" : "critical";
    issues.push(
      issue(
        "cls",
        "performance",
        severity,
        `Cumulative Layout Shift ${severity === "passed" ? "is stable" : "is high"} (${cls.displayValue ?? v.toFixed(3)})`,
        "Layout shift measures how much content jumps around while loading. Google recommends staying at or below 0.1.",
      ),
    );
  }

  issues.push(
    issue(
      "perf-score",
      "performance",
      score >= 80 ? "passed" : score >= 50 ? "warning" : "critical",
      `Overall PageSpeed performance score: ${score}/100`,
      "This is Google's own mobile performance grade for the page, based on real Lighthouse measurements.",
    ),
  );

  return { score, issues };
}

/* ------------------------------------------------------------------ */
/* 2 + 3. On-page and technical checks from the page HTML              */
/* ------------------------------------------------------------------ */

function runOnPageChecks(doc: Document, pageUrl: URL): Issue[] {
  const issues: Issue[] = [];

  // Title tag
  const title = doc.querySelector("title")?.textContent?.trim() ?? "";
  if (!title) {
    issues.push(
      issue("title-tag", "onPage", "critical", "Title tag missing", "The title tag is the headline shown in search results. Add one of 50-60 characters."),
    );
  } else {
    const len = title.length;
    const ok = len >= 50 && len <= 60;
    issues.push(
      issue(
        "title-tag",
        "onPage",
        ok ? "passed" : "warning",
        ok ? `Title tag present and well-sized (${len} characters)` : `Title tag is ${len < 50 ? "short" : "long"} (${len} characters)`,
        ok
          ? "Your title is within the recommended 50-60 character range, so it should display in full in search results."
          : "Aim for 50-60 characters so the title isn't truncated or too thin in search results.",
      ),
    );
  }

  // Meta description
  const desc =
    doc.querySelector('meta[name="description"]')?.getAttribute("content")?.trim() ?? "";
  if (!desc) {
    issues.push(
      issue("meta-description", "onPage", "critical", "Meta description missing", "Search engines rely on this to generate your snippet in results. Add a 150-160 character description."),
    );
  } else {
    const len = desc.length;
    const ok = len >= 150 && len <= 160;
    issues.push(
      issue(
        "meta-description",
        "onPage",
        ok ? "passed" : "warning",
        ok ? `Meta description present (${len} characters)` : `Meta description is ${len < 150 ? "short" : "long"} (${len} characters)`,
        ok
          ? "Your description fits the 150-160 character sweet spot for search snippets."
          : "Descriptions outside 150-160 characters often get truncated or leave space unused in search snippets.",
      ),
    );
  }

  // H1 count
  const h1s = doc.querySelectorAll("h1");
  issues.push(
    issue(
      "h1-count",
      "onPage",
      h1s.length === 1 ? "passed" : h1s.length === 0 ? "critical" : "warning",
      h1s.length === 1 ? "Exactly one H1 heading" : `Page has ${h1s.length} H1 headings`,
      "A single H1 tells search engines and screen readers what the page is about. Zero or several muddies that signal.",
    ),
  );

  // Heading hierarchy
  const h2 = doc.querySelectorAll("h2").length;
  const h3 = doc.querySelectorAll("h3").length;
  issues.push(
    issue(
      "heading-structure",
      "onPage",
      h2 > 0 ? "passed" : "warning",
      h2 > 0 ? `Clear heading structure (${h2} H2s, ${h3} H3s)` : "No H2 subheadings found",
      "Subheadings break content into scannable sections and help search engines understand topic structure.",
    ),
  );

  // Images missing alt
  const imgs = Array.from(doc.querySelectorAll("img"));
  const missingAlt = imgs.filter((img) => !img.getAttribute("alt")?.trim()).length;
  issues.push(
    issue(
      "img-alt",
      "onPage",
      missingAlt === 0 ? "passed" : missingAlt <= 3 ? "warning" : "critical",
      missingAlt === 0
        ? `All ${imgs.length} images have alt text`
        : `${missingAlt} of ${imgs.length} images are missing alt text`,
      "Alt text describes images to search engines and screen readers, and is your only chance to rank in image search.",
    ),
  );

  // Word count
  const bodyText = (doc.body?.textContent ?? "").replace(/\s+/g, " ").trim();
  const words = bodyText ? bodyText.split(" ").length : 0;
  issues.push(
    issue(
      "word-count",
      "onPage",
      words >= 300 ? "passed" : "warning",
      `Body content is roughly ${words} words`,
      "Pages with under ~300 words often read as thin content and struggle to rank for competitive terms.",
    ),
  );

  // Canonical
  const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute("href");
  issues.push(
    issue(
      "canonical",
      "onPage",
      canonical ? "passed" : "warning",
      canonical ? "Canonical tag present" : "Canonical tag missing",
      "A canonical tag tells search engines which URL is the master copy, preventing duplicate-content dilution.",
    ),
  );

  // Internal vs external links
  const links = Array.from(doc.querySelectorAll("a[href]"));
  let internal = 0;
  let external = 0;
  for (const a of links) {
    const href = a.getAttribute("href") ?? "";
    if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
    try {
      const u = new URL(href, pageUrl.origin);
      if (u.hostname === pageUrl.hostname) internal++;
      else external++;
    } catch {
      /* ignore malformed hrefs */
    }
  }
  issues.push(
    issue(
      "links",
      "onPage",
      internal >= 3 ? "passed" : "warning",
      `${internal} internal links, ${external} external links`,
      "Internal links spread ranking strength across your site and help crawlers discover more pages.",
    ),
  );

  return issues;
}

async function runTechnicalChecks(doc: Document, pageUrl: URL): Promise<Issue[]> {
  const issues: Issue[] = [];

  // HTTPS
  const secure = pageUrl.protocol === "https:";
  issues.push(
    issue(
      "https",
      "technical",
      secure ? "passed" : "critical",
      secure ? "Page is served over HTTPS" : "Page is not served over HTTPS",
      "HTTPS is a confirmed ranking signal, and browsers warn visitors on pages served without it.",
    ),
  );

  // noindex
  const robotsMeta =
    doc.querySelector('meta[name="robots"]')?.getAttribute("content")?.toLowerCase() ?? "";
  const noindex = robotsMeta.includes("noindex");
  issues.push(
    issue(
      "meta-robots",
      "technical",
      noindex ? "critical" : "passed",
      noindex ? "Page is set to noindex" : "Page is indexable",
      noindex
        ? "A noindex tag tells search engines to leave this page out of results entirely. Remove it unless that's intentional."
        : "No noindex directive found, so search engines are free to include this page in results.",
    ),
  );

  // robots.txt
  try {
    const txt = await fetchText(`${pageUrl.origin}/robots.txt`, 12000);
    const blocksAll = /^\s*disallow:\s*\/\s*$/im.test(txt) && !/allow:/i.test(txt);
    issues.push(
      issue(
        "robots-txt",
        "technical",
        blocksAll ? "critical" : "passed",
        blocksAll ? "robots.txt blocks all crawlers" : "robots.txt found",
        blocksAll
          ? "A blanket 'Disallow: /' stops search engines from crawling the whole site."
          : "Your robots.txt is reachable and doesn't block crawlers site-wide.",
      ),
    );
  } catch {
    issues.push(
      issue("robots-txt", "technical", "warning", "robots.txt not found", "A robots.txt file lets you guide crawlers. It's not required, but most well-maintained sites have one."),
    );
  }

  // sitemap.xml
  try {
    const xml = await fetchText(`${pageUrl.origin}/sitemap.xml`, 12000);
    const ok = /<(urlset|sitemapindex)/i.test(xml);
    issues.push(
      issue(
        "sitemap",
        "technical",
        ok ? "passed" : "warning",
        ok ? "sitemap.xml found" : "sitemap.xml missing or invalid",
        "A sitemap helps search engines discover every page you want indexed, especially on larger sites.",
      ),
    );
  } catch {
    issues.push(
      issue("sitemap", "technical", "warning", "sitemap.xml missing", "A sitemap helps search engines discover every page you want indexed, especially on larger sites."),
    );
  }

  // Viewport / mobile friendliness
  const viewport = doc.querySelector('meta[name="viewport"]')?.getAttribute("content");
  issues.push(
    issue(
      "viewport",
      "technical",
      viewport ? "passed" : "critical",
      viewport ? "Mobile viewport tag present" : "Mobile viewport tag missing",
      "Without a viewport tag, phones render the desktop layout zoomed out, which Google treats as not mobile-friendly.",
    ),
  );

  return issues;
}

/* ------------------------------------------------------------------ */
/* Orchestrator                                                        */
/* ------------------------------------------------------------------ */

export async function runAudit(rawUrl: string): Promise<AuditResult> {
  const url = normalizeUrl(rawUrl);
  const parsed = new URL(url);

  // Performance and HTML checks run independently: one failing must not
  // take down the other.
  const [perf, html] = await Promise.allSettled([
    runPerformanceAudit(url),
    fetchText(url),
  ]);

  const issues: Issue[] = [];
  const warnings: string[] = [];
  const categories: Record<CategoryKey, number | null> = {
    onPage: null,
    performance: null,
    technical: null,
  };

  if (perf.status === "fulfilled") {
    categories.performance = perf.value.score;
    issues.push(...perf.value.issues);
  } else {
    warnings.push("Performance data was unavailable — Google's PageSpeed service didn't respond.");
  }

  if (html.status === "fulfilled") {
    const doc = new DOMParser().parseFromString(html.value, "text/html");
    const onPage = runOnPageChecks(doc, parsed);
    const technical = await runTechnicalChecks(doc, parsed);
    categories.onPage = scoreFromIssues(onPage);
    categories.technical = scoreFromIssues(technical);
    issues.push(...onPage, ...technical);
  } else {
    warnings.push("On-page and technical checks were unavailable — the page couldn't be fetched.");
  }

  const scored = Object.values(categories).filter((v): v is number => v !== null);
  if (scored.length === 0) {
    throw new Error(
      "We couldn't scan this page — it may be blocking automated requests. Try another URL.",
    );
  }

  const order: Record<Severity, number> = { critical: 0, warning: 1, passed: 2 };
  issues.sort((a, b) => order[a.severity] - order[b.severity]);

  return {
    url,
    overallScore: Math.round(scored.reduce((a, b) => a + b, 0) / scored.length),
    categories,
    issues,
    warnings,
  };
}
