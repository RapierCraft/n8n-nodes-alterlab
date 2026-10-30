# Changelog

## 0.14.0

OAuth2 credential rebuilt for n8n 2.x and self-hosted instances (#46, support ticket ALT-80).

### Fixed
- The OAuth2 credential now overrides n8n's real `authUrl` property. It previously set `authorizationUrl`, which n8n ignores, so the inherited **Authorization URL** stayed visible and blank.
- Authorization goes to the browser route `https://alterlab.io/oauth/authorize` (a GET) instead of `https://app.alterlab.io/oauth/authorize` (which redirected to a pathless `http://alterlab.io`) or the POST-only API route (`{"detail":"Method Not Allowed"}`).
- Self-hosted callbacks no longer depend on a static server-side allowlist: the credential registers a public client for each n8n instance (Dynamic Client Registration) and uses PKCE (`grantType: pkce`, S256).
- The OAuth credential test calls `GET /api/v1/auth/identity`, which accepts OAuth bearer tokens.

### Security
- Removed the hardcoded OAuth client ID and client secret that were published in the package. The credential no longer contains any secret. If you connected with 0.12.x/0.13.0, reconnect after upgrading.

### Added
- **Account > Get Balance** operation (`GET /api/v1/billing/balance`): balance in microcents and USD, deposited/spent/granted totals, tier and auto-recharge settings. Works with an API key or OAuth2.
- Manual client registration path (`POST /api/v1/oauth/register`) documented in the README for n8n versions or setups that cannot use dynamic registration.
- `tests/oauth.test.js` (credential properties checked against a snapshot of n8n's inherited `oAuth2Api` fields) and `tests/e2e/oauth-local.e2e.js` (register, authorize with PKCE, token, refresh, revoke and bearer calls against a local AlterLab API).

### Changed
- README lists the API key first; the OAuth2 credential is no longer labelled "Recommended" in the node's credential picker. The API key credential is unchanged.

## 0.13.0

API parity sync against the current AlterLab API.

### Fixed
- Credential **Test** no longer always fails. It now calls `GET /api/v1/auth/identity` (accepts `X-API-Key` or an `sk_` bearer token, spends no credits) instead of the JWT-only `/api/v1/usage` (#326).
- Crawl `max_concurrency` is now sent at the top level of the request; previously it was nested under `advanced` where it could be ignored (#217).
- README no longer claims an `NPM_TOKEN` secret is required; publishing uses npm trusted publishing (OIDC) (#7).

### Added
- `X-AlterLab-Source: n8n-node/<version>` header on every API request, including polling (#55).
- Scrape: `block_images`, tri-state `skip_tls_verification`, `render_js=auto`, `include_iframes`, `flatten_shadow_dom`, `scroll_count`, browser `actions`, `session_headers`, BYOP (`use_own_proxy`, `proxy_integration_id`), sticky sessions, `force_refresh`, `cost_controls.time_budget`, `extraction_template`, `raw` format, content type, custom headers, `location`, `wait_for`, `filter_content`, `enable_scroll`, `pdf_format`, `ocr_language`, `webhook_url`, `sync_policy`, async submit, and inline `embeddings` (#217, #47, #285).
- Scrape output: `jobId`, `finalUrl`, `redirected`, `redirectChain`, `tierStatusCodes`, `cachedAt`, `expiresAt`, `staleCache`, `raw`, `metadata`, `responseHeaders`, warning fields, `contentTruncated`, `actionResults`, `embeddings`, `capturedCookies`, and BYOP / BYOS / method-surcharge billing details.
- Crawl: Resume, Export (JSON / JSONL / CSV parsed into one item per page) and List operations; sitemap path, per-path budget, priority, headers, extraction (auto / schema / profile / template), robots and subdomain controls, change tracking, webhooks, screenshot, wait-for, depth strategy, cost controls, output connectors, storage backend, cache and force refresh (#217, #47, #285).
- Search: `engine` (DuckDuckGo, Google, Bing) and `safe_search`; result scraping supports `json_v2`, `rag` and `content` formats.
- Extract: `content` and `raw` formats.
- Batch: List history operation, BYOS `session_id` and cloud `export` configuration.
