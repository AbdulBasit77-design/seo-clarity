import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Server-side fetchers for the auditor.
 *
 * Running these on the server avoids browser CORS entirely (more reliable than
 * a public CORS proxy) while keeping all scoring logic in src/lib/audit.ts.
 *
 * NOTE: these never throw. A missing robots.txt (404) or a rate-limited
 * PageSpeed call (429) is an expected outcome of an audit, not a crash — so
 * they return { ok: false, status } and the caller decides what it means.
 */

const UA =
  "Mozilla/5.0 (compatible; SEOAuditorBot/1.0; +https://example.com/bot) Chrome/124 Safari/537.36";

/** Fetch any URL as text (page HTML, robots.txt, sitemap.xml). */
export const fetchRemoteText = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ url: z.string().url() }).parse(data))
  .handler(async ({ data }) => {
    try {
      const res = await fetch(data.url, {
        headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,text/plain,*/*" },
        redirect: "follow",
      });
      if (!res.ok) return { ok: false as const, status: res.status, text: "" };
      return { ok: true as const, status: res.status, text: await res.text() };
    } catch {
      return { ok: false as const, status: 0, text: "" };
    }
  });

/** Google PageSpeed Insights (mobile strategy). */
export const fetchPageSpeed = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ url: z.string().url() }).parse(data))
  .handler(async ({ data }) => {
    const params = new URLSearchParams({ url: data.url, strategy: "mobile" });
    // Optional: set a PAGESPEED_API_KEY secret to raise the keyless rate limit.
    const key = process.env["PAGESPEED_API_KEY"];
    if (key) params.set("key", key);

    try {
      const res = await fetch(
        `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`,
      );
      if (!res.ok) return { ok: false as const, status: res.status, lighthouseResult: null };
      const json = (await res.json()) as { lighthouseResult?: unknown };
      return {
        ok: true as const,
        status: res.status,
        lighthouseResult: json.lighthouseResult ?? null,
      };
    } catch {
      return { ok: false as const, status: 0, lighthouseResult: null };
    }
  });
