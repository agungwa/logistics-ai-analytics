import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { OrchestratorService } from "@/modules/ai/orchestrator.service";
import { createProvider } from "@/modules/ai/providers";
import { readAiOverrideHeaders } from "@/modules/ai/providers/overrides";
import { badRequest, serverError } from "@/lib/errors";
import { FixedWindowRateLimiter, Semaphore } from "@/lib/rate-limit";
import { guardApi } from "@/lib/api-guard";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const QuerySchema = z.strictObject({
  question: z.string().min(3).max(500),
  conversationId: z.string().min(1).optional(),
});

// Instance-local guardrails for the demo: provider limits vary (RPM/TPM), so we
// cap concurrent turns and per-IP request rate rather than guessing any single
// provider's quota. Multi-instance deployments would externalize this (Redis).
const MAX_CONCURRENT_AI_TURNS = Number(process.env.AI_MAX_CONCURRENCY ?? 3);
const PER_IP_PER_MINUTE = 10;
const CONCURRENCY_TIMEOUT_MS = 15_000;

const semaphore = new Semaphore(MAX_CONCURRENT_AI_TURNS);
const ipLimiter = new FixedWindowRateLimiter(PER_IP_PER_MINUTE, 60_000);

/** POST /api/ai/query { question, conversationId? } — NL question with persisted chat history. */
export async function POST(req: NextRequest) {
  try {
    const guard = await guardApi("useAiAnalyst");
    if (guard.response) return guard.response;

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (ipLimiter.take(`${guard.user.id}:${ip}`) === 0) {
      return NextResponse.json(
        { error: { code: "rate_limited", message: "Too many AI queries — wait a minute and try again." } },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }

    const parsed = QuerySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return badRequest("Provide a question (3–500 characters).");
    }
    const { question } = parsed.data;

    // Resolve or create the conversation (owned by the caller).
    let conversationId = parsed.data.conversationId ?? null;
    if (conversationId) {
      const conv = await db.conversation.findFirst({ where: { id: conversationId, userId: guard.user.id } });
      if (!conv) return badRequest("Conversation not found.");
    } else {
      const conv = await db.conversation.create({
        data: { userId: guard.user.id, title: question.length > 60 ? `${question.slice(0, 57)}…` : question },
      });
      conversationId = conv.id;
    }
    await db.message.create({ data: { conversationId, role: "user", content: question } });

    // Conversation context for the model (prior Q&A only, no tool payloads).
    const prior = await db.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      select: { role: true, content: true },
    });
    const history = prior.slice(0, -1).map((m) => ({
      role: m.role === "user" ? ("user" as const) : ("assistant" as const),
      text: m.content,
    }));

    const acquired = await semaphore.acquire(CONCURRENCY_TIMEOUT_MS);
    if (!acquired) {
      return NextResponse.json(
        { error: { code: "busy", message: "The AI analyst is handling other questions right now — try again shortly." } },
        { status: 503, headers: { "Retry-After": "15" } }
      );
    }

    let result;
    try {
      const provider = createProvider(readAiOverrideHeaders(req));
      result = await new OrchestratorService(provider).answerQuestion(question, history);
    } finally {
      semaphore.release();
    }

    await db.message.create({
      data: {
        conversationId,
        role: "assistant",
        content: result.answer,
        resultJson: JSON.stringify(result),
      },
    });
    await db.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });

    return NextResponse.json({ ...result, conversationId });
  } catch (e) {
    console.error("[api/ai/query]", e);
    const message = e instanceof Error ? e.message : "Unexpected error";
    return serverError(message.includes("AI_") || message.includes("provider") ? message : undefined);
  }
}
