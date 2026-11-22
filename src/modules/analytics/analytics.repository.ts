import { Prisma, type PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import type { DimensionId, FilterField, OrderFilters, StatusCounts, TimeBucket } from "./analytics.types";

/**
 * Repository layer: database access only. All inputs reaching this layer have
 * already been validated (enum dimensions, validated filter values, resolved
 * date boundaries). Values are bound as parameters; column names come
 * exclusively from the allowlisted filter/dimension enums.
 */

const FILTER_FIELDS: readonly FilterField[] = [
  "carrier",
  "region",
  "warehouse",
  "product_category",
  "status",
  "destination_city",
  "origin_city",
];

export function buildWhere(filters: OrderFilters, from: string, to: string): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {
    order_date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) },
  };
  for (const field of FILTER_FIELDS) {
    const values = filters[field];
    if (values && values.length > 0) {
      where[field] = { in: values };
    }
  }
  return where;
}

function emptyStatusCounts(): StatusCounts {
  return { delivered: 0, delayed: 0, in_transit: 0, exception: 0, canceled: 0 };
}

export class AnalyticsRepository {
  constructor(private prisma: PrismaClient = db) {}

  async getDatasetBounds(): Promise<{ min: string; max: string }> {
    const agg = await this.prisma.order.aggregate({
      _min: { order_date: true },
      _max: { order_date: true },
    });
    return {
      min: agg._min.order_date?.toISOString().slice(0, 10) ?? "",
      max: agg._max.order_date?.toISOString().slice(0, 10) ?? "",
    };
  }

  async getDistinctValues(field: FilterField): Promise<string[]> {
    const rows = await this.prisma.order.findMany({
      select: { [field]: true },
      distinct: [field] as never,
    });
    return Array.from(new Set(rows.map((r) => (r as Record<string, string>)[field]))).sort();
  }

  async getStatusCounts(where: Prisma.OrderWhereInput): Promise<StatusCounts> {
    const groups = await this.prisma.order.groupBy({ by: ["status"], where, _count: { _all: true } });
    const counts = emptyStatusCounts();
    for (const g of groups) {
      if (g.status in counts) counts[g.status as keyof StatusCounts] = g._count._all;
    }
    return counts;
  }

  async count(where: Prisma.OrderWhereInput): Promise<number> {
    return this.prisma.order.count({ where });
  }

  async valueAggregates(where: Prisma.OrderWhereInput): Promise<{ total: number; avg: number; count: number }> {
    const agg = await this.prisma.order.aggregate({
      where,
      _sum: { order_value_usd: true },
      _avg: { order_value_usd: true },
      _count: { _all: true },
    });
    return {
      total: Number(agg._sum.order_value_usd ?? 0),
      avg: Number(agg._avg.order_value_usd ?? 0),
      count: agg._count._all,
    };
  }

  /** Avg calendar days between delivery and order date (delivered + delayed only). */
  async avgDeliveryDays(where: Prisma.OrderWhereInput): Promise<number | null> {
    const conditions = this.rawConditions(where);
    conditions.unshift(Prisma.sql`"status" IN ('delivered','delayed') AND "delivery_date" IS NOT NULL`);
    const rows = await this.prisma.$queryRaw<Array<{ avg_days: Prisma.Decimal | null }>>(
      Prisma.sql`SELECT AVG("delivery_date" - "order_date") AS avg_days FROM "Order" WHERE ${Prisma.join(conditions, " AND ")}`
    );
    const v = rows[0]?.avg_days;
    return v === null || v === undefined ? null : Number(v);
  }

