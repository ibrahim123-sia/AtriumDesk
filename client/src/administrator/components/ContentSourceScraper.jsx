import React, { useEffect, useState, useCallback, useRef } from "react";
import { useSelector } from "react-redux";
import { Globe, RefreshCw, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import axios from "../../utils/axios";
import { getPalette } from "../utils/palette";

// Rev7 SaaS follow-up — self-service chatbot knowledge-base scraping. A
// new tenant's chatbot has zero real content until someone scrapes their
// own university's website; this used to require a developer hand-editing
// a Python config file. The Administrator now triggers it themselves —
// this component polls while a scrape is running since a real university
// site can take several minutes to crawl.
const POLL_MS = 8000;

const ContentSourceScraper = () => {
  const theme = useSelector((s) => s.theme.theme);
  const tenantBranding = useSelector((s) => s.tenant.branding);
  const token = useSelector((s) => s.auth.token);
  const C = getPalette(theme === "dark", tenantBranding);

  const [status, setStatus] = useState(null);
  const [form, setForm] = useState({ sitemapUrl: "", allowedDomain: "", baseUrl: "" });
  const [starting, setStarting] = useState(false);
  const pollRef = useRef(null);

  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await axios.get("/api/admin/content-source", { headers: { Authorization: token } });
      if (data.success) {
        setStatus(data.contentSource);
        if (data.contentSource?.sitemapUrl) {
          setForm({
            sitemapUrl: data.contentSource.sitemapUrl,
            allowedDomain: data.contentSource.allowedDomain,
            baseUrl: data.contentSource.baseUrl,
          });
        }
      }
    } catch {
      // Non-fatal — the rest of the Data page still works without this section.
    }
  }, [token]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    clearInterval(pollRef.current);
    if (status?.status === "running") {
      pollRef.current = setInterval(fetchStatus, POLL_MS);
    }
    return () => clearInterval(pollRef.current);
  }, [status?.status, fetchStatus]);

  const handleStart = async (e) => {
    e.preventDefault();
    setStarting(true);
    try {
      const { data } = await axios.post("/api/admin/content-source/scrape", form, {
        headers: { Authorization: token },
      });
      if (data.success) {
        toast.success("Scrape started — this can take several minutes for a full site");
        setStatus(data.contentSource);
      } else {
        toast.error(data.message || "Failed to start scrape");
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to start scrape");
    } finally {
      setStarting(false);
    }
  };

  const isRunning = status?.status === "running";

  return (
    <div className="p-5 rounded-xl border space-y-4" style={{ backgroundColor: C.surface, borderColor: C.border }}>
      <div className="flex items-center gap-2">
        <Globe className="w-4 h-4" style={{ color: C.navy }} />
        <p className="text-sm font-medium" style={{ color: C.text }}>Scrape your university's website</p>
      </div>
      <p className="text-xs" style={{ color: C.muted }}>
        Populates the chatbot's knowledge base from your own site's public pages, via its XML sitemap. Re-running
        replaces the previous content entirely. This can take several minutes for a real site.
      </p>

      <form onSubmit={handleStart} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-medium" style={{ color: C.muted }}>Sitemap URL</label>
          <input
            type="url"
            required
            disabled={isRunning}
            value={form.sitemapUrl}
            onChange={(e) => setForm({ ...form, sitemapUrl: e.target.value })}
            placeholder="https://youruniversity.edu/sitemap_index.xml"
            className="w-full mt-1 px-3 py-2 text-sm rounded-lg border focus:outline-none"
            style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
          />
        </div>
        <div>
          <label className="text-xs font-medium" style={{ color: C.muted }}>Allowed domain</label>
          <input
            type="text"
            required
            disabled={isRunning}
            value={form.allowedDomain}
            onChange={(e) => setForm({ ...form, allowedDomain: e.target.value })}
            placeholder="youruniversity.edu"
            className="w-full mt-1 px-3 py-2 text-sm rounded-lg border focus:outline-none"
            style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
          />
        </div>
        <div>
          <label className="text-xs font-medium" style={{ color: C.muted }}>Homepage URL</label>
          <input
            type="url"
            required
            disabled={isRunning}
            value={form.baseUrl}
            onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
            placeholder="https://youruniversity.edu"
            className="w-full mt-1 px-3 py-2 text-sm rounded-lg border focus:outline-none"
            style={{ backgroundColor: C.input, borderColor: C.border, color: C.text }}
          />
        </div>
        <div className="sm:col-span-3 flex items-center gap-3">
          <button
            type="submit"
            disabled={starting || isRunning}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white flex items-center gap-2 disabled:opacity-60"
            style={{ backgroundColor: C.navy }}
          >
            {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {isRunning ? "Scraping…" : "Scrape now"}
          </button>

          {status?.status === "done" && (
            <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: C.green }}>
              <CheckCircle2 className="w-4 h-4" />
              {status.pagesScraped} pages · {status.chunksCreated} chunks
              {status.completedAt && ` · ${new Date(status.completedAt).toLocaleString()}`}
            </span>
          )}
          {status?.status === "failed" && (
            <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: C.red }}>
              <XCircle className="w-4 h-4" /> {status.error || "Scrape failed"}
            </span>
          )}
        </div>
      </form>
    </div>
  );
};

export default ContentSourceScraper;
