import type Anthropic from "@anthropic-ai/sdk";
import { describeLlmError, llmConfigured, streamAnswer } from "@/lib/llm";
import { SYSTEM_PROMPT, buildUserMessage } from "@/lib/prompts";
import { MIN_SIMILARITY, search, type SearchMode } from "@/lib/retrieval";
import type { ChatEvent } from "@/lib/types";

export const maxDuration = 60;

interface ChatRequest {
  question?: string;
  history?: { role: "user" | "assistant"; content: string }[];
  documentIds?: string[];
  subject?: string;
  mode?: SearchMode;
}

const MAX_HISTORY_MESSAGES = 6;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as ChatRequest | null;
  const question = body?.question?.trim();
  if (!question) {
    return Response.json({ error: "Missing 'question'." }, { status: 400 });
  }
  if (question.length > 2000) {
    return Response.json({ error: "Question is too long (2000 characters max)." }, { status: 400 });
  }

  const retrieved = await search(question, {
    k: 5,
    mode: body?.mode === "hybrid" ? "hybrid" : "vector",
    documentIds: body?.documentIds,
    subject: body?.subject,
  });
  const relevant = retrieved.length > 0 && retrieved[0].similarity >= MIN_SIMILARITY;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ChatEvent) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        if (!relevant) {
          send({ type: "sources", sources: [] });
          send({
            type: "text",
            text:
              retrieved.length === 0
                ? "Your library is empty. Upload some PDFs on the Library page first."
                : "I couldn't find that in your notes. Try rephrasing, or check that the right documents are uploaded.",
          });
          return;
        }

        send({ type: "sources", sources: retrieved });

        if (!llmConfigured()) {
          send({
            type: "text",
            text: "No LLM is configured (set ANTHROPIC_API_KEY in .env.local), so here are the most relevant passages from your notes instead. Click a source to read it.",
          });
          return;
        }

        const history: Anthropic.Beta.BetaMessageParam[] = (body?.history ?? [])
          .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content)
          .slice(-MAX_HISTORY_MESSAGES)
          .map((m) => ({ role: m.role, content: m.content }));
        // The API requires the conversation to start with a user turn.
        while (history.length && history[0].role !== "user") history.shift();

        const llm = streamAnswer({
          system: SYSTEM_PROMPT,
          messages: [...history, { role: "user", content: buildUserMessage(question, retrieved) }],
          signal: request.signal,
        });
        llm.on("text", (text) => send({ type: "text", text }));
        const final = await llm.finalMessage();
        if (final.stop_reason === "refusal") {
          send({ type: "error", message: "The model declined to answer this question." });
        }
      } catch (err) {
        if (!request.signal.aborted) {
          console.error("chat failed", err);
          send({ type: "error", message: describeLlmError(err) });
        }
      } finally {
        if (!request.signal.aborted) {
          send({ type: "done" });
          controller.close();
        }
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
