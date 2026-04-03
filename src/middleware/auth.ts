import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types";
import { err } from "../utils/response";

export const apiKeyAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const authorization = c.req.header("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return err(c, "認証が必要です", 401);
  }
  const token = authorization.slice(7);
  if (token !== c.env.API_KEY) {
    return err(c, "APIキーが無効です", 403);
  }
  await next();
  return;
};
