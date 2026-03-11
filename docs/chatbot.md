# Flint Chatbot Integration

## Overview

This website uses a floating chatbot widget on every page. The frontend calls local backend routes, and the backend proxies to MiniMax using `MINIMAX_API_KEY` from environment variables.

## Routes

- `GET /api/chat/health`
- `GET /api/chat/models`
- `POST /api/chat/message`
- `POST /api/site-chat/chat` (legacy alias for landing assistant compatibility)
- `POST /api/site-chat/events` (accepts telemetry events, returns `{ ok: true }`)

## Request payload (`POST /api/chat/message`)

```json
{
  "sessionId": "string",
  "messages": [{ "role": "user", "content": "hello" }],
  "page": { "url": "https://example.com", "title": "Home", "path": "/" }
}
```

## Environment variables

- `MINIMAX_API_KEY` (required)
- `MINIMAX_BASE_URL` (optional, defaults to `https://api.minimax.io/anthropic`)
- `SITE_CHAT_ALLOWED_ORIGINS` (optional CORS allowlist)
- `SITE_CHAT_RATE_LIMIT_MAX` (optional, default `30` requests/minute per IP)
- `SITE_CHAT_DEFAULT_MODEL` (optional, default `minimax/MiniMax-M2.1`)

## Security notes

- API keys are server-side only.
- Frontend never receives provider credentials.
- Chat messages are rendered as text only to reduce XSS risk.
- Page context sent to backend is metadata-only (URL/title/path).

## Flint role orchestration

- Flint is prompted as Tommy's AI assistant and concierge host.
- Prompt composition includes:
  - page metadata (`url`, `title`, `path`)
  - deterministic destination mapping
  - concise curated knowledge snippets from:
    - `/Users/flint/Documents/AI Website/docs/flint-concierge-guide.md`
- Behavior policy:
  - reactive-first assistance
  - soft hotel metaphor usage
  - real page/project names only (no invented destinations)
  - owner handoff suggestions only for explicit intent triggers

## Deployment checks

Run these after each deploy to validate domain routing:

- `GET /api/chat/health` should return `200`.
- `POST /api/chat/message` should return `200` with an `assistant` object.
- `POST /api/site-chat/chat` should return `200` with an `assistantMessage` object.

## Recommended production routing (Cloudflare Pages + Railway API)

- Frontend: `https://tphch.com` (Cloudflare Pages)
- API: `https://api.tphch.com` (Railway custom domain)

The frontend assistants default to `https://api.tphch.com` when loaded from `tphch.com` or any `*.tphch.com` hostname (excluding `api.tphch.com` itself). Local development remains same-origin by default.
