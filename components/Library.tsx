"use client";

import { useMemo, useRef, useState } from "react";
import { useDocuments } from "./useDocuments";

interface UploadStatus {
  name: string;
  state: "uploading" | "done" | "error";
  detail?: string;
}

export function Library() {
  const { documents, error, refresh } = useDocuments();
  const [subject, setSubject] = useState("");
  const [uploads, setUploads] = useState<UploadStatus[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const subjects = useMemo(
    () => [...new Set((documents ?? []).map((d) => d.subject).filter((s): s is string => Boolean(s)))].sort(),
    [documents],
  );

  async function upload(files: File[]) {
    setBusy(true);
    setUploads(files.map((f) => ({ name: f.name, state: "uploading" })));
    // One at a time: embedding is CPU-bound with the local model, so parallel uploads don't help.
    for (const [i, file] of files.entries()) {
      const form = new FormData();
      form.append("file", file);
      form.append("subject", subject);
      let status: UploadStatus;
      try {
        const res = await fetch("/api/ingest", { method: "POST", body: form });
        const json = await res.json();
        status = res.ok
          ? { name: file.name, state: "done", detail: `${json.document.pages} pages, ${json.document.chunks} chunks` }
          : { name: file.name, state: "error", detail: json.error ?? `Failed (${res.status})` };
      } catch {
        status = { name: file.name, state: "error", detail: "Network error" };
      }
      setUploads((prev) => prev.map((u, j) => (j === i ? status : u)));
      await refresh();
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Delete "${name}" and all its chunks?`)) return;
    const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
    if (!res.ok) alert("Delete failed.");
    await refresh();
  }

  return (
    <div className="space-y-8 py-8">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
        <p className="mt-1 text-sm text-muted">
          Upload lecture notes, question papers or papers as PDFs. Text is split into chunks per page and indexed for
          search. Scanned (image-only) PDFs aren&apos;t supported yet.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const files = [...(fileRef.current?.files ?? [])];
            if (files.length) void upload(files);
          }}
          className="mt-5 grid gap-3 rounded-xl border border-line bg-surface p-4 sm:grid-cols-[1fr_auto]"
        >
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            required
            aria-label="PDF files"
            className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-accent-soft file:px-3 file:py-1.5 file:text-sm file:text-accent"
          />
          <div className="flex gap-2">
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              list="subjects"
              placeholder="Subject (optional)"
              aria-label="Subject"
              className="w-44 rounded-md border border-line bg-background px-2 py-1.5 text-sm"
            />
            <datalist id="subjects">
              {subjects.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:text-background"
            >
              {busy ? "Uploading…" : "Upload"}
            </button>
          </div>
        </form>

        {uploads.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">
            {uploads.map((u, i) => (
              <li key={i} className="flex gap-2">
                <span className="w-4 text-center">{u.state === "uploading" ? "…" : u.state === "done" ? "✓" : "✕"}</span>
                <span className="truncate">{u.name}</span>
                {u.detail && (
                  <span className={u.state === "error" ? "text-red-600 dark:text-red-400" : "text-muted"}>— {u.detail}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted">
          {documents ? `${documents.length} document${documents.length === 1 ? "" : "s"}` : "Loading…"}
        </h2>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {documents && documents.length > 0 && (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {documents.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{d.name}</p>
                  <p className="text-xs text-muted">
                    {d.subject ? `${d.subject} · ` : ""}
                    {d.pages} pages · {d.chunks} chunks · added {new Date(d.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => remove(d.id, d.name)}
                  className="rounded-md px-2 py-1 text-xs text-muted hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950 dark:hover:text-red-300"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
