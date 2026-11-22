import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guardApi } from "@/lib/api-guard";
import { notFound, serverError } from "@/lib/errors";

export const dynamic = "force-dynamic";

/** GET /api/conversations/:id — full message history for the caller's chat. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const guard = await guardApi("useAiAnalyst");
    if (guard.response) return guard.response;

    const { id } = await params;
    const conv = await db.conversation.findFirst({
      where: { id, userId: guard.user.id },
      include: {
        messages: { orderBy: { createdAt: "asc" }, select: { id: true, role: true, content: true, resultJson: true, createdAt: true } },
      },
    });
    if (!conv) return notFound("Conversation not found.");
    return NextResponse.json({
      conversation: { id: conv.id, title: conv.title, updatedAt: conv.updatedAt },
      messages: conv.messages,
    });
  } catch (e) {
    console.error("[api/conversations/:id GET]", e);
    return serverError();
  }
}

/** DELETE /api/conversations/:id — admin only (RBAC). */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const guard = await guardApi("deleteConversation");
    if (guard.response) return guard.response;

    const { id } = await params;
    const conv = await db.conversation.findFirst({ where: { id, userId: guard.user.id } });
    if (!conv) return notFound("Conversation not found.");
    await db.conversation.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/conversations/:id DELETE]", e);
    return serverError();
  }
}
