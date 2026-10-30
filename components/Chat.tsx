"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { parseCitations } from "@/lib/citations";
import type { ChatEvent, RetrievedChunk } from "@/lib/types";
import { useDocuments } from "./useDocuments";

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: RetrievedChunk[];
  error?: string;
  pending?: boolean;
}

type Mode = "vector" | "hybrid";

export function Chat() {
  const { documents } = useDocuments();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [scope, setScope] = useState("all"); // "all" | "subject:<name>" | "doc:<id>"
  const [mode, setMode] = useState<Mode>("vector");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const subjects = useMemo(
    () => [...new Set((documents ?? []).map((d) => d.subject).filter((s): s is string => Boolean(s)))].sort(),
    [documents],
  );

  function updateLast(patch: (m: Message) => Message) {
    setMessages((prev) => [...prev.slice(0, -1), patch(prev[prev.length - 1])]);
  }

  async function ask(question: string) {
    const history = messages
      .filter((m) => !m.error && m.content)
      .map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [
      ...prev,
      { role: "user", content: question },
      { role: "assistant", content: "", pending: true },
    ]);
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          history,
          mode,
          subject: scope.startsWith("subject:") ? scope.slice(8) : undefined,
          documentIds: scope.startsWith("doc:") ? [scope.slice(4)] : undefined,
        }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? `Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as ChatEvent;
          if (event.type === "sources") updateLast((m) => ({ ...m, sources: event.sources }));
          else if (event.type === "text") updateLast((m) => ({ ...m, content: m.content + event.text }));
          else if (event.type === "error") updateLast((m) => ({ ...m, error: event.message }));
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        updateLast((m) => ({ ...m, error: err instanceof Error ? err.message : "Something went wrong." }));
      }
    } finally {
      updateLast((m) => ({ ...m, pending: false }));
      setBusy(false);
      abortRef.current = null;
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question || busy) return;
    setInput("");
    void ask(question);
  }

  const empty = documents !== null && documents.length === 0;

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 space-y-6 py-6">
        {messages.length === 0 && (
          <div className="mx-auto max-w-md pt-16 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">Ask your notes</h1>
            <p className="mt-2 text-sm text-muted">
              Answers come only from the PDFs in your library, with a citation to the page each fact came from.
            </p>
            {empty && (
              <p className="mt-6 text-sm">
                Your library is empty.{" "}
                <Link href="/upload" className="text-accent underline underline-offset-2">
                  Upload a PDF
                </Link>{" "}
                to get started.
              </p>
            )}
          </div>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-accent px-4 py-2.5 text-sm text-white [overflow-wrap:anywhere] dark:text-background">
                {m.content}
              </div>
            </div>
          ) : (
            <AssistantMessage key={i} message={m} />
          ),
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={onSubmit} className="sticky bottom-0 bg-background pb-4 pt-2">
        <div className="rounded-2xl border border-line bg-surface p-2 shadow-sm focus-within:border-accent">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            rows={2}
            maxLength={2000}
            placeholder="Ask a question about your notes…"
            aria-label="Question"
            className="w-full resize-none bg-transparent px-2 py-1 text-sm outline-none placeholder:text-muted"
          />
          <div className="flex flex-wrap items-center gap-2 px-1">
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              aria-label="Search scope"
              className="max-w-[55%] truncate rounded-md border border-line bg-background px-2 py-1 text-xs text-muted"
            >
              <option value="all">All notes</option>
              {subjects.length > 0 && (
                <optgroup label="Subject">
                  {subjects.map((s) => (
                    <option key={s} value={`subject:${s}`}>
                      {s}
                    </option>
                  ))}
                </optgroup>
              )}
              {documents && documents.length > 0 && (
                <optgroup label="Document">
                  {documents.map((d) => (
                    <option key={d.id} value={`doc:${d.id}`}>
                      {d.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as Mode)}
              aria-label="Retrieval mode"
              title="Vector: semantic similarity only. Hybrid: semantic + keyword search, fused."
              className="rounded-md border border-line bg-background px-2 py-1 text-xs text-muted"
            >
              <option value="vector">Vector search</option>
              <option value="hybrid">Hybrid search</option>
            </select>
            <div className="ml-auto">
              {busy ? (
                <button
                  type="button"
                  onClick={() => abortRef.current?.abort()}
                  className="rounded-lg border border-line px-3 py-1.5 text-sm"
                >
                  Stop
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40 dark:text-background"
                >
                  Ask
                </button>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

function AssistantMessage({ message }: { message: Message }) {
  const [open, setOpen] = useState<number | null>(null);
  const sources = message.sources ?? [];
  const segments = parseCitations(message.content, sources.length);
  const openSource = open !== null ? sources[open - 1] : undefined;

  return (
    <div className="space-y-3">
      <div className="whitespace-pre-wrap text-[15px] leading-relaxed [overflow-wrap:anywhere]">
        {segments.map((seg, i) =>
          seg.type === "text" ? (
            <span key={i}>{seg.text}</span>
          ) : (
            <CitationChip
              key={i}
              n={seg.source}
              source={sources[seg.source - 1]}
              active={open === seg.source}
              onClick={() => setOpen(open === seg.source ? null : seg.source)}
            />
          ),
        )}
        {message.pending && !message.content && <span className="text-muted">Searching your notes…</span>}
        {message.pending && message.content && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-muted align-middle" />}
      </div>

      {message.error && (
        <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 [overflow-wrap:anywhere] dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {message.error}
        </p>
      )}

      {sources.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {sources.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setOpen(open === i + 1 ? null : i + 1)}
              className={`flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors ${
                open === i + 1 ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-accent"
              }`}
            >
              <span className="font-mono text-accent">{i + 1}</span>
              <span className="truncate">{s.documentName}</span>
              <span className="shrink-0 text-muted">p. {s.page}</span>
            </button>
          ))}
        </div>
      )}

      {openSource && (
        <figure className="rounded-xl border border-line bg-surface p-4">
          <figcaption className="mb-2 flex items-baseline justify-between gap-3 text-xs text-muted">
            <span className="truncate">
              <span className="font-mono text-accent">[{open}]</span> {openSource.documentName}, page {openSource.page}
            </span>
            <span className="shrink-0 font-mono">similarity {openSource.similarity.toFixed(2)}</span>
          </figcaption>
          <blockquote className="max-h-64 overflow-y-auto text-sm leading-relaxed">{openSource.content}</blockquote>
        </figure>
      )}
    </div>
  );
}

function CitationChip(props: { n: number; source?: RetrievedChunk; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={props.onClick}
      title={props.source ? `${props.source.documentName}, page ${props.source.page}` : undefined}
      className={`mx-0.5 inline-flex h-5 min-w-5 -translate-y-px items-center justify-center rounded px-1 align-middle font-mono text-[11px] transition-colors ${
        props.active ? "bg-accent text-white dark:text-background" : "bg-accent-soft text-accent hover:bg-accent hover:text-white"
      }`}
    >
      {props.n}
    </button>
  );
}
