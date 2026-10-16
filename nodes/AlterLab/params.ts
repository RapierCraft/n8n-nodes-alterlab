/**
 * Pure request-building helpers for the AlterLab node.
 *
 * Everything in this module is free of n8n runtime dependencies so the
 * parameter mapping can be unit-tested directly. Builders throw `ParamError`
 * for user input problems; the node converts these to `NodeOperationError`.
 */

export class ParamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParamError";
  }
}

type Dict = Record<string, unknown>;

/** Parse a JSON-typed node parameter (string or already-parsed value). */
export function parseJsonParam(raw: unknown, label: string): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    throw new ParamError(`Invalid JSON in ${label} field`);
  }
}

/** Parse a JSON parameter that must be an object (not an array / scalar). */
export function parseJsonObjectParam(raw: unknown, label: string): Dict {
  const value = parseJsonParam(raw, label);
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ParamError(`${label} must be a JSON object`);
  }
  return value as Dict;
}

/** Parse a JSON parameter that must be an array. */
export function parseJsonArrayParam(raw: unknown, label: string): unknown[] {
  const value = parseJsonParam(raw, label);
  if (!Array.isArray(value)) {
    throw new ParamError(`${label} must be a JSON array`);
  }
  return value;
}

/** Split a comma-separated list parameter into trimmed, non-empty entries. */
export function splitList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Tri-state option values ("default" | "true" | "false") map to
 * undefined / true / false so that an unset option is omitted from the
 * request and the API keeps its own default behaviour.
 */
export function triState(value: unknown): boolean | undefined {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return undefined;
}

// ── Source attribution (#55) ──────────────────────────────────────────

export const SOURCE_HEADER = "X-AlterLab-Source";

// Kept in sync with package.json "version" (enforced by a unit test).
export const NODE_VERSION = "0.13.0";

export const SOURCE_VALUE = `n8n-node/${NODE_VERSION}`;

// ── Scrape ────────────────────────────────────────────────────────────

export interface ScrapeAdvancedInput {
  renderJs?: boolean;
  renderJsAuto?: boolean;
  includeIframes?: boolean;
  flattenShadowDom?: boolean;
  skipTlsVerification?: string;
  blockImages?: string;
  scrollCount?: number;
  sessionHeaders?: string;
  useOwnProxy?: boolean;
  proxyIntegrationId?: string;
  stickySession?: string;
  stickySessionTtl?: number;
  actions?: string;
}

/**
 * Apply the `advanced.*` parameters added for API parity on top of the
 * options the node already mapped. `render_js` is promoted to "auto" only
 * when the plain render toggle is off (an explicit `true` always wins).
 */
export function applyScrapeAdvancedParity(
  advanced: Dict,
  input: ScrapeAdvancedInput,
): void {
  if (input.renderJsAuto && !input.renderJs) advanced.render_js = "auto";
  if (input.includeIframes) advanced.include_iframes = true;
  if (input.flattenShadowDom) advanced.flatten_shadow_dom = true;

  const skipTls = triState(input.skipTlsVerification);
  if (skipTls !== undefined) advanced.skip_tls_verification = skipTls;

  const blockImages = triState(input.blockImages);
  if (blockImages !== undefined) advanced.block_images = blockImages;

  if (input.scrollCount !== undefined && input.scrollCount !== 3) {
    advanced.scroll_count = input.scrollCount;
  }
  if (input.sessionHeaders) {
    advanced.session_headers = parseJsonObjectParam(
      input.sessionHeaders,
      "Session Headers",
    );
  }
  if (input.useOwnProxy) advanced.use_own_proxy = true;
  if (input.proxyIntegrationId) {
    advanced.proxy_integration_id = input.proxyIntegrationId;
  }
  if (input.stickySession) advanced.sticky_session = input.stickySession;
  if (input.stickySessionTtl) {
    advanced.sticky_session_ttl = input.stickySessionTtl;
  }
  if (input.actions) {
    const actions = parseJsonArrayParam(input.actions, "Browser Actions");
    if (actions.length > 20) {
      throw new ParamError("Browser Actions supports at most 20 actions");
    }
    if (actions.length > 0) advanced.actions = actions;
  }
}

export interface ScrapeExtrasInput {
  contentType?: string;
  headers?: string;
  locationCountry?: string;
  locationLanguage?: string;
  filterContent?: boolean;
  waitFor?: string;
  webhookUrl?: string;
  enableScroll?: string;
  pdfFormat?: string;
  ocrLanguage?: string;
  syncPolicy?: string;
  embeddingsEnabled?: boolean;
  embeddingsModel?: string;
  embeddingsChunkSize?: number;
  embeddingsChunkOverlap?: number;
}

