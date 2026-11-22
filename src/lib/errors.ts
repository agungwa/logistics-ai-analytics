import { NextResponse } from "next/server";

/** Consistent API error responses: safe message + machine-readable code. */
export function apiError(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

export function badRequest(message: string): NextResponse {
  return apiError("bad_request", message, 400);
}

export function notFound(message: string): NextResponse {
  return apiError("not_found", message, 404);
}

export function serverError(message = "Unexpected server error"): NextResponse {
  return apiError("server_error", message, 500);
}
