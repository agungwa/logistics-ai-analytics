import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { guardApi } from "@/lib/api-guard";
import { badRequest, serverError } from "@/lib/errors";
import { resolveDateRange } from "@/lib/date-range";

export const dynamic = "force-dynamic";

/**
 * GET /api/orders — raw order records (the "ordinary table"), bounded:
 * validated filters + resolved date range + pagination (max 50/page). Same
 * filter contract as the analytics layer, so drill-down matches KPIs exactly.
 */

const QuerySchema = z.object({
  q: z.string().max(60).optional(), // free-text: order_id / sku / client / city
  status: z.enum(["delivered", "delayed", "in_transit", "exception", "canceled"]).optional(),
  carrier: z.string().max(40).optional(),
  product_category: z.string().max(40).optional(),
  dateRange: z.string().max(20).optional(), // preset or "from..to"
  page: z.coerce.number().int().min(0).max(1000).optional().default(0),
  pageSize: z.coerce.number().int().min(1).max(50).optional().default(20),
});

const PRESETS = new Set(["all", "last_7_days", "last_1_month", "last_3_months", "last_6_months", "last_12_months", "year_to_date"]);

export async function GET(req: NextRequest) {
  try {
    const guard = await guardApi("viewOrders");
    if (guard.response) return guard.response;

    const sp = req.nextUrl.searchParams;
    const parsed = QuerySchema.safeParse(Object.fromEntries(sp.entries()));
    if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Invalid filters.");
    const { q, status, carrier, product_category, page, pageSize } = parsed.data;

    // Resolve date range against the dataset bounds (same anchoring as analytics).
    const bounds = await db.order.aggregate({ _min: { order_date: true }, _max: { order_date: true } });
    const rawRange = parsed.data.dateRange ?? "all";
    let rangeInput: Parameters<typeof resolveDateRange>[0];
    if (PRESETS.has(rawRange)) {
      rangeInput = rawRange as Parameters<typeof resolveDateRange>[0];
    } else {
      const [from, to] = rawRange.split("..");
      rangeInput = { from: from ?? "", to: to ?? "" };
    }
    const resolved = resolveDateRange(
      rangeInput,
      bounds._max.order_date?.toISOString().slice(0, 10) ?? "2025-12-30",
      bounds._min.order_date?.toISOString().slice(0, 10) ?? "2025-01-01"
    );

    const where: Prisma.OrderWhereInput = {
      order_date: { gte: new Date(`${resolved.from}T00:00:00Z`), lte: new Date(`${resolved.to}T00:00:00Z`) },
      ...(status ? { status } : {}),
      ...(carrier ? { carrier } : {}),
      ...(product_category ? { product_category } : {}),
      ...(q
        ? {
            OR: [
              { order_id: { contains: q, mode: "insensitive" } },
              { sku: { contains: q, mode: "insensitive" } },
              { client_id: { contains: q, mode: "insensitive" } },
              { destination_city: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      db.order.count({ where }),
      db.order.findMany({
        where,
        orderBy: [{ order_date: "desc" }, { order_id: "asc" }],
        skip: page * pageSize,
        take: pageSize,
      }),
    ]);

    return NextResponse.json({
      total,
      page,
      pageSize,
      dateRange: resolved,
      rows: rows.map((o) => ({
        order_id: o.order_id,
        order_date: o.order_date.toISOString().slice(0, 10),
        delivery_date: o.delivery_date?.toISOString().slice(0, 10) ?? null,
        status: o.status,
        carrier: o.carrier,
        route: `${o.origin_city} → ${o.destination_city}`,
        region: o.region,
        warehouse: o.warehouse,
        product_category: o.product_category,
        sku: o.sku,
        quantity: o.quantity,
        order_value_usd: Number(o.order_value_usd),
        is_promo: o.is_promo,
      })),
    });
  } catch (e) {
    console.error("[api/orders]", e);
    return serverError();
  }
}
