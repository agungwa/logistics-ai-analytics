import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guardApi } from "@/lib/api-guard";
import { serverError } from "@/lib/errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/skus?q= — SKU autocomplete: top 10 matching SKUs with their order
 * counts (helps users pick SKUs that actually have history). Parameterized.
 */
export async function GET(req: NextRequest) {
  try {
    const guard = await guardApi("viewDashboard");
    if (guard.response) return guard.response;

    const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 40);
    const groups = await db.order.groupBy({
      by: ["sku"],
      where: q ? { sku: { contains: q, mode: "insensitive" } } : {},
      _count: { _all: true },
      orderBy: { _count: { sku: "desc" } },
      take: 10,
    });
    return NextResponse.json({
      skus: groups.map((g) => ({ sku: g.sku, orders: g._count._all })),
    });
  } catch (e) {
    console.error("[api/skus]", e);
    return serverError();
  }
}