  /** Per-value status counts for any dimension (e.g. carrier delay breakdown). */
  async dimensionBreakdown(
    dimension: DimensionId,
    where: Prisma.OrderWhereInput
  ): Promise<Array<{ key: string; statusCounts: StatusCounts }>> {
    const field = dimension as FilterField;
    const detail = await this.prisma.order.groupBy({
      by: [field, "status"],
      where,
      _count: { _all: true },
    });
    const map = new Map<string, StatusCounts>();
    for (const row of detail) {
      const key = (row as unknown as Record<string, string>)[field];
      const counts = map.get(key) ?? emptyStatusCounts();
      if (row.status in counts) counts[row.status as keyof StatusCounts] = row._count._all;
      map.set(key, counts);
    }
    return Array.from(map.entries())
      .map(([key, statusCounts]) => ({ key, statusCounts }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }

  /** Sum / avg of order_value_usd per dimension value (value-metric breakdowns). */
  async dimensionValueBreakdown(
    dimension: DimensionId,
    where: Prisma.OrderWhereInput
  ): Promise<Array<{ key: string; total: number; avg: number; count: number }>> {
    const field = dimension as FilterField;
    const groups = await this.prisma.order.groupBy({
      by: [field],
      where,
      _sum: { order_value_usd: true },
      _avg: { order_value_usd: true },
      _count: { _all: true },
    });
    return groups
      .map((g) => ({
        key: (g as unknown as Record<string, string>)[field],
        total: Number((g._sum.order_value_usd ?? 0)),
        avg: Number((g._avg.order_value_usd ?? 0)),
        count: g._count._all,
      }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }

  /** Time-series bucket counts via date_trunc (bucket allowlisted, bound as parameter). */
  async timeSeries(bucket: TimeBucket, where: Prisma.OrderWhereInput): Promise<Array<{ bucket: string; count: number }>> {
    const conditions = this.rawConditions(where);
    const whereSql = conditions.length > 0 ? Prisma.sql` AND ${Prisma.join(conditions, " AND ")}` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<Array<{ b: Date; count: bigint }>>(
      Prisma.sql`SELECT date_trunc(${bucket}, "order_date"::timestamp) AS b, COUNT(*) AS count
                 FROM "Order" WHERE TRUE${whereSql}
                 GROUP BY 1 ORDER BY 1`
    );
    return rows.map((r) => ({ bucket: new Date(r.b).toISOString().slice(0, 10), count: Number(r.count) }));
  }

  /** Per-bucket counts restricted to given statuses (delivery performance over time). */
  async timeSeriesByStatus(
    bucket: TimeBucket,
    where: Prisma.OrderWhereInput,
    statuses: string[]
  ): Promise<Array<{ bucket: string; status: string; count: number }>> {
    const conditions = this.rawConditions(where);
    conditions.unshift(
      Prisma.sql`"status" IN (${Prisma.join(statuses.map((s) => Prisma.sql`${s}`))})`
    );
    const rows = await this.prisma.$queryRaw<Array<{ b: Date; status: string; count: bigint }>>(
      Prisma.sql`SELECT date_trunc(${bucket}, "order_date"::timestamp) AS b, "status" AS status, COUNT(*) AS count
                 FROM "Order" WHERE ${Prisma.join(conditions, " AND ")}
                 GROUP BY 1, 2 ORDER BY 1`
    );
    return rows.map((r) => ({
      bucket: new Date(r.b).toISOString().slice(0, 10),
      status: r.status,
      count: Number(r.count),
    }));
  }

  /** Translate an already-validated Prisma where clause into parameterized raw SQL fragments. */
  private rawConditions(where: Prisma.OrderWhereInput): Prisma.Sql[] {
    const conditions: Prisma.Sql[] = [];
    const dateFilter = where.order_date as { gte?: Date; lte?: Date } | undefined;
    if (dateFilter?.gte) conditions.push(Prisma.sql`"order_date" >= ${dateFilter.gte.toISOString().slice(0, 10)}::date`);
    if (dateFilter?.lte) conditions.push(Prisma.sql`"order_date" <= ${dateFilter.lte.toISOString().slice(0, 10)}::date`);
    for (const field of FILTER_FIELDS) {
      const value = where[field] as { in?: string[] } | undefined;
      if (value?.in && value.in.length > 0) {
        const col = Prisma.raw(`"${field}"`);
        conditions.push(Prisma.sql`${col} IN (${Prisma.join(value.in.map((v) => Prisma.sql`${v}`))})`);
      }
    }
    return conditions;
  }
}
