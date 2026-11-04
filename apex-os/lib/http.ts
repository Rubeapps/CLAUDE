import { NextResponse } from "next/server";

export interface ApiErrorBody {
  error: string;
  message: string;
  details?: unknown;
}

export function jsonError(status: 400 | 401 | 403 | 404 | 405 | 409 | 422 | 500 | 502, error: string, message: string, details?: unknown) {
  const body: ApiErrorBody = details === undefined ? { error, message } : { error, message, details };
  return NextResponse.json(body, { status });
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") return error.message;
  return "Erro desconhecido";
}
