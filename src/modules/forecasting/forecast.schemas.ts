import { z } from "zod";

export const ForecastRequestSchema = z
  .object({
    scope: z.enum(["category", "sku"]),
    entity: z.string().min(1).max(64),
    horizon: z.number().int().min(1).max(6).optional().default(3),
  })
  .strict();

export type ForecastRequest = z.infer<typeof ForecastRequestSchema>;
