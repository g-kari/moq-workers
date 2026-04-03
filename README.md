# moq-workers

Cloudflare Workers application that acts as the auth/API layer for a [Media over QUIC (MoQ)](https://moq.dev/) live streaming service.

The actual media relay is handled by Cloudflare's MoQ CDN (`https://cdn.moq.dev`). This Worker handles room management and JWT token issuance so clients can connect to the relay.

```
Client → [moq-workers] → JWT → Client → [cdn.moq.dev] (WebTransport)
               ↕ KV
           Room metadata
```

## API

All endpoints except `/health` require `Authorization: Bearer <API_KEY>`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/api/rooms` | Create a room |
| GET | `/api/rooms` | List rooms |
| GET | `/api/rooms/:id` | Get room |
| DELETE | `/api/rooms/:id` | Delete room |
| POST | `/api/rooms/:id/token` | Issue JWT token |

### Issue a token

```bash
curl -X POST https://moq-workers.0g0.workers.dev/api/rooms/<roomId>/token \
  -H "Authorization: Bearer <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"permissions": "publish", "expiresIn": 3600}'
```

`permissions`: `publish` | `subscribe` | `both`

Response:
```json
{
  "token": "eyJ...",
  "url": "https://cdn.moq.dev/rooms/<roomId>",
  "expiresAt": "2026-04-03T15:00:00.000Z"
}
```

Use the `token` and `url` to connect via `@moq/lite`.

## Development

```bash
npm install
cp .dev.vars.example .dev.vars  # fill in values
npm run dev
```

### Setup secrets (first time)

```bash
# Create KV namespace and update wrangler.toml with the returned id
npx wrangler kv namespace create ROOMS_KV

# Generate a signing key
node -e "import('jose').then(async({generateSecret,exportJWK})=>{const k=await generateSecret('HS256',{extractable:true});const j=await exportJWK(k);j.alg='HS256';j.key_ops=['sign','verify'];console.log(Buffer.from(JSON.stringify(j)).toString('base64url'))})"

# Store secrets
echo "<key>" | npx wrangler secret put MOQ_SIGNING_KEY
echo "<api-key>" | npx wrangler secret put API_KEY
```

## Deploy

```bash
npx wrangler deploy
```
