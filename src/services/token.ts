import { load, sign } from "@moq/token";
import type { Claims } from "@moq/token";

const MOQ_RELAY_URL = "https://cdn.moq.dev";

export type Permission = "publish" | "subscribe" | "both";

export interface TokenResult {
  token: string;
  url: string;
  root: string;
  expiresAt: string;
}

export async function issueToken(
  signingKeyJwk: string,
  root: string,
  permissions: Permission,
  expiresIn: number
): Promise<TokenResult> {
  const key = await load(signingKeyJwk);
  const now = Math.floor(Date.now() / 1000);
  const exp = now + expiresIn;

  const claims: Claims = {
    root,
    iat: now,
    exp,
    ...(permissions === "publish" && { put: "" }),
    ...(permissions === "subscribe" && { get: "" }),
    ...(permissions === "both" && { put: "", get: "" }),
  };

  const token = await sign(key, claims);
  const url = MOQ_RELAY_URL;
  const expiresAt = new Date(exp * 1000).toISOString();

  return { token, url, root, expiresAt };
}
