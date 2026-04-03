import type { Context } from "hono";

export function ok<T>(c: Context, data: T, status = 200): Response {
  return c.json({ success: true, data }, status as 200 | 201);
}

export function err(c: Context, message: string, status = 400): Response {
  return c.json({ success: false, error: message }, status as 400 | 401 | 403 | 404 | 500);
}
