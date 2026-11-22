/**
 * Deterministic CSV seed import.
 * Parses prisma/data/mock_logistics_data.csv, validates every row with Zod,
 * and reports a verification summary. Invalid rows abort the import (nothing
 * is silently discarded). Re-runnable: wipes and re-imports the orders table.
 */
import { PrismaClient } from "@prisma/client";
import { createReadStream } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const db = new PrismaClient();

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const RowSchema = z.object({
  client_id: z.string().min(1),
  order_id: z.string().min(1),
  order_date: z.string().regex(dateRegex),
  delivery_date: z.union([z.string().regex(dateRegex), z.literal("")]),
  carrier: z.string().min(1),
  origin_city: z.string().min(1),
  destination_city: z.string().min(1),
  status: z.enum(["delivered", "delayed", "in_transit", "exception", "canceled"]),
  sku: z.string().min(1),
  product_category: z.string().min(1),
  quantity: z.coerce.number().int().positive(),
  unit_price_usd: z.coerce.number().nonnegative(),
  order_value_usd: z.coerce.number().nonnegative(),
  is_promo: z.coerce.number().int().min(0).max(1),
  promo_discount_pct: z.coerce.number().min(0).max(100),
  region: z.string().min(1),
  warehouse: z.string().min(1),
});

type Row = z.infer<typeof RowSchema>;

function parseCsv(stream: AsyncIterable<Buffer>): Promise<string[][]> {
  // Minimal CSV parser handling quoted fields (cities like "London, UK").
  return new Promise(async (resolve, reject) => {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = "";
    let inQuotes = false;
    let first = true;
    try {
      for await (const chunk of stream) {
        const text = chunk.toString();
        for (let i = 0; i < text.length; i++) {
          const c = text[i];
          if (inQuotes) {
            if (c === '"') {
              if (text[i + 1] === '"') {
                field += '"';
                i++;
              } else {
                inQuotes = false;
              }
            } else {
              field += c;
            }
          } else if (c === '"') {
            inQuotes = true;
          } else if (c === ",") {
            row.push(field);
            field = "";
          } else if (c === "\n") {
            row.push(field.replace(/\r$/, ""));
            field = "";
            if (first) {
              rows.push(row); // header
              first = false;
            } else if (row.length > 1 || row[0] !== "") {
              rows.push(row);
            }
            row = [];
          } else {
            field += c;
          }
        }
      }
      if (field !== "" || row.length > 0) {
        row.push(field.replace(/\r$/, ""));
        rows.push(row);
      }
      resolve(rows);
    } catch (e) {
      reject(e);
    }
  });
}

async function main() {
  const csvPath = join(process.cwd(), "prisma", "data", "mock_logistics_data.csv");
  const raw = await parseCsv(createReadStream(csvPath));
  const [header, ...dataRows] = raw;

  const expectedHeader = [
    "client_id", "order_id", "order_date", "delivery_date", "carrier",
    "origin_city", "destination_city", "status", "sku", "product_category",
    "quantity", "unit_price_usd", "order_value_usd", "is_promo",
    "promo_discount_pct", "region", "warehouse",
  ];
  if (JSON.stringify(header) !== JSON.stringify(expectedHeader)) {
    throw new Error(`Unexpected CSV header: ${header.join(",")}`);
  }

  const rows: Row[] = [];
  const errors: string[] = [];
  dataRows.forEach((r, idx) => {
    const obj = Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""]));
    const parsed = RowSchema.safeParse(obj);
    if (!parsed.success) {
      errors.push(`Row ${idx + 2}: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    } else {
      rows.push(parsed.data);
    }
  });

  if (errors.length > 0) {
    console.error(`Import aborted — ${errors.length} invalid rows:`);
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  }

  const orderIds = new Set(rows.map((r) => r.order_id));
  if (orderIds.size !== rows.length) {
    throw new Error(`Duplicate order_id values: ${rows.length - orderIds.size}`);
  }

  await db.order.deleteMany();
  await db.order.createMany({
    data: rows.map((r) => ({
      order_id: r.order_id,
      client_id: r.client_id,
      order_date: new Date(`${r.order_date}T00:00:00Z`),
      delivery_date: r.delivery_date ? new Date(`${r.delivery_date}T00:00:00Z`) : null,
      carrier: r.carrier,
      origin_city: r.origin_city,
      destination_city: r.destination_city,
      status: r.status,
      sku: r.sku,
      product_category: r.product_category,
      quantity: r.quantity,
      unit_price_usd: r.unit_price_usd,
      order_value_usd: r.order_value_usd,
      is_promo: r.is_promo === 1,
      promo_discount_pct: r.promo_discount_pct,
      region: r.region,
      warehouse: r.warehouse,
    })),
  });

  // Verification summary — must match the known source profile.
  const counts = await db.order.groupBy({ by: ["status"], _count: { _all: true } });
  const statusCounts = Object.fromEntries(counts.map((c) => [c.status, c._count._all]));
  const nullDeliveries = await db.order.count({ where: { delivery_date: null } });
  const range = await db.order.aggregate({ _min: { order_date: true }, _max: { order_date: true } });
  const distinct = await db.order.findMany({ select: { sku: true, product_category: true, carrier: true } });
  const skus = new Set(distinct.map((d) => d.sku)).size;
  const categories = new Set(distinct.map((d) => d.product_category)).size;
  const carriers = new Set(distinct.map((d) => d.carrier)).size;

  console.log("Seed verification summary:");
  console.log(`  rows imported:        ${rows.length}`);
  console.log(`  unique order_ids:     ${orderIds.size}`);
  console.log(`  status counts:        ${JSON.stringify(statusCounts)}`);
  console.log(`  null delivery_date:   ${nullDeliveries}`);
  console.log(`  order_date range:     ${range._min.order_date?.toISOString().slice(0, 10)} → ${range._max.order_date?.toISOString().slice(0, 10)}`);
  console.log(`  distinct skus:        ${skus}`);
  console.log(`  categories/carriers:  ${categories}/${carriers}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
