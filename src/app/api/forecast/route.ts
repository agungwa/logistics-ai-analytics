import { NextRequest, NextResponse } from "next/server";
import { ForecastService } from "@/modules/forecasting/forecast.service";
import { ForecastRequestSchema } from "@/modules/forecasting/forecast.schemas";
import { badRequest, serverError } from "@/lib/errors";
import { guardApi } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

/** POST /api/forecast { scope: "category"|"sku", entity, horizon } */
export async function POST(req: NextRequest) {
  try {
    const guard = await guardApi("viewForecasting");
    if (guard.response) return guard.response;
    const body = await req.json().catch(() => null);
    const parsed = ForecastRequestSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    }
    const result = await new ForecastService().forecast(parsed.data.scope, parsed.data.entity, parsed.data.horizon);
    return NextResponse.json(result);
  } catch (e) {
    console.error("[api/forecast]", e);
    return serverError();
  }
}
