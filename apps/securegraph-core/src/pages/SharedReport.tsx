import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { CalendarClock, Download, ExternalLink, FileText, Loader2, LogIn } from "lucide-react";
import { API_BASE, saveBlob } from "@sg/api";
import { ThemeToggle } from "@sg/ThemeToggle";
import { BrandWordmark } from "@sg/components/BrandLogo";

/**
 * The report a security overview email links to (/shared-report/:token).
 *
 * The email reaches the security mailbox, which is usually a shared inbox with
 * no account, so the signed link is the credential: no sign-in, no session, and
 * it opens this one report until it expires. Requests use plain `fetch` with no
 * credentials so a leftover session in this browser is never read or refreshed.
 *
 * The PDF is shown in the browser's own viewer through a blob URL, as on the
 * signed-in report viewer. When no PDF exists the HTML rendering is shown in a
 * sandboxed frame with no allow-* tokens.
 */

interface SharedMeta {
  title: string;
  organization: string;
  generated_at: string | null;
  expires_at: string | null;
  formats: string[];
}

const GONE =
  "This link has expired or is not valid. Open the latest security overview email, or sign in to SecureGraph and open the report from Reports.";

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

function filenameFrom(res: Response, fallback: string): string {
  const cd = res.headers.get("content-disposition") || "";
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  if (star) return decodeURIComponent(star[1].trim().replace(/"/g, ""));
  const plain = /filename="?([^";]+)"?/i.exec(cd);
  return plain ? plain[1].trim() : fallback;
}

export default function SharedReport() {
  const { token = "" } = useParams();
  const base = `${API_BASE}/shared-reports/${encodeURIComponent(token)}`;
  const [meta, setMeta] = useState<SharedMeta | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const pdfRef = useRef<{ blob: Blob; filename: string; url: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(base, { credentials: "omit" });
      if (!res.ok) throw new Error(res.status === 404 ? GONE : "We could not open this report. Try again in a moment.");
      const m = (await res.json()) as SharedMeta;
      setMeta(m);
      if (m.formats.includes("pdf")) {
        const pdf = await fetch(`${base}/download?format=pdf`, { credentials: "omit" });
        if (!pdf.ok) throw new Error(pdf.status === 404 ? GONE : "We could not load the PDF. Try again in a moment.");
        const blob = await pdf.blob();
        const url = URL.createObjectURL(blob);
        if (pdfRef.current) URL.revokeObjectURL(pdfRef.current.url);
        pdfRef.current = { blob, filename: filenameFrom(pdf, "security-overview.pdf"), url };
        setPdfUrl(url);
      } else if (m.formats.includes("html")) {
        const page = await fetch(`${base}/download?format=html`, { credentials: "omit" });
        if (!page.ok) throw new Error(GONE);
        setHtml(await page.text());
      } else {
        throw new Error("This report has no file to show. Sign in to SecureGraph to generate a new one.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : GONE);
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    void load();
    return () => {
      if (pdfRef.current) URL.revokeObjectURL(pdfRef.current.url);
    };
  }, [load]);

  const download = async () => {
    if (pdfRef.current) {
      saveBlob(pdfRef.current.blob, pdfRef.current.filename);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${base}/download?format=pdf`, { credentials: "omit" });
      if (!res.ok) throw new Error(GONE);
      saveBlob(await res.blob(), filenameFrom(res, "security-overview.pdf"));
    } catch (err) {
      setError(err instanceof Error ? err.message : GONE);
    } finally {
      setSaving(false);
    }
  };

  const generated = fmtDate(meta?.generated_at ?? null);
  const expires = fmtDate(meta?.expires_at ?? null);
  const canPdf = Boolean(meta?.formats.includes("pdf"));

  return (
    <div className="flex min-h-screen flex-col bg-phantix-950">
      <header className="flex items-center justify-between gap-3 border-b border-phantix-800 px-4 py-3 sm:px-6">
        <BrandWordmark />
        <ThemeToggle />
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-5 sm:px-6">
        {loading ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-slate-400">
            <Loader2 size={16} className="animate-spin" /> Opening the report…
          </div>
        ) : error ? (
          <div className="mx-auto mt-[10vh] max-w-md rounded-2xl border border-phantix-700 bg-phantix-900 p-6 text-center">
            <FileText size={22} className="mx-auto text-slate-500" />
            <h1 className="mt-3 font-display text-lg font-semibold text-white">This report can't be opened</h1>
            <p className="mt-2 text-sm leading-6 text-slate-400">{error}</p>
            <a href="/login" className="btn-secondary mt-5 inline-flex items-center gap-1.5">
              <LogIn size={14} /> Sign in to SecureGraph
            </a>
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-500">{meta?.organization}</p>
                <h1 className="mt-1 font-display text-xl font-semibold text-white [overflow-wrap:anywhere]">{meta?.title}</h1>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-slate-400">
                  {generated && <span>Generated {generated}</span>}
                  {expires && (
                    <span className="inline-flex items-center gap-1">
                      <CalendarClock size={13} /> Link works until {expires}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {canPdf && (
                  <button type="button" className="btn-primary inline-flex items-center gap-1.5" onClick={() => void download()} disabled={saving}>
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Download PDF
                  </button>
                )}
                {pdfUrl && (
                  <button
                    type="button"
                    className="btn-secondary inline-flex items-center gap-1.5"
                    onClick={() => window.open(pdfUrl, "_blank", "noopener")}
                  >
                    <ExternalLink size={14} /> Open in new tab
                  </button>
                )}
              </div>
            </div>

            {pdfUrl ? (
              <iframe
                src={`${pdfUrl}#view=FitH&toolbar=1`}
                title={meta?.title || "Security overview report"}
                className="min-h-[70vh] w-full flex-1 rounded-xl border border-phantix-700/50 bg-white"
              />
            ) : html ? (
              <iframe
                srcDoc={html}
                sandbox=""
                title={meta?.title || "Security overview report"}
                className="min-h-[70vh] w-full flex-1 rounded-xl border border-phantix-700/50 bg-white"
              />
            ) : null}
            <p className="mt-3 text-[12px] text-slate-500">
              Anyone with this link can open this report until it expires. Don't forward the email outside your organization.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
