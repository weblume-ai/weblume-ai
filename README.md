# Weblume AI

A single-file AI workspace (`index.html`: chat, coding agent, skills, history, file/ZIP export, image generation) plus an **optional** zero-dependency Node backend (`server/`) that keeps provider API keys out of the browser and adds video generation.

```
weblume/
├── index.html                      Frontend (open directly, or served by the backend)
├── package.json                    Scripts only; no dependencies to install
├── .env.example                    Variable names only (copy to .env)
├── .gitignore                      Ignores .env
├── server/
│   ├── proxy.js                    HTTP server, routes, validation, static file
│   └── providers/
│       ├── http.js                 Timeouts, error mapping, secret redaction
│       ├── openai-images.js        Images: OpenAI-compatible /images/generations
│       └── replicate-video.js      Video: Replicate HTTP API (documented endpoints)
└── tests/
    ├── backend.test.js             Backend tests against LOCAL MOCK providers
    └── frontend.test.js            Frontend logic tests (VM, mocked fetch)
```

## Free design mode (default)
Site requests are designed from scratch instead of filling the template. Each request gets an art-direction seed (16 directions, matched to the business type and never repeated in the same chat), and the model writes one complete HTML file guided by six built-in skills: design-director, layout-patterns, motion-kit, site-functionality, site-quality-gate, site-copywriting. Truncated HTML is continued automatically. Turn off "🎨 تصميم حر" in Settings, or say "قالب" in the request, to use the `build_site` template instead.

## Premium site builder (`build_site` tool)
For shop/cafe/restaurant/business sites the model does not write HTML. It calls the `build_site` tool with data only (name, headline, menu or services, WhatsApp, address, hours, theme), and `renderSite()` in `index.html` turns it into a complete Weblume-quality page: dark themed hero, menu with search, category chips and a WhatsApp order cart, services list, steps, visit/map, WhatsApp contact form, floating WhatsApp button, RTL/LTR, mobile layout. Themes: gold, ember, weblume, rose, emerald, cream. All text is escaped and only https image links are kept. This keeps quality high and output fast even with small/free models. If a model replies with the JSON as text instead of a tool call, the app still renders it.

## Free providers switcher
The model pill in the chat header opens a switcher between free OpenAI-compatible sources: OpenRouter (`:free` models), Groq, Google Gemini (AI Studio, `https://generativelanguage.googleapis.com/v1beta/openai`), Mistral (`https://api.mistral.ai/v1`, free Experiment plan), Cerebras (`https://api.cerebras.ai/v1`), NVIDIA NIM (`https://integrate.api.nvidia.com/v1`) and local Ollama.

**Smart routing** (Settings or the switcher): each message is classified (site, code, long input, writing, quick chat) and sent first to the provider/model best suited to it among those with keys: sites → Gemini Flash, code → Mistral Codestral, quick chat → Groq, writing → Gemini/Mistral, long input → Gemini. Fallbacks follow. Browser calls depend on each provider allowing CORS; failures show the exact reason in the thinking panel. Each provider keeps its own key (Settings) and remembered model; the model list is fetched live from the provider's `/models` (OpenRouter filtered to `:free`). With auto-fallback on, a failed request tries `openrouter/free`, then the other providers that have keys, then local Ollama.

## Built-in skills added for Weblume
`build-copy-guide` (auto-applied to every site), `weblume-brand`, `client-proposal`, `client-messages`, `social-content`, `shop-admin-supabase`, `image-prompts`. Existing users receive them automatically (defaults version 9).

## NVIDIA (and Cerebras) through the local server
These providers do not accept direct browser calls (CORS). Run the app through the bundled server and the browser talks to `/api/llm/<provider>/…`, which relays to the fixed upstream (`integrate.api.nvidia.com/v1`, `api.cerebras.ai/v1`) with the user's own key from the Authorization header (or `NVIDIA_API_KEY` / `CEREBRAS_API_KEY` in `.env`). Streaming is passed through, bodies up to 4 MB, foreign Origins rejected, unknown provider names rejected.
On Windows double-click `start.bat` (needs Node.js LTS); it opens `http://127.0.0.1:8787`. Because the server URL is a different browser origin from the file, use Settings → Advanced → copy/paste settings to move your keys once.

## Hosted copy (GitHub Pages) + local server
When `start.bat` is running, the hosted copy at `https://weblume-ai.github.io/weblume-ai/` detects `http://127.0.0.1:8787` and uses it for NVIDIA and for the saved keys file. The server sends CORS (+ `Access-Control-Allow-Private-Network`) only to that origin (extra origins via `WEBLUME_ALLOWED_ORIGINS`, https only); every other site is refused. Chrome/Edge ask once to allow "local network access": choose Allow.

## Account sync (Supabase, optional)
Settings → ☁ الحساب: sign in with email + password and your API keys follow you to any browser or device. Keys are encrypted in the browser (AES-GCM 256, key derived from the password with PBKDF2-SHA256, 210k iterations, salted with the email); the database only stores ciphertext. Setup: create a free Supabase project, run `supabase.sql` in the SQL Editor, set Authentication → URL Configuration → Site URL to your GitHub Pages URL, and put the Project URL + anon/publishable key in Settings → Advanced (or in `SUPA_DEFAULT` in `index.html`). Forgetting the password means re-entering the keys once (they cannot be decrypted without it).

