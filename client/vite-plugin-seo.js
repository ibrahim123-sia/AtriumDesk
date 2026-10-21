import fs from "node:fs";
import path from "node:path";
import { CRAWL_BLOCKED, DEFAULT_DESCRIPTION, PUBLIC_PAGES, SITE_NAME } from "./src/utils/seo.js";

// Search-engine files for the build. VITE_SITE_URL is the web client's public
// address (https://atriumdesk-web.<you>.workers.dev or a custom domain). With
// it, index.html gets absolute canonical and social-preview URLs and the
// build writes sitemap.xml; without it, only robots.txt. These have to be real
// files: Cloudflare answers any missing path with index.html.
export default function seo() {
  let site = "";
  let outDir = "";
  let isBuild = false;

  return {
    name: "atriumdesk-seo",

    configResolved(config) {
      site = (config.env.VITE_SITE_URL || "").trim().replace(/\/+$/, "");
      if (site && !/^https?:\/\/[^/\s]+$/.test(site)) {
        throw new Error(`VITE_SITE_URL must be an address like https://example.com, got "${site}"`);
      }
      outDir = path.resolve(config.root, config.build.outDir);
      isBuild = config.command === "build";
    },

    transformIndexHtml(html) {
      const structuredData = {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        name: SITE_NAME,
        description: DEFAULT_DESCRIPTION,
        applicationCategory: "EducationalApplication",
        operatingSystem: "Any",
        browserRequirements: "Requires JavaScript",
        inLanguage: "en",
        featureList: [
          "AI admissions and student assistant answering from the university's own website",
          "Department help desk with tracking, notes, transfers and first-reply targets",
          "Scholarship and job matching against the student's profile",
          "Campus events with RSVPs and check-in codes",
          "Walk-in office queues",
          "Website chat widget for a university's own site",
        ],
        author: { "@type": "Person", name: "Syed Ibrahim Ali", url: "https://github.com/ibrahim123-sia" },
        ...(site && { url: `${site}/`, image: `${site}/og-image.png` }),
      };
      const tags = [
        {
          tag: "script",
          attrs: { type: "application/ld+json" },
          // "<" escaped so the JSON can never close the script tag.
          children: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
          injectTo: "head",
        },
      ];
      if (site) {
        tags.push(
          { tag: "link", attrs: { rel: "canonical", href: `${site}/` }, injectTo: "head" },
          { tag: "meta", attrs: { property: "og:url", content: `${site}/` }, injectTo: "head" },
        );
      }
      return { html: html.replaceAll("__SITE_URL__", site), tags };
    },

    closeBundle() {
      if (!isBuild) return;
      const robots = [
        "# Signed-in areas only redirect to the login page; keep crawlers out of them.",
        "User-agent: *",
        ...CRAWL_BLOCKED.map((prefix) => `Disallow: ${prefix}`),
        "",
        ...(site ? [`Sitemap: ${site}/sitemap.xml`, ""] : []),
      ].join("\n");
      fs.writeFileSync(path.join(outDir, "robots.txt"), robots);
      if (!site) return;
      const urls = Object.keys(PUBLIC_PAGES).map((page) => `  <url><loc>${site}${page}</loc></url>`);
      const sitemap = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...urls,
        "</urlset>",
        "",
      ].join("\n");
      fs.writeFileSync(path.join(outDir, "sitemap.xml"), sitemap);
    },
  };
}
