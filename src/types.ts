import type { KVNamespace } from "@cloudflare/workers-types";

export type Bindings = {
  ROOMS_KV: KVNamespace;
  MOQ_SIGNING_KEY: string;
  API_KEY: string;
};

export type Variables = Record<string, never>;

export type AppEnv = {
  Bindings: Bindings;
  Variables: Variables;
};

export interface Room {
  id: string;
  name: string;
  description?: string;
  root: string;
  createdAt: string;
  updatedAt: string;
}
