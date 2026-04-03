# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

**moq-workers** は、[Media over QUIC (MoQ)](https://moq.dev/) のアプリケーション層を担う Cloudflare Workers プロジェクトです。

メディアリレーは Cloudflare MoQ CDN（`https://cdn.moq.dev`）が担当し、本 Workers はそのアクセス制御・ルーム管理・JWT トークン発行の API レイヤーを提供します。

```
クライアント → [moq-workers API] → JWT発行
                     ↕ KV
クライアント → [cdn.moq.dev] (WebTransport/QUIC) ← JWTで認証
```

## コマンド

```bash
npm install           # 依存関係インストール
npm run dev           # ローカル開発サーバー起動（wrangler dev）
npm run deploy        # Cloudflare へデプロイ
npm run type-check    # TypeScript 型チェック
```

## アーキテクチャ

- **フレームワーク**: [Hono](https://hono.dev/) — Workers ネイティブの軽量ルーター
- **認証**: JWT（`@moq/token` / `jose` 使用）、管理 API は Bearer API_KEY
- **ストレージ**: Cloudflare KV（ルームメタデータ）
- **トークンライブラリ**: `@moq/token` — JWK ベースの署名・検証

### ソース構成

```
src/
├── index.ts              # Honoアプリ、ルート登録
├── types.ts              # Bindings / AppEnv / Room 型定義
├── middleware/auth.ts    # Bearer API_KEY 認証
├── routes/
│   ├── health.ts         # GET /health
│   ├── rooms.ts          # GET|POST|DELETE /api/rooms[/:id]
│   └── token.ts          # POST /api/rooms/:roomId/token
├── services/
│   ├── room.ts           # KV CRUD（room:<id> キー）
│   └── token.ts          # @moq/token で JWT 署名
└── utils/response.ts     # ok() / err() JSON ヘルパー
```

### API エンドポイント

| メソッド | パス | 認証 | 説明 |
|---------|------|------|------|
| GET | `/health` | なし | ヘルスチェック |
| POST | `/api/rooms` | Bearer | ルーム作成 |
| GET | `/api/rooms` | Bearer | ルーム一覧 |
| GET | `/api/rooms/:id` | Bearer | ルーム詳細 |
| DELETE | `/api/rooms/:id` | Bearer | ルーム削除 |
| POST | `/api/rooms/:id/token` | Bearer | JWT トークン発行 |

### JWT Claims（`@moq/token`）

| フィールド | 説明 |
|-----------|------|
| `root` | CDN のパスプレフィックス（例: `rooms/<id>`） |
| `put` | publish 権限（`""` = ルート配下すべて） |
| `get` | subscribe 権限（`""` = ルート配下すべて） |
| `exp` / `iat` | 有効期限 / 発行日時（Unix 秒） |

## セットアップ

### KV 名前空間作成

```bash
npx wrangler kv namespace create ROOMS_KV
# 出力された id を wrangler.toml の id フィールドに設定する
```

### シークレット設定

`MOQ_SIGNING_KEY` は JWK を base64url エンコードした文字列を渡すこと（JSON のまま渡すとパースエラーになる）。

```bash
# 署名鍵生成（base64url エンコード済み）
node -e "import('jose').then(async({generateSecret,exportJWK})=>{const k=await generateSecret('HS256',{extractable:true});const j=await exportJWK(k);j.alg='HS256';j.key_ops=['sign','verify'];console.log(Buffer.from(JSON.stringify(j)).toString('base64url'))})"

# Cloudflare に登録
echo "<base64url-encoded-jwk>" | npx wrangler secret put MOQ_SIGNING_KEY
echo "<api-key>" | npx wrangler secret put API_KEY
```

### ローカル開発

`.dev.vars.example` を `.dev.vars` にコピーし、base64url エンコード済みの鍵と API キーを設定してから `npm run dev`。

## 本番環境

デプロイ済み URL: `https://moq-workers.0g0.workers.dev`

## 動作確認

```bash
# ヘルスチェック
curl http://localhost:8787/health

# ルーム作成
curl -X POST http://localhost:8787/api/rooms \
  -H "Authorization: Bearer dev-secret-key" \
  -H "Content-Type: application/json" \
  -d '{"name": "テスト配信"}'

# トークン発行（roomId は作成時のレスポンスから取得）
curl -X POST http://localhost:8787/api/rooms/<roomId>/token \
  -H "Authorization: Bearer dev-secret-key" \
  -H "Content-Type: application/json" \
  -d '{"permissions": "publish", "expiresIn": 3600}'
```

発行された `token` と `url` を使い、`@moq/lite` クライアントから `cdn.moq.dev` に接続できます。
