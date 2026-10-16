# Changelog

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
