import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guardApi } from "@/lib/api-guard";
import { serverError } from "@/lib/errors";

export const dynamic = "force-dynamic";

/** GET /api/conversations — the caller's chat list, newest first. */
export async function GET() {
  try {
    const guard = await guardApi("useAiAnalyst");
    if (guard.response) return guard.response;

    const conversations = await db.conversation.findMany({
      where: { userId: guard.user.id },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, updatedAt: true },
      take: 50,
    });
    return NextResponse.json({ conversations });
  } catch (e) {
    console.error("[api/conversations]", e);
    return serverError();
  }
}
