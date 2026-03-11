# Flint Chatbot Integration

## Overview

This website uses a unified inline terminal chat in the menu bar on every page. The frontend calls local backend routes, and the backend proxies to MiniMax using `MINIMAX_API_KEY` from environment variables.

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

## Frontend UI contract

- The shared frontend lives in:
  - `/Users/flint/Documents/AI Website/assets/site-assistant/site-assistant.js`
  - `/Users/flint/Documents/AI Website/assets/site-assistant/site-assistant.css`
- The frontend injects a single inline terminal component into `.site-wordmark` or `.site-nav`.
- Desktop layout keeps the existing left/right nav labels and centers the terminal between them.
- Narrow layouts stack the terminal onto a second row instead of opening a floating window.
- The visible transcript includes typed `user`, `assistant`, and `system` lines.
- System lines are intentionally terse and cover operational events such as session restore, page changes, request state, gate state, clear history, and errors.
- The homepage email gate remains in place and hides the terminal until unlock.

## Client storage

- `site_assistant_session_id_v1` stores the assistant session ID.
- `site_assistant_messages_v1` now stores typed transcript entries:

```json
{
  "version": 2,
  "savedAt": 1710000000000,
  "entries": [
    { "type": "system", "content": "session restored", "ts": 1710000000000, "state": "info" },
    { "type": "user", "content": "hello", "ts": 1710000001000 },
    { "type": "assistant", "content": "hi there", "ts": 1710000002000 }
  ]
}
```

- Legacy message arrays or `{ messages: [...] }` objects are still read and mapped into the new transcript shape on load.
- `site_assistant_open_v1` is retired and cleared by the frontend on initialization.

## Environment variables

- `MINIMAX_API_KEY` (required)
- `MINIMAX_BASE_URL` (optional, defaults to `https://api.minimax.io/anthropic`)
- `SITE_CHAT_ALLOWED_ORIGINS` (optional CORS allowlist)
- `SITE_CHAT_RATE_LIMIT_MAX` (optional, default `30` requests/minute per IP)
- `SITE_CHAT_DEFAULT_MODEL` (optional, default `minimax/MiniMax-M2.1`)
- `SITE_CHAT_MAX_TOKENS` (optional, default `220`)

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
  - concierge policy snippets from:
    - `/Users/flint/Documents/AI Website/docs/flint-concierge-guide.md`
  - expanded site knowledge snippets from:
    - `/Users/flint/Documents/AI Website/docs/flint-site-knowledge.md`
- Behavior policy:
  - reactive-first assistance
  - brief responses (short, direct, token-conscious)
  - soft hotel metaphor usage
  - no unsolicited follow-up suggestions (unless visitor explicitly asks)
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
