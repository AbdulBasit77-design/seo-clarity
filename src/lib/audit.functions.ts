import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Server-side fetchers for the auditor.
 *
 * Running these on the server avoids browser CORS entirely (more reliable than
 * a public CORS proxy) while keeping all scoring logic in src/lib/audit.ts.
 */

const UA =
  "Mozilla/5.0 (compatible; SEOAuditorBot/1.0; +https://example.com/bot) Chrome/124 Safari/537.36";

/** Fetch any URL as text (page HTML, robots.txt, sitemap.xml). */
export const fetchRemoteText = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ url: z.string().url() }).parse(data))
  .handler(async ({ data }) => {
    const res = await fetch(data.url, {
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,text/plain,*/*" },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`Target responded ${res.status}`);
    return { text: await res.text() };
  });

/** Google PageSpeed Insights (mobile strategy). */
export const fetchPageSpeed = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ url: z.string().url() }).parse(data))
  .handler(async ({ data }) => {
    const params = new URLSearchParams({ url: data.url, strategy: "mobile" });
    // Optional: set a PAGESPEED_API_KEY secret to raise the keyless rate limit.
    const key = process.env["PAGESPEED_API_KEY"];
    if (key) params.set("key", key);

    const res = await fetch(
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`,
    );
    if (!res.ok) throw new Error(`PageSpeed responded ${res.status}`);
    const json = (await res.json()) as { lighthouseResult?: unknown };
    return { lighthouseResult: json.lighthouseResult ?? null };
  });
