import { Hono } from "hono";
import { apiKeyAuth } from "../middleware/auth";
import { getRoom } from "../services/room";
import { issueToken, type Permission } from "../services/token";
import type { AppEnv } from "../types";
import { err, ok } from "../utils/response";

const token = new Hono<AppEnv>();

token.use("*", apiKeyAuth);

token.post("/:roomId/token", async (c) => {
  const room = await getRoom(c.env.ROOMS_KV, c.req.param("roomId"));
  if (!room) return err(c, "ルームが見つかりません", 404);

  const body = await c.req.json<{ permissions?: string; expiresIn?: number }>();
  const permissions = body.permissions as Permission | undefined;

  if (!permissions || !["publish", "subscribe", "both"].includes(permissions)) {
    return err(c, "permissions は publish / subscribe / both のいずれかを指定してください");
  }

  const expiresIn = body.expiresIn ?? 3600;
  if (expiresIn <= 0 || expiresIn > 86400) {
    return err(c, "expiresIn は 1〜86400 秒の範囲で指定してください");
  }

  const result = await issueToken(c.env.MOQ_SIGNING_KEY, room.root, permissions, expiresIn);
  return ok(c, result);
});

export default token;