/** Build the `location` object; at least one of country/language is required. */
export function buildLocation(
  country: string | undefined,
  language: string | undefined,
): Dict | undefined {
  const location: Dict = {};
  if (country && country.trim()) location.country = country.trim().toUpperCase();
  if (language && language.trim()) {
    location.language = language.trim().toLowerCase();
  }
  return Object.keys(location).length > 0 ? location : undefined;
}

/** Apply the top-level scrape request fields added for API parity. */
export function applyScrapeExtras(body: Dict, input: ScrapeExtrasInput): void {
  if (input.contentType) body.content_type = input.contentType;
  if (input.headers) {
    const headers = parseJsonObjectParam(input.headers, "Headers");
    if (Object.keys(headers).length > 50) {
      throw new ParamError("Headers supports at most 50 entries");
    }
    if (Object.keys(headers).length > 0) body.headers = headers;
  }

  const location = buildLocation(input.locationCountry, input.locationLanguage);
  if (location) body.location = location;

  if (input.filterContent) body.filter_content = true;
  if (input.waitFor) body.wait_for = input.waitFor;
  if (input.webhookUrl) body.webhook_url = input.webhookUrl;

  const enableScroll = triState(input.enableScroll);
  if (enableScroll !== undefined) body.enable_scroll = enableScroll;

  if (input.pdfFormat && input.pdfFormat !== "markdown") {
    body.pdf_format = input.pdfFormat;
  }
  if (input.ocrLanguage && input.ocrLanguage !== "eng") {
    body.ocr_language = input.ocrLanguage;
  }
  if (input.syncPolicy && input.syncPolicy !== "auto") {
    body.sync_policy = input.syncPolicy;
  }

  if (input.embeddingsEnabled) {
    const embeddings: Dict = { enabled: true };
    if (input.embeddingsModel) embeddings.model = input.embeddingsModel;
    if (input.embeddingsChunkSize && input.embeddingsChunkSize !== 512) {
      embeddings.chunk_size = input.embeddingsChunkSize;
    }
    if (
      input.embeddingsChunkOverlap !== undefined &&
      input.embeddingsChunkOverlap !== 50
    ) {
      embeddings.chunk_overlap = input.embeddingsChunkOverlap;
    }
    body.embeddings = embeddings;
  }
}

/**
 * Map the response fields added since the node was last synced onto the
 * flattened n8n output. Only fields the API actually returned are added so
 * output for older API versions is unchanged.
 */
export function mapScrapeResponseExtras(
  output: Dict,
  data: Dict,
): void {
  const direct: Array<[string, string]> = [
    ["jobId", "job_id"],
    ["finalUrl", "final_url"],
    ["redirected", "redirected"],
    ["redirectChain", "redirect_chain"],
    ["tierStatusCodes", "tier_status_codes"],
    ["cachedAt", "cached_at"],
    ["expiresAt", "expires_at"],
    ["staleCache", "stale_cache"],
    ["raw", "raw"],
    ["metadata", "metadata"],
    ["responseHeaders", "headers"],
    ["warning", "warning"],
    ["domainWarning", "domain_warning"],
    ["domainDifficulty", "domain_difficulty"],
    ["tierCapWarning", "tier_cap_warning"],
    ["qualityWarning", "quality_warning"],
    ["contentQuality", "content_quality"],
    ["contentTruncated", "content_truncated"],
    ["actionResults", "action_results"],
    ["embeddings", "embeddings"],
    ["extractionResult", "extraction_result"],
    ["capturedCookies", "captured_cookies"],
    ["proxyUsed", "proxy_used"],
    ["contentHash", "content_hash"],
    ["isGated", "is_gated"],
    ["extractionCompleteness", "extraction_completeness"],
    ["extractionNote", "extraction_note"],
    ["note", "note"],
  ];
  for (const [outKey, apiKey] of direct) {
    if (data[apiKey] !== undefined && data[apiKey] !== null) {
      output[outKey] = data[apiKey];
    }
  }
}

/** Extend the flattened billing object with BYOP / BYOS / surcharge fields. */
export function mapBillingExtras(billing: Dict, source: Dict | undefined): void {
  if (!source) return;
  const direct: Array<[string, string]> = [
    ["byopApplied", "byop_applied"],
    ["byopDiscountPercent", "byop_discount_percent"],
    ["byosApplied", "byos_applied"],
    ["byosSessionName", "byos_session_name"],
    ["methodSurchargeApplied", "method_surcharge_applied"],
  ];
  for (const [outKey, apiKey] of direct) {
    if (source[apiKey] !== undefined && source[apiKey] !== null) {
      billing[outKey] = source[apiKey];
    }
  }
}

