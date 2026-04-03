import { Hono } from "hono";
import { cors } from "hono/cors";
import health from "./routes/health";
import rooms from "./routes/rooms";
import token from "./routes/token";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>();

app.use("*", cors());

app.route("/health", health);
app.route("/api/rooms", rooms);
app.route("/api/rooms", token);

export default app;
