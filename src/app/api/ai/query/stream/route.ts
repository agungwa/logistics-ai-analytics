import { NextRequest } from "next/server";
import { z } from "zod";
import { OrchestratorService } from "@/modules/ai/orchestrator.service";
import { createProvider } from "@/modules/ai/providers";
import { readAiOverrideHeaders } from "@/modules/ai/providers/overrides";
import { persistTurn, resolveConversation } from "@/modules/ai/conversation.helpers";
import { badRequest } from "@/lib/errors";
import { FixedWindowRateLimiter, Semaphore } from "@/lib/rate-limit";
import { guardApi } from "@/lib/api-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const QuerySchema = z.strictObject({
  question: z.string().min(3).max(500),
  conversationId: z.string().min(1).optional(),
});

const semaphore = new Semaphore(Number(process.env.AI_MAX_CONCURRENCY ?? 3));
const ipLimiter = new FixedWindowRateLimiter(10, 60_000);

/**
 * POST /api/ai/query/stream — same orchestration as /api/ai/query, but emits
 * live progress over Server-Sent Events: status, tool_call, tool_result, then
 * a final `answer` event with the full result payload.
 */
export async function POST(req: NextRequest) {
  const guard = await guardApi("useAiAnalyst");
  if (guard.response) return guard.response;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (ipLimiter.take(`${guard.user.id}:${ip}`) === 0) {
    return Response.json(
      { error: { code: "rate_limited", message: "Too many AI queries — wait a minute and try again." } },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  const parsed = QuerySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Provide a question (3–500 characters).");
  const { question } = parsed.data;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      let acquired = false;
      try {
        send({ type: "status", text: "Loading your chat history…" });
        const conv = await resolveConversation(guard.user.id, question, parsed.data.conversationId);
        if (!conv.ok) {
          send({ type: "error", message: conv.error });
          return;
        }
        const { conversationId, history } = conv;

        acquired = await semaphore.acquire(15_000);
        if (!acquired) {
          send({ type: "error", message: "The AI analyst is handling other questions right now — try again shortly." });
          return;
        }

        const provider = createProvider(readAiOverrideHeaders(req));
        const result = await new OrchestratorService(provider).answerQuestion(question, history, (ev) => send(ev));
        await persistTurn(conversationId, result);
        send({ type: "answer", ...result, conversationId });
      } catch (e) {
        console.error("[api/ai/query/stream]", e);
        const message = e instanceof Error ? e.message : "Unexpected error";
        send({ type: "error", message: message.includes("AI_") || message.includes("provider") ? message : "The AI query failed." });
      } finally {
        if (acquired) semaphore.release();
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