// ── Crawl ─────────────────────────────────────────────────────────────

export interface CrawlSettingsInput {
  maxPages?: number;
  maxDepth?: number;
  formats?: string[];
  includePatterns?: string;
  excludePatterns?: string;
  sitemap?: string;
  sitemapPath?: string;
  budget?: string;
  priority?: string;
  headers?: string;
  renderJs?: string;
  useProxy?: boolean;
  screenshot?: boolean;
  waitFor?: string;
  maxConcurrency?: number;
  delay?: number;
  timeout?: number;
  depthStrategy?: string;
  extractionAuto?: boolean;
  extractionSchema?: string;
  extractionProfile?: string;
  extractionTemplate?: string;
  extractionModel?: string;
  extractionProvider?: string;
  respectRobots?: boolean;
  includeSubdomains?: boolean;
  changeTracking?: string;
  webhookUrl?: string;
  webhook?: string;
  maxCredits?: number;
  maxTier?: string;
  forceTier?: string;
  output?: string;
  storage?: string;
  cache?: boolean;
  cacheTtl?: number;
  forceRefresh?: boolean;
}

/**
 * Build the POST /api/v1/crawl body.
 *
 * `max_concurrency` is sent at the TOP LEVEL. The API resolves it as
 * top-level > advanced.max_concurrency, but its top-level field is the
 * documented one (le=50); earlier node versions nested it under `advanced`.
 */
export function buildCrawlBody(url: string, s: CrawlSettingsInput): Dict {
  const body: Dict = { url };

  if (s.maxPages && s.maxPages !== 50) body.max_pages = s.maxPages;
  if (s.maxDepth !== undefined && s.maxDepth !== 3) body.max_depth = s.maxDepth;
  if (s.formats?.length) body.formats = s.formats;
  const include = splitList(s.includePatterns);
  if (include.length) body.include_patterns = include;
  const exclude = splitList(s.excludePatterns);
  if (exclude.length) body.exclude_patterns = exclude;
  if (s.sitemap && s.sitemap !== "include") body.sitemap = s.sitemap;
  if (s.sitemapPath) body.sitemap_path = s.sitemapPath;
  if (s.budget) body.budget = parseJsonObjectParam(s.budget, "Budget");
  if (s.priority) body.priority = parseJsonObjectParam(s.priority, "Priority");
  if (s.maxConcurrency && s.maxConcurrency !== 10) {
    body.max_concurrency = s.maxConcurrency;
  }
  if (s.headers) body.headers = parseJsonObjectParam(s.headers, "Headers");

  if (s.extractionAuto) body.extraction = "auto";
  if (s.extractionSchema) {
    body.extraction_schema = parseJsonParam(
      s.extractionSchema,
      "Extraction Schema",
    );
  }
  if (s.extractionProfile) body.extraction_profile = s.extractionProfile;
  if (s.extractionTemplate) body.extraction_template = s.extractionTemplate;
  if (s.extractionModel) body.extraction_model = s.extractionModel;
  if (s.extractionProvider) body.extraction_provider = s.extractionProvider;

  if (body.extraction === "auto" && body.extraction_schema !== undefined) {
    throw new ParamError(
      "Auto Extraction and Extraction Schema are mutually exclusive",
    );
  }
  if (body.extraction_profile && body.extraction_template) {
    throw new ParamError(
      "Extraction Profile and Extraction Template are mutually exclusive",
    );
  }

  if (s.respectRobots === false) body.respect_robots = false;
  if (s.includeSubdomains) body.include_subdomains = true;
  if (s.changeTracking) {
    body.change_tracking = parseJsonObjectParam(
      s.changeTracking,
      "Change Tracking",
    );
  }
  if (s.webhookUrl) body.webhook_url = s.webhookUrl;
  if (s.webhook) body.webhook = parseJsonObjectParam(s.webhook, "Webhook");
  if (s.output) body.output = parseJsonObjectParam(s.output, "Output");
  if (s.storage && s.storage !== "redis") body.storage = s.storage;
  if (s.cache) {
    body.cache = true;
    if (s.cacheTtl && s.cacheTtl !== 3600) body.cache_ttl = s.cacheTtl;
  }
  if (s.forceRefresh) body.force_refresh = true;

  const advanced: Dict = {};
  if (s.renderJs && s.renderJs !== "false") {
    advanced.render_js = s.renderJs === "auto" ? "auto" : true;
  }
  if (s.useProxy) advanced.use_proxy = true;
  if (s.screenshot) advanced.screenshot = true;
  if (s.waitFor) advanced.wait_for = s.waitFor;
  if (s.delay && s.delay > 0) advanced.delay = s.delay;
  if (s.timeout && s.timeout !== 90) advanced.timeout = s.timeout;
  if (s.depthStrategy && s.depthStrategy !== "sequential") {
    advanced.depth_strategy = s.depthStrategy;
  }
  if (Object.keys(advanced).length > 0) body.advanced = advanced;

  const costControls: Dict = {};
  if (s.maxCredits && s.maxCredits > 0) costControls.max_credits = s.maxCredits;
  if (s.maxTier) costControls.max_tier = s.maxTier;
  if (s.forceTier) costControls.force_tier = s.forceTier;
  if (Object.keys(costControls).length > 0) body.cost_controls = costControls;

  return body;
}

