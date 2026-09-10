# SEO Clarity

Lovable Prompt — SEO Auditor (Stage 1: UI + Mock Data)

Paste this first to get the app shell working with fake data before wiring up real APIs.

Build a web app called "SEO Auditor" — a tool where a user pastes a URL and gets back an SEO health report.

Page 1: Input screen

Clean, centered layout with a headline like "Audit any website's SEO in seconds"

A single input field for a URL, with basic validation (must look like a valid URL)

A prominent "Run Audit" button

Show a loading state (spinner + text like "Scanning page...") while the audit runs

Page 2: Results dashboard

Overall score at the top, shown as a big circular gauge (0-100), color-coded: red under 50, yellow 50-79, green 80+

Below that, three category score cards side by side: "On-Page SEO", "Performance", "Mobile & Technical" — each with its own 0-100 score

Below the cards, an "Issues Found" section: a list of expandable cards, each showing:

Severity icon/tag (Critical / Warning / Passed)

Issue title (e.g. "Meta description missing")

Short plain-English explanation of why it matters

A "Run another audit" button to go back to the input screen

Data structure For now, use this mock JSON shape so the UI has something to render (I'll wire up real data next):

{
  "url": "https://example.com",
  "overallScore": 74,
  "categories": {
    "onPage": 80,
    "performance": 65,
    "technical": 78
  },
  "issues": [
    {
      "id": "title-tag",
      "category": "onPage",
      "severity": "passed",
      "title": "Title tag present and well-sized",
      "description": "Your title tag is 58 characters, which is within the recommended 50-60 character range."
    },
    {
      "id": "meta-description",
      "category": "onPage",
      "severity": "critical",
      "title": "Meta description missing",
      "description": "Search engines rely on this to generate your snippet in results. Add a 150-160 character description."
    },
    {
      "id": "core-web-vitals",
      "category": "performance",
      "severity": "warning",
      "title": "Largest Contentful Paint is slow (3.2s)",
      "description": "Google recommends under 2.5s. Slow LCP can hurt rankings and user experience."
    }
  ]
}


Use a clean, modern SaaS-dashboard style (think Vercel/Linear aesthetic) — plenty of white space, subtle shadows, rounded cards, a single accent color.

Stage 2: Real Data (use after Stage 1 looks good)

Now replace the mock data with real audit logic. When the user submits a URL, do the following:

1. Performance & Core Web Vitals — via Google PageSpeed Insights API

Call https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url={URL}&strategy=mobile

This is a public API and can be called directly from the frontend (no API key required for low volume, but add a note in the code where I can plug one in if needed)

Pull out: Performance score, LCP, CLS, FID/INP, and the mobile-friendliness signals it returns

Map the performance score (0-1) to my 0-100 "Performance" category score

2. On-page checks — by fetching the page HTML

Fetch the target URL's HTML through a CORS proxy — use https://api.allorigins.win/raw?url={URL} (or a similar public proxy) since most sites block direct cross-origin fetches from the browser

Parse the returned HTML (DOMParser is fine) and check:

<title> tag: present, and length between 50-60 characters

<meta name="description">: present, and length between 150-160 characters

Number of <h1> tags (should be exactly 1)

Heading hierarchy (are there H2s/H3s, or does it jump around)

<img> tags missing alt attributes (report the count)

Word count of visible body text (flag if under ~300 words)

Presence of a <link rel="canonical"> tag

Count of internal vs external links

Map how many of these pass/fail into a 0-100 "On-Page SEO" score

3. Technical checks

Check if the page loads over HTTPS (from the URL itself)

Fetch {origin}/robots.txt (through the same proxy if needed) — check it exists and doesn't disallow all crawlers (Disallow: /)

Fetch {origin}/sitemap.xml — check it exists

Check for a <meta name="robots" content="noindex"> tag in the HTML (flag as critical if present, since it blocks indexing)

Map these into the 0-100 "Technical" score

4. Error handling

If the CORS proxy fails or the target site can't be fetched, show a friendly error state: "We couldn't scan this page — it may be blocking automated requests. Try another URL."

Performance checks (PageSpeed API) and on-page checks (proxy fetch) should run independently — if one fails, still show results for the other rather than failing the whole audit

5. Scoring

Overall score = average of the three category scores

Each issue should carry a severity: "critical" (missing/broken required elements), "warning" (suboptimal but not broken), "passed" (check succeeded)

Keep all the audit logic in a single well-commented function/file so it's easy for me to tweak the scoring rules later.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/c67ed79d-0b6e-4a54-a8ed-8098a27160af).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
