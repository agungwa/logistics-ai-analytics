import { db } from "@/lib/db";
import type { AiQueryResult } from "./orchestrator.service";

/** Shared conversation handling for the AI query routes (stream + JSON). */

export async function resolveConversation(
  userId: string,
  question: string,
  conversationId: string | undefined
): Promise<{ ok: true; conversationId: string; history: Array<{ role: "user" | "assistant"; text: string }> } | { ok: false; error: string }> {
  let convId = conversationId ?? null;
  if (convId) {
    const conv = await db.conversation.findFirst({ where: { id: convId, userId } });
    if (!conv) return { ok: false, error: "Conversation not found." };
  } else {
    const conv = await db.conversation.create({
      data: { userId, title: question.length > 60 ? `${question.slice(0, 57)}…` : question },
    });
    convId = conv.id;
  }
  await db.message.create({ data: { conversationId: convId, role: "user", content: question } });

  const prior = await db.message.findMany({
    where: { conversationId: convId },
    orderBy: { createdAt: "asc" },
    select: { role: true, content: true },
  });
  const history = prior.slice(0, -1).map((m) => ({
    role: m.role === "user" ? ("user" as const) : ("assistant" as const),
    text: m.content,
  }));
  return { ok: true, conversationId: convId, history };
}

export async function persistTurn(conversationId: string, result: AiQueryResult): Promise<void> {
  await db.message.create({
    data: { conversationId, role: "assistant", content: result.answer, resultJson: JSON.stringify(result) },
  });
  await db.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
}