export interface CrawlResumeInput {
  retryFailed?: boolean;
  retryCancelled?: boolean;
  additionalUrls?: string;
}

/** Build the POST /api/v1/crawl/{id}/resume body. */
export function buildCrawlResumeBody(input: CrawlResumeInput): Dict {
  const body: Dict = {};
  const retryFailed = input.retryFailed !== false;
  if (!retryFailed) body.retry_failed = false;

  const statuses: string[] = [];
  if (retryFailed) statuses.push("failed");
  if (input.retryCancelled) statuses.push("cancelled");
  // Only send retry_statuses when it differs from the API default (["failed"]).
  if (input.retryCancelled || !retryFailed) body.retry_statuses = statuses;

  const urls = splitList(input.additionalUrls);
  if (urls.length) body.additional_urls = urls;
  return body;
}

export type ExportFormat = "json" | "jsonl" | "csv";

/** Query string for GET /api/v1/crawl/{id}/export. */
export function buildCrawlExportQuery(opts: {
  format?: string;
  status?: string;
  fields?: string;
}): Record<string, string> {
  const qs: Record<string, string> = { format: opts.format || "json" };
  if (opts.status) qs.status = opts.status;
  const fields = splitList(opts.fields);
  if (fields.length) qs.fields = fields.join(",");
  return qs;
}

/** Parse RFC 4180 CSV text into row objects keyed by the header row. */
export function parseCsv(text: string): Dict[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  if (rows.length === 0) return [];

  const [header, ...data] = rows;
  return data.map((cells) => {
    const obj: Dict = {};
    header.forEach((name, idx) => {
      obj[name] = cells[idx] ?? "";
    });
    return obj;
  });
}

/**
 * Parse an export download (json array, jsonl, or csv text) into row
 * objects. Already-parsed bodies (arrays/objects from the HTTP layer) are
 * accepted as well.
 */
export function parseCrawlExport(body: unknown, format: string): Dict[] {
  if (Array.isArray(body)) return body as Dict[];
  if (body && typeof body === "object" && !Buffer.isBuffer(body)) {
    return [body as Dict];
  }
  const text = Buffer.isBuffer(body) ? body.toString("utf8") : String(body ?? "");
  if (!text.trim()) return [];

  if (format === "csv") return parseCsv(text);
  if (format === "jsonl") {
    return text
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => {
        try {
          return JSON.parse(line) as Dict;
        } catch {
          throw new ParamError("Crawl export returned malformed JSONL");
        }
      });
  }
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? (parsed as Dict[]) : [parsed as Dict];
  } catch {
    throw new ParamError("Crawl export returned malformed JSON");
  }
}

// ── Batch ─────────────────────────────────────────────────────────────

export interface BatchOptionsInput {
  webhookUrl?: string;
  sessionId?: string;
  exportIntegrationId?: string;
  exportPrefix?: string;
  exportFormat?: string;
}

/** Add batch-level fields (webhook, BYOS session, cloud export). */
export function applyBatchOptions(body: Dict, opts: BatchOptionsInput): void {
  if (opts.webhookUrl) body.webhook_url = opts.webhookUrl;
  if (opts.sessionId) body.session_id = opts.sessionId;
  if (opts.exportIntegrationId) {
    const exp: Dict = { integration_id: opts.exportIntegrationId };
    if (opts.exportPrefix) exp.prefix = opts.exportPrefix;
    if (opts.exportFormat && opts.exportFormat !== "jsonl") {
      exp.format = opts.exportFormat;
    }
    body.export = exp;
  }
}
