// Build-time site files for the SecureGraph Vite apps.
//
// Core, Attack, Defend, Code and the blog share one `public/` folder, so a
// static robots.txt or sitemap.xml there would be served identically on five
// hosts with very different rules (a public blog; three sign-in-only apps).
// Each app's build emits its own instead.
//
// The same hook enforces a first-paint budget: the entry chunk is what every
// visitor downloads before anything renders, and it had quietly grown past
// 1 MB behind a raised `chunkSizeWarningLimit`. Going over now fails the build.
import fs from "node:fs";
import type { Plugin } from "vite";

export interface SiteFilesOptions {
  /** Production origin, e.g. "https://app.phantixlabs.com". */
  siteUrl: string;
  /**
   * What crawlers may visit. "all" for a public site; otherwise the paths to
   * allow (prefix match; end with "$" for an exact match) with everything else
   * disallowed. Pass [] for a site that is entirely behind sign-in.
   */
  allow: "all" | string[];
  /** Paths listed in sitemap.xml. None means no sitemap is emitted. */
  sitemap?: () => string[] | Promise<string[]>;
  /** Fail the build when an entry chunk is larger than this (KB, minified). */
  entryBudgetKB?: number;
  /**
   * Authenticated (or transient) route prefixes, emitted as explicit
   * `Disallow:` lines ahead of the catch-all. Only used when `allow` is an
   * allowlist; the catch-all already blocks them, but naming them documents
   * the intent and survives a change to the allowlist.
   */
  disallow?: string[];
  /**
   * Welcome the main AI / answer-engine crawlers with the same rules as
   * `User-agent: *`, matching phantixlabs.com. They may read the public
   * routes only — listing them separately never widens access.
   */
  aiCrawlers?: boolean;
  /**
   * Body of an `llms.txt` file (https://llmstxt.org). Emit it only on hosts
   * that are genuinely public and have a machine-readable story to tell.
   * Omit the option and no file is written.
   */
  llmsTxt?: string;
}

/** The AI crawlers the landing site welcomes; kept in step with it. */
const AI_CRAWLERS = ["GPTBot", "OAI-SearchBot", "PerplexityBot", "ClaudeBot", "Google-Extended"];

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** The Allow/Disallow body shared by `User-agent: *` and the AI crawlers. */
function crawlRules(allow: "all" | string[], disallow: string[]): string[] {
  const lines: string[] = [];
  if (allow === "all") {
    lines.push("Allow: /");
    for (const p of disallow) lines.push(`Disallow: ${p}`);
    return lines;
  }
  for (const p of allow) lines.push(`Allow: ${p}`);
  for (const p of disallow) lines.push(`Disallow: ${p}`);
  lines.push("Disallow: /");
  return lines;
}

export function siteFiles(opts: SiteFilesOptions): Plugin {
  const origin = opts.siteUrl.replace(/\/+$/, "");
  const disallow = opts.disallow ?? [];
  return {
    name: "sg-site-files",
    apply: "build",
    async generateBundle(_options, bundle) {
      if (opts.entryBudgetKB) {
        for (const chunk of Object.values(bundle)) {
          if (chunk.type !== "chunk" || !chunk.isEntry) continue;
          const kb = Buffer.byteLength(chunk.code) / 1024;
          if (kb > opts.entryBudgetKB) {
            this.error(
              `Entry chunk ${chunk.fileName} is ${kb.toFixed(0)} KB, over the ${opts.entryBudgetKB} KB ` +
                "first-paint budget. Lazy-load the page or library that grew it (React.lazy / import()).",
            );
          }
        }
      }

      const paths = Array.from(new Set((opts.sitemap ? await opts.sitemap() : []).map((p) => p || "/")));

      const robots = ["User-agent: *", ...crawlRules(opts.allow, disallow)];
      if (opts.aiCrawlers) {
        robots.push(
          "",
          "# Answer engines and AI crawlers: public routes only, same rules as *.",
          ...AI_CRAWLERS.map((ua) => `User-agent: ${ua}`),
          ...crawlRules(opts.allow, disallow),
        );
      }
      if (paths.length) robots.push("", `Sitemap: ${origin}/sitemap.xml`);
      this.emitFile({ type: "asset", fileName: "robots.txt", source: robots.join("\n") + "\n" });

      if (opts.llmsTxt) {
        this.emitFile({ type: "asset", fileName: "llms.txt", source: opts.llmsTxt.trim() + "\n" });
      }

      if (paths.length) {
        const urls = paths
          .map((p) => `  <url><loc>${xmlEscape(origin + (p.startsWith("/") ? p : `/${p}`))}</loc></url>`)
          .join("\n");
        this.emitFile({
          type: "asset",
          fileName: "sitemap.xml",
          source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
        });
      }
    },
  };
}

/**
 * Public documentation page ids, read from the doc registries' source. The
 * registries import Markdown with `?raw`, which only Vite can load, so the
 * config (plain Node) reads the literal ids instead.
 */
export function docPageIds(sgSrcDir: string): string[] {
  const read = (f: string) => {
    try {
      return fs.readFileSync(`${sgSrcDir}/${f}`, "utf8");
    } catch {
      return "";
    }
  };
  const ids = new Set<string>();
  for (const m of read("docs.ts").matchAll(/\{\s*id:\s*"([a-z0-9-]+)",\s*title:/g)) ids.add(m[1]);
  for (const m of read("manualDocs.ts").matchAll(/\bid:\s*"([a-z0-9-]+)"/g)) ids.add(m[1]);
  for (const m of read("howToDocs.ts").matchAll(/^\s*e\(\s*"([a-z0-9-]+)"/gm)) ids.add(m[1]);
  return [...ids];
}
