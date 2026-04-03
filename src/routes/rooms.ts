import { Hono } from "hono";
import { apiKeyAuth } from "../middleware/auth";
import { createRoom, deleteRoom, getRoom, listRooms } from "../services/room";
import type { AppEnv } from "../types";
import { err, ok } from "../utils/response";

const rooms = new Hono<AppEnv>();

rooms.use("*", apiKeyAuth);

rooms.post("/", async (c) => {
  const body = await c.req.json<{ name?: string; description?: string }>();
  if (!body.name?.trim()) {
    return err(c, "name は必須です");
  }
  const room = await createRoom(c.env.ROOMS_KV, body.name.trim(), body.description?.trim());
  return ok(c, room, 201);
});

rooms.get("/", async (c) => {
  const list = await listRooms(c.env.ROOMS_KV);
  return ok(c, list);
});

rooms.get("/:roomId", async (c) => {
  const room = await getRoom(c.env.ROOMS_KV, c.req.param("roomId"));
  if (!room) return err(c, "ルームが見つかりません", 404);
  return ok(c, room);
});

rooms.delete("/:roomId", async (c) => {
  const deleted = await deleteRoom(c.env.ROOMS_KV, c.req.param("roomId"));
  if (!deleted) return err(c, "ルームが見つかりません", 404);
  return ok(c, { deleted: true });
});

export default rooms;