## Thinking panel
While the agent works, a collapsible panel with the animated Weblume mark shows the phase and timer. Reasoning text, tool calls and provider switches stay inside it, collapsed by default.

## Quick start
Requirements: Node.js 18 or newer. There is nothing to `npm install`.

```bash
cp .env.example .env        # then edit .env
npm start                   # http://127.0.0.1:8787
npm test                    # automated tests (mock providers, no network, no keys)
```
Open `http://127.0.0.1:8787` (not the file directly) to use video and server-side image keys. Opening `index.html` as a file still gives chat, skills, history, exports and direct-from-browser image generation.

Chat with Ollama: start Ollama with `OLLAMA_ORIGINS=*` and `OLLAMA_CONTEXT_LENGTH=16384`, then set the URL (`http://localhost:11434/v1`) and model in the app's Settings tab.

## Providers
### Video: Replicate (documented API: https://replicate.com/docs/reference/http)
| App action | Replicate request |
|---|---|
| Create | `POST /v1/models/{owner}/{name}/predictions` body `{input}` (official models), or `POST /v1/predictions` body `{version:"owner/name:<64-char version>", input}` |
| Poll | `GET /v1/predictions/{id}`; `starting`→queued, `processing`→running, `succeeded`, `failed`, `canceled` |
| Cancel | `POST /v1/predictions/{id}/cancel` |
| Token check | `GET /v1/account` (via `GET /api/providers/video/check`, creates nothing and costs nothing) |
| Download | Output files require the `Authorization` header, so the server streams them at `GET /api/video/jobs/{id}/file` (only from `replicate.delivery` hosts) |

Setup: create an API token at replicate.com/account/api-tokens and put it in `.env`:
```
REPLICATE_API_TOKEN=...
REPLICATE_VIDEO_MODEL=owner/name          # a text-to-video model whose input has a "prompt" field
REPLICATE_VIDEO_EXTRA_INPUT={"duration":5} # optional, JSON object of extra inputs from that model's API tab
REPLICATE_CANCEL_AFTER=10m                 # optional automatic deadline
```
The server sends only `prompt` plus your static extra inputs. Input names differ per model, so check the model's API tab; this project does not hard-code a model. Text-to-video only; image-to-video is not implemented. Outputs are deleted by Replicate after a short time (default one hour for API predictions), so download promptly. Cost and quotas are set by Replicate and your model; check their pricing before use.

Verify the token without spending credits: `curl http://127.0.0.1:8787/api/providers/video/check`.

### Images: OpenAI-compatible
`IMAGE_API_URL` (base URL; `/images/generations` is appended), `IMAGE_MODEL`, optional `IMAGE_API_KEY`. Any service that implements the OpenAI Images API format works; others will fail with a clear "not compatible" error. In the app's Media tab you can choose **direct** (key stored in your browser's localStorage, unencrypted) or **via server** (key stays in `.env`).

## API routes (frontend ↔ backend)
| Route | Request | Response |
|---|---|---|
| `GET /api/health` | none | `{image,video,videoCancel,providers:{image:{provider,configured},video:{provider,configured,errors[]}}}` |
| `GET /api/providers/video/check` | none | `{ok,account}` or `{error}` |
| `POST /api/images` | `{prompt,size?}` | `{data:[{b64_json}|{url}]}` |
| `POST /api/video/jobs` | `{prompt}` | `{id,status:"queued"}` |
| `GET /api/video/jobs/{id}` | none | `{status:"queued"|"running"}` / `{status:"succeeded",url}` / `{status:"failed",error}` / `{status:"canceled"}` |
| `GET /api/video/jobs/{id}/file` | optional `Range` | the video bytes |
| `DELETE /api/video/jobs/{id}` | none | `{status:"canceled"}` |

Errors are `{error:"..."}` with: 400 bad input, 403 foreign Origin, 413/415 body problems, 429 provider quota, 502 provider error, 503 provider not configured, 504 provider timeout.

## Security notes
- Keys live only in server environment variables. Replies never contain them (redacted from provider error text too).
- Provider URLs are fixed in code/env; the client cannot choose where the server connects (no SSRF). Video downloads are restricted to `replicate.delivery`.
- The server binds to `127.0.0.1`, rejects foreign `Origin` headers and non-JSON POSTs, limits bodies to 100 KB and times out upstream calls. It has **no user authentication**: do not expose it to a network or the internet without putting auth in front (reverse proxy), or anyone who can reach it can spend your provider credits.
- Chat settings (server URL/key) still live in the browser's localStorage, unencrypted. Prompts you send to image/video providers go to those providers under their terms.
- `REPLICATE_API_BASE` and `REPLICATE_OUTPUT_HOST_ALLOWLIST` exist for tests/self-hosted gateways only. Leave them unset.

## Testing: what is and is not verified
Automated (`npm test`): 47 backend + 16 frontend-logic checks against **mock** providers. They verify our request construction, status mapping, error handling, timeouts, redaction, streaming and route contracts. They do **not** prove that Replicate or any image service accepts the requests.

Not verified here: any real Replicate/image call (no credentials in the build environment), the UI in a real browser (no browser available), skills import/export UI, chat history UI, the File System Access folder saving, mobile/RTL layout. Please smoke-test those in Chrome/Edge before relying on them.

## Not implemented
Project file manager with diffs/rename/delete, conversation rename/retry, image-to-video, other video providers, backend code execution, user authentication.
