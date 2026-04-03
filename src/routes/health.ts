import { Hono } from "hono";
import type { AppEnv } from "../types";

const health = new Hono<AppEnv>();

health.get("/", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

export default health;
