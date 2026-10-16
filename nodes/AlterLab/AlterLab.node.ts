import type {
  IDataObject,
  IExecuteFunctions,
  IHttpRequestOptions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  JsonObject,
} from "n8n-workflow";
import { NodeApiError, NodeOperationError } from "n8n-workflow";
import {
  normalizeBaseUrl,
  resolveApiUrl,
  resolvePollUrl,
} from "./url";
import type {
  CrawlResumeInput,
  CrawlSettingsInput,
  ScrapeAdvancedInput,
  ScrapeExtrasInput,
} from "./params";
import {
  ParamError,
  SOURCE_HEADER,
  SOURCE_VALUE,
  applyBatchOptions,
  applyScrapeAdvancedParity,
  applyScrapeExtras,
  buildCrawlBody,
  buildCrawlExportQuery,
  buildCrawlResumeBody,
  mapBillingExtras,
  mapScrapeResponseExtras,
  parseCrawlExport,
  parseJsonArrayParam,
  parseJsonObjectParam,
  splitList,
  triState,
} from "./params";

const UTM = "utm_source=n8n&utm_medium=integration&utm_campaign=community_node";

export class AlterLab implements INodeType {
  description: INodeTypeDescription = {
    displayName: "AlterLab",
    name: "alterLab",
    icon: "file:alterlab.svg",
    group: ["transform"],
    version: 1,
    subtitle:
      '={{$parameter["resource"] === "session" ? "session " + $parameter["sessionOperation"] : $parameter["resource"] === "crawl" ? "crawl " + $parameter["crawlOperation"] : $parameter["resource"] === "search" ? "search" : $parameter["resource"] === "map" ? "map" : $parameter["resource"] === "extract" ? "extract" : $parameter["resource"] === "batch" ? "batch scrape" : ($parameter["operation"] === "estimateCost" ? "cost estimate" : $parameter["mode"] + " scrape")}}',
    description:
      "Scrape any website with anti-bot bypass, JS rendering, structured extraction, OCR, and more",
    defaults: {
      name: "AlterLab",
    },
    inputs: ["main"],
    outputs: ["main"],
    credentials: [
      {
        name: "alterLabApi",
        displayName: "API Key",
      },
      {
        name: "alterLabOAuth2Api",
        displayName: "OAuth2 (Recommended)",
      },
    ],
    properties: [
      // ── Resource ────────────────────────────────────────
      {
        displayName: "Resource",
        name: "resource",
        type: "options",
        noDataExpression: true,
        default: "scrape",
        options: [
          {
            name: "Batch",
            value: "batch",
            description: "Submit up to 100 URLs for parallel scraping",
          },
          {
            name: "Crawl",
            value: "crawl",
            description: "Discover and scrape entire websites",
          },
          {
            name: "Extract",
            value: "extract",
            description:
              "Run LLM extraction on raw content without fetching a URL",
          },
          {
            name: "Map",
            value: "map",
            description:
              "Discover all URLs on a site via sitemap and link crawling",
          },
          {
            name: "Scrape",
            value: "scrape",
            description: "Scrape websites and extract content",
          },
          {
            name: "Search",
            value: "search",
            description: "Perform SERP searches and optionally scrape results",
          },
          {
            name: "Session",
            value: "session",
            description:
              "Manage stored browser sessions for authenticated scraping",
          },
        ],
        description: "The resource to operate on",
      },

      // ══════════════════════════════════════════════════════
      //  SCRAPE RESOURCE
      // ══════════════════════════════════════════════════════

      // ── Scrape Operation ────────────────────────────────
      {
        displayName: "Operation",
        name: "operation",
        type: "options",
        noDataExpression: true,
        default: "scrape",
        displayOptions: {
          show: {
            resource: ["scrape"],
          },
        },
        options: [
          {
            name: "Scrape",
            value: "scrape",
            description: "Scrape a URL and return its content",
            action: "Scrape a URL",
          },
          {
            name: "Estimate Cost",
            value: "estimateCost",
            description:
              "Estimate the cost of scraping a URL without actually scraping it",
            action: "Estimate scraping cost",
          },
        ],
        description: "The operation to perform",
      },

      // ── Primary ──────────────────────────────────────────
      {
        displayName: "URL",
        name: "url",
        type: "string",
        default: "",
        required: true,
        placeholder: "https://www.example.com/page",
        description: "The URL to scrape",
        displayOptions: {
          show: {
            resource: ["scrape"],
          },
        },
      },
      {
        displayName: "Mode",
        name: "mode",
        type: "options",
        default: "auto",
        options: [
          {
            name: "Auto",
            value: "auto",
            description: "Automatically choose the best scraping method",
          },
          {
            name: "HTML",
            value: "html",
            description: "Fast HTTP-only scraping for static pages",
          },
          {
            name: "JavaScript",
            value: "js",
            description: "Render JavaScript with headless browser",
          },
          {
            name: "PDF",
            value: "pdf",
            description: "Extract text from PDF documents",
          },
          {
            name: "OCR",
            value: "ocr",
            description: "Extract text from images",
          },
        ],
        description: "Scraping mode to use",
        displayOptions: {
          show: {
            resource: ["scrape"],
          },
        },
      },

      // ── HTTP Method ──────────────────────────────────────
      {
        displayName: "HTTP Method",
        name: "httpMethod",
        type: "options",
        default: "GET",
        displayOptions: {
          show: {
            resource: ["scrape"],
          },
        },
        options: [
          {
            name: "GET",
            value: "GET",
            description: "Standard page scraping (default)",
          },
          {
            name: "POST",
            value: "POST",
            description:
              "Form submissions, REST APIs, GraphQL. POST costs 1.5× the base tier price.",
          },
        ],
        description:
          "HTTP method for the target URL request. The AlterLab API supports GET and POST only.",
      },

      // ── Request Body ─────────────────────────────────────
      {
        displayName: "Request Body",
        name: "requestBody",
        type: "string",
        typeOptions: { rows: 4 },
        default: "",
        placeholder: '{"query": "{ user { id name } }"}',
        displayOptions: {
          show: {
            resource: ["scrape"],
            httpMethod: ["POST"],
          },
        },
        description:
          "Request body as a string. For GraphQL: JSON with query + variables. For REST: JSON payload. For forms: URL-encoded string.",
      },

      // ── Output Options ───────────────────────────────────
      {
        displayName: "Output Options",
        name: "outputOptions",
        type: "collection",
        placeholder: "Add Option",
        default: {},
        displayOptions: {
          show: {
            resource: ["scrape"],
            operation: ["scrape"],
          },
        },
        options: [
          {
            displayName: "Formats",
            name: "formats",
            type: "multiOptions",
            default: ["markdown", "json"],
            options: [
              { name: "Content (AI/KB)", value: "content" },
              { name: "HTML", value: "html" },
              { name: "JSON", value: "json" },
              { name: "JSON V2 (Section Tree)", value: "json_v2" },
              { name: "Markdown", value: "markdown" },
              { name: "RAG (Chunked)", value: "rag" },
              { name: "Raw (Unmodified Body)", value: "raw" },
              { name: "Text", value: "text" },
            ],
            description:
              "Output formats for content transformation. raw returns the response body byte-for-byte. json_v2 returns a structured section tree. rag returns chunked content for vector ingestion. content returns body_markdown + content_hash for AI/KB pipelines.",
          },
          {
            displayName: "Include Raw HTML",
            name: "includeRawHtml",
            type: "boolean",
            default: false,
            description: "Whether to include the raw HTML in the response",
          },
          {
            displayName: "Timeout (Seconds)",
            name: "timeout",
            type: "number",
            default: 90,
            typeOptions: { minValue: 1, maxValue: 300 },
            description: "Request timeout in seconds (1-300)",
          },
          {
            displayName: "Max Response Bytes",
            name: "maxResponseBytes",
            type: "number",
            default: 5242880,
            typeOptions: { minValue: 0, maxValue: 52428800 },
            description:
              "Soft cap on raw response body size in bytes. HTML exceeding this limit is truncated before extraction. Default: 5 MB (5242880). Set to 0 for no limit. Maximum: 50 MB (52428800).",
          },
        ],
      },

      // ── Execution Mode ───────────────────────────────────
      {
        displayName: "Execution Mode",
        name: "executionMode",
        type: "collection",
        placeholder: "Add Option",
        default: {},
        displayOptions: {
          show: {
            resource: ["scrape"],
            operation: ["scrape"],
          },
        },
        options: [
          {
            displayName: "Cache",
            name: "cache",
            type: "boolean",
            default: false,
            description: "Whether to enable response caching",
          },
          {
            displayName: "Force Refresh",
            name: "forceRefresh",
            type: "boolean",
            default: false,
            description:
              "Whether to bypass the cache and fetch fresh content even when Cache is enabled",
          },
          {
            displayName: "Cache TTL (Seconds)",
            name: "cacheTtl",
            type: "number",
            default: 3600,
            typeOptions: { minValue: 60, maxValue: 86400 },
            description: "Cache time-to-live in seconds (60-86400)",
            displayOptions: {
              show: {
                cache: [true],
              },
            },
          },
        ],
      },

      // ── Advanced Options ─────────────────────────────────
      {
        displayName: "Advanced Options",
        name: "advancedOptions",
        type: "collection",
        placeholder: "Add Option",
        default: {},
        displayOptions: {
          show: {
            resource: ["scrape"],
          },
        },
        options: [
          {
            displayName: "Render JavaScript",
            name: "renderJs",
            type: "boolean",
            default: false,
            description:
              "Whether to render JavaScript with a headless browser (forces Tier 4 minimum — no separate add-on charge)",
          },
          {
            displayName: "Auto-Detect JavaScript",
            name: "renderJsAuto",
            type: "boolean",
            default: false,
            description:
              "Whether to probe each page and only render JavaScript-heavy pages with a browser (render_js=auto). Ignored when Render JavaScript is enabled. Saves cost on mixed sites",
          },
          {
            displayName: "Block Images",
            name: "blockImages",
            type: "options",
            default: "default",
            options: [
              {
                name: "Default (Per-Domain Playbook)",
                value: "default",
              },
              { name: "Block Images", value: "true" },
              { name: "Download Images", value: "false" },
            ],
            description:
              "Skip image downloads during browser rendering to reduce proxy bandwidth. Screenshots and PDFs always download images",
          },
          {
            displayName: "Skip TLS Verification",
            name: "skipTlsVerification",
            type: "options",
            default: "default",
            options: [
              {
                name: "Default (Verify, Fall Back If Site Certificate Is Invalid)",
                value: "default",
              },
              { name: "Skip Verification", value: "true" },
              { name: "Always Require Valid Certificate", value: "false" },
            ],
            description:
              "How to treat the target site's TLS certificate. Default verifies and retries without verification when the site's own certificate is invalid",
          },
          {
            displayName: "Include Iframes",
            name: "includeIframes",
            type: "boolean",
            default: false,
            description:
              "Whether to inline iframe content into the main document (requires Render JavaScript)",
          },
          {
            displayName: "Flatten Shadow DOM",
            name: "flattenShadowDom",
            type: "boolean",
            default: false,
            description:
              "Whether to flatten Shadow DOM roots so web components are visible to extraction (requires Render JavaScript)",
          },
          {
            displayName: "Scroll Count",
            name: "scrollCount",
            type: "number",
            default: 3,
            typeOptions: { minValue: 1, maxValue: 10 },
            description: "Number of scroll iterations when Scroll To Load is enabled (1-10)",
          },
          {
            displayName: "Browser Actions (JSON)",
            name: "actions",
            type: "json",
            default: "",
            placeholder:
              '[{"type": "click", "selector": "#load-more"}, {"type": "wait", "milliseconds": 1000}]',
            description:
              "Array (max 20) of browser automation steps run after page load; requires Render JavaScript. Types: wait, wait_for, click, fill, press, scroll, infinite_scroll, screenshot, evaluate. Results are returned in actionResults",
          },
          {
            displayName: "Session Headers (JSON)",
            name: "sessionHeaders",
            type: "json",
            default: "",
            placeholder: '{"Authorization": "Bearer ..."}',
            description:
              "Inline authentication headers for one-off authenticated scraping (not stored)",
          },
          {
            displayName: "Use Own Proxy (BYOP)",
            name: "useOwnProxy",
            type: "boolean",
            default: false,
            description:
              "Whether to route through your own integrated proxy instead of AlterLab's system proxy",
          },
          {
            displayName: "Proxy Integration ID",
            name: "proxyIntegrationId",
            type: "string",
            default: "",
            description:
              "Specific proxy integration to use (requires Use Own Proxy)",
          },
          {
            displayName: "Sticky Session",
            name: "stickySession",
            type: "string",
            default: "",
            placeholder: "my-checkout-flow",
            description:
              "Handle (letters, digits, - and _, max 128) that reuses captured cookies and, best-effort, the same exit IP across separate scrapes. Requires a paid plan",
          },
          {
            displayName: "Sticky Session TTL (Seconds)",
            name: "stickySessionTtl",
            type: "number",
            default: 1800,
            typeOptions: { minValue: 300, maxValue: 7200 },
            description: "How long the sticky-session cookie jar is retained (300-7200)",
          },
          {
            displayName: "Screenshot",
            name: "screenshot",
            type: "boolean",
            default: false,
            description:
              "Whether to capture a full-page screenshot (+$0.0002, requires Render JavaScript)",
            displayOptions: {
              show: {
                renderJs: [true],
              },
            },
          },
          {
            displayName: "Generate PDF",
            name: "generatePdf",
            type: "boolean",
            default: false,
            description:
              "Whether to generate a PDF of the rendered page (+$0.0004, requires Render JavaScript)",
            displayOptions: {
              show: {
                renderJs: [true],
              },
            },
          },
          {
            displayName: "Scroll To Load",
            name: "scrollToLoad",
            type: "boolean",
            default: false,
            description:
              "Whether to scroll the page to trigger lazy-loaded content (requires Render JavaScript). Adds ~2-3s latency.",
            displayOptions: {
              show: {
                renderJs: [true],
              },
            },
          },
          {
            displayName: "OCR",
            name: "ocr",
            type: "boolean",
            default: false,
            description:
              "Whether to extract text from images using OCR (+$0.001, refunded if no images found)",
          },
          {
            displayName: "Use Proxy",
            name: "useProxy",
            type: "boolean",
            default: false,
            description: "Whether to route through a premium proxy (+$0.0002)",
          },
          {
            displayName: "Use System Proxy",
            name: "useSystemProxy",
            type: "boolean",
            default: false,
            description:
              "Whether to override your default BYOP (Bring Your Own Proxy) integration and use AlterLab's system proxy for this request instead",
          },
          {
            displayName: "Proxy Country",
            name: "proxyCountry",
            type: "string",
            default: "",
            placeholder: "US",
            description:
              "Preferred proxy country code for geo-targeting (e.g. US, DE, GB)",
            displayOptions: {
              show: {
                useProxy: [true],
              },
            },
          },
          {
            displayName: "Wait Condition",
            name: "waitCondition",
            type: "options",
            default: "networkidle",
            options: [
              {
                name: "Network Idle",
                value: "networkidle",
                description: "Wait until network is idle",
              },
              {
                name: "DOM Content Loaded",
                value: "domcontentloaded",
                description: "Wait until DOM content is loaded",
              },
              {
                name: "Load",
                value: "load",
                description: "Wait until page load event",
              },
            ],
            description: "When to consider the page ready (JS rendering only)",
            displayOptions: {
              show: {
                renderJs: [true],
              },
            },
          },
          {
            displayName: "Remove Cookie Banners",
            name: "removeCookieBanners",
            type: "boolean",
            default: true,
            description:
              "Whether to remove cookie consent banners before content extraction",
          },
          {
            displayName: "Cookies (JSON)",
            name: "cookies",
            type: "json",
            default: "",
            placeholder: '{"session-id": "abc123", "token": "xyz"}',
            description:
              "Inline cookies for one-off authenticated scraping as a JSON object (mutually exclusive with Session ID)",
          },
          {
            displayName: "Section Filter (JSON)",
            name: "sectionFilter",
            type: "json",
            default: "",
            placeholder:
              '{"min_content_blocks": 1, "content_only": false, "exclude_content_types": ["image"]}',
            description:
              "Filter options for json_v2 section tree output. Only applies when json_v2 is in formats. Keys: min_content_blocks (int), content_only (bool), exclude_content_types (array of: paragraph, list, table, image, code, blockquote, dl, details).",
          },
          {
            displayName: "Session ID",
            name: "sessionId",
            type: "string",
            default: "",
            placeholder: "e.g. a1b2c3d4-e5f6-...",
            description:
              "Use a stored session for authenticated scraping (UUID from Sessions resource)",
          },
        ],
      },

      // ── Extraction ───────────────────────────────────────
      {
        displayName: "Extraction",
        name: "extraction",
        type: "collection",
        placeholder: "Add Option",
        default: {},
        displayOptions: {
          show: {
            resource: ["scrape"],
            operation: ["scrape"],
          },
        },
        options: [
          {
            displayName: "Extraction Profile",
            name: "extractionProfile",
            type: "options",
            default: "auto",
            options: [
              { name: "Auto", value: "auto" },
              { name: "Product", value: "product" },
              { name: "Article", value: "article" },
              { name: "Job Posting", value: "job_posting" },
              { name: "FAQ", value: "faq" },
              { name: "Recipe", value: "recipe" },
              { name: "Event", value: "event" },
              { name: "Ecommerce Homepage", value: "ecommerce_homepage" },
              { name: "Directory Listing", value: "directory_listing" },
            ],
            description: "Pre-defined extraction profile for structured data",
          },
          {
            displayName: "Extraction Template",
            name: "extractionTemplate",
            type: "options",
            default: "",
            options: [
              { name: "None", value: "" },
              { name: "Auto", value: "auto" },
              { name: "Article", value: "article" },
              { name: "Directory Listing", value: "directory_listing" },
              { name: "Ecommerce Homepage", value: "ecommerce_homepage" },
              { name: "Event", value: "event" },
              { name: "FAQ", value: "faq" },
              { name: "Job Posting", value: "job_posting" },
              { name: "Product", value: "product" },
              { name: "Recipe", value: "recipe" },
            ],
            description:
              "Shorthand for Extraction Profile. Mutually exclusive with a non-Auto Extraction Profile",
          },
          {
            displayName: "Extraction Prompt",
            name: "extractionPrompt",
            type: "string",
            typeOptions: { rows: 4 },
            default: "",
            placeholder: "Extract the product name, price, and rating...",
            description:
              "Natural language instructions for what data to extract",
          },
          {
            displayName: "Extraction Schema (JSON)",
            name: "extractionSchema",
            type: "json",
            default: "",
            placeholder: '{"name": "string", "price": "number"}',
            description: "JSON Schema to filter and structure extracted data",
          },
          {
            displayName: "Extraction Model",
            name: "extractionModel",
            type: "string",
            default: "",
            placeholder: "gpt-4o",
            description:
              "LLM model override for this request in provider-specific format (e.g. gpt-4o, claude-opus-4-5-20251101, llama3-70b-8192). Overrides the model configured on your BYOK key for this request only.",
          },
          {
            displayName: "Extraction Provider",
            name: "extractionProvider",
            type: "options",
            default: "",
            options: [
              { name: "Auto (use most recent BYOK key)", value: "" },
              { name: "OpenAI", value: "openai" },
              { name: "Anthropic", value: "anthropic" },
              { name: "OpenRouter", value: "openrouter" },
              { name: "Groq", value: "groq" },
            ],
            description:
              "LLM provider to use for extraction. Selects the matching BYOK key registered at your AlterLab dashboard. When omitted, the most recently used registered key is used automatically.",
          },
          {
            displayName: "Promote Schema.org",
            name: "promoteSchemaOrg",
            type: "boolean",
            default: true,
            description:
              "Whether to use Schema.org structured data as primary output when available",
          },
          {
            displayName: "Evidence",
            name: "evidence",
            type: "boolean",
            default: false,
            description:
              "Whether to include provenance/evidence for extracted fields",
          },
        ],
      },

      // ── Cost Controls ────────────────────────────────────
      {
        displayName: "Cost Controls",
        name: "costControls",
        type: "collection",
        placeholder: "Add Option",
        default: {},
        displayOptions: {
          show: {
            resource: ["scrape"],
          },
        },
        options: [
          {
            displayName: "Max Spend",
            name: "maxCredits",
            type: "number",
            default: 0,
            typeOptions: { minValue: 0 },
            description:
              "Maximum to spend per request in microcents (0 = no limit)",
          },
          {
            displayName: "Force Tier",
            name: "forceTier",
            type: "options",
            default: "",
            options: [
              { name: "None", value: "" },
              { name: "T1 Curl — $0.0002", value: "1" },
              { name: "T2 HTTP — $0.0003", value: "2" },
              { name: "T3 Stealth — $0.002", value: "3" },
              { name: "T3.5 Light JS — $0.0025", value: "3.5" },
              { name: "T4 Browser — $0.004", value: "4" },
            ],
            description: "Force a specific scraping tier (skip escalation)",
          },
          {
            displayName: "Max Tier",
            name: "maxTier",
            type: "options",
            default: "",
            options: [
              { name: "None", value: "" },
              { name: "T1 Curl — $0.0002", value: "1" },
              { name: "T2 HTTP — $0.0003", value: "2" },
              { name: "T3 Stealth — $0.002", value: "3" },
              { name: "T3.5 Light JS — $0.0025", value: "3.5" },
              { name: "T4 Browser — $0.004", value: "4" },
            ],
            description: "Maximum tier to escalate to",
          },
          {
            displayName: "Time Budget (Seconds)",
            name: "timeBudget",
            type: "number",
            default: 0,
            typeOptions: { minValue: 0, maxValue: 300 },
            description:
              "Wall-clock budget for the whole tier-escalation sequence (5-300s, 0 = no limit). Escalation stops when the remaining budget is too small",
          },
          {
            displayName: "Prefer Cost",
            name: "preferCost",
            type: "boolean",
            default: false,
            description:
              "Whether to optimize for lower cost (try cheaper tiers first)",
          },
          {
            displayName: "Prefer Speed",
            name: "preferSpeed",
            type: "boolean",
            default: false,
            description:
              "Whether to optimize for speed (skip to reliable tier)",
          },
          {
            displayName: "Fail Fast",
            name: "failFast",
            type: "boolean",
            default: false,
            description:
              "Whether to return an error instead of escalating to expensive tiers",
          },
        ],
      },

      // ── Additional Request Options ───────────────────────
      {
        displayName: "Additional Options",
        name: "scrapeExtras",
        type: "collection",
        placeholder: "Add Option",
        default: {},
        displayOptions: {
          show: {
            resource: ["scrape"],
            operation: ["scrape"],
          },
        },
        options: [
          {
            displayName: "Content Type",
            name: "contentType",
            type: "options",
            default: "",
            options: [
              { name: "Default", value: "" },
              { name: "application/json", value: "application/json" },
              {
                name: "application/x-www-form-urlencoded",
                value: "application/x-www-form-urlencoded",
              },
              { name: "text/plain", value: "text/plain" },
              { name: "application/graphql", value: "application/graphql" },
            ],
            description: "Content-Type for the POST request body",
          },
          {
            displayName: "Custom Headers (JSON)",
            name: "headers",
            type: "json",
            default: "",
            placeholder: '{"Accept-Language": "de-DE"}',
            description:
              "Headers (max 50) sent to the target URL. Hop-by-hop headers such as Host and Connection are rejected by the API",
          },
          {
            displayName: "Location Country",
            name: "locationCountry",
            type: "string",
            default: "",
            placeholder: "DE",
            description:
              "ISO 3166-1 alpha-2 country to geo-target (proxy exit and locale)",
          },
          {
            displayName: "Location Language",
            name: "locationLanguage",
            type: "string",
            default: "",
            placeholder: "de",
            description:
              "ISO 639-1 language for the Accept-Language header and browser locale",
          },
          {
            displayName: "Wait For (CSS Selector)",
            name: "waitFor",
            type: "string",
            default: "",
            placeholder: "#results",
            description: "CSS selector to wait for before capturing the page",
          },
          {
            displayName: "Filter Content",
            name: "filterContent",
            type: "boolean",
            default: false,
            description:
              "Whether to apply quality filtering to extracted content (default is lossless)",
          },
          {
            displayName: "Enable Scroll",
            name: "enableScroll",
            type: "options",
            default: "default",
            options: [
              { name: "Auto", value: "default" },
              { name: "Always Scroll", value: "true" },
              { name: "Never Scroll", value: "false" },
            ],
            description: "Force scrolling for lazy-loaded images on or off",
          },
          {
            displayName: "PDF Format",
            name: "pdfFormat",
            type: "options",
            default: "markdown",
            options: [
              { name: "Markdown", value: "markdown" },
              { name: "Text", value: "text" },
            ],
            description: "Output format when scraping PDFs",
          },
          {
            displayName: "OCR Language",
            name: "ocrLanguage",
            type: "string",
            default: "eng",
            description: "Tesseract language code for OCR mode",
          },
          {
            displayName: "Webhook URL",
            name: "webhookUrl",
            type: "string",
            default: "",
            placeholder: "https://your-server.com/webhook",
            description:
              "Receive job.completed / job.failed events for this request (HTTPS required)",
          },
          {
            displayName: "Sync Policy",
            name: "syncPolicy",
            type: "options",
            default: "auto",
            options: [
              {
                name: "Auto",
                value: "auto",
                description: "Return early with a job ID for predicted slow T3/T4 jobs",
              },
              {
                name: "Wait Until Deadline",
                value: "wait_until_deadline",
                description:
                  "Keep the connection open until the result or the sync deadline",
              },
            ],
            description: "How long the API holds the request open in synchronous mode",
          },
          {
            displayName: "Submit Async (Return Job ID)",
            name: "asyncSubmit",
            type: "boolean",
            default: false,
            description:
              "Whether to submit with sync=false and return the job ID and poll URL immediately instead of waiting for the result. Pair with a Webhook URL",
          },
          {
            displayName: "Generate Embeddings",
            name: "embeddingsEnabled",
            type: "boolean",
            default: false,
            description:
              "Whether to chunk and embed the scraped text with OpenAI models (+$0.001 per page)",
          },
          {
            displayName: "Embeddings Model",
            name: "embeddingsModel",
            type: "options",
            default: "text-embedding-3-small",
            options: [
              {
                name: "text-embedding-3-small",
                value: "text-embedding-3-small",
              },
              {
                name: "text-embedding-3-large",
                value: "text-embedding-3-large",
              },
            ],
            displayOptions: { show: { embeddingsEnabled: [true] } },
            description: "Embedding model",
          },
          {
            displayName: "Embeddings Chunk Size",
            name: "embeddingsChunkSize",
            type: "number",
            default: 512,
            typeOptions: { minValue: 64, maxValue: 8191 },
            displayOptions: { show: { embeddingsEnabled: [true] } },
            description: "Target chunk size in tokens (64-8191)",
          },
          {
            displayName: "Embeddings Chunk Overlap",
            name: "embeddingsChunkOverlap",
            type: "number",
            default: 50,
            typeOptions: { minValue: 0, maxValue: 2048 },
            displayOptions: { show: { embeddingsEnabled: [true] } },
            description: "Overlap between chunks in tokens (must be less than the chunk size)",
          },
        ],
      },

      // ══════════════════════════════════════════════════════
      //  CRAWL RESOURCE
      // ══════════════════════════════════════════════════════

      {
        displayName: "Operation",
        name: "crawlOperation",
        type: "options",
        noDataExpression: true,
        default: "start",
        displayOptions: {
          show: {
            resource: ["crawl"],
          },
        },
        options: [
          {
            name: "Start Crawl",
            value: "start",
            description:
              "Start a new crawl and wait for it to complete (polling included)",
            action: "Start a crawl",
          },
          {
            name: "Get Status",
            value: "status",
            description: "Get the status and results of a crawl by ID",
            action: "Get crawl status",
          },
          {
            name: "Cancel",
            value: "cancel",
            description: "Cancel a running crawl and refund unused credits",
            action: "Cancel a crawl",
          },
          {
            name: "Resume",
            value: "resume",
            description:
              "Retry failed (and optionally cancelled) pages of a crawl and add extra URLs",
            action: "Resume a crawl",
          },
          {
            name: "Export",
            value: "export",
            description:
              "Export crawl results as JSON, JSONL, or CSV (one n8n item per page)",
            action: "Export crawl results",
          },
          {
            name: "List",
            value: "list",
            description: "List your crawls (active and historical)",
            action: "List crawls",
          },
        ],
        description: "The crawl operation to perform",
      },

      // ── Crawl ID (status / cancel) ──────────────────────
      {
        displayName: "Crawl ID",
        name: "crawlId",
        type: "string",
        default: "",
        required: true,
        placeholder: "e.g. abc123...",
        description: "The crawl ID returned by Start Crawl",
        displayOptions: {
          show: {
            resource: ["crawl"],
            crawlOperation: ["status", "cancel", "resume", "export"],
          },
        },
      },

      // ── Crawl URL (start) ────────────────────────────────
      {
        displayName: "URL",
        name: "crawlUrl",
        type: "string",
        default: "",
        required: true,
        placeholder: "https://www.example.com",
        description: "The start URL for the crawl",
        displayOptions: {
          show: {
            resource: ["crawl"],
            crawlOperation: ["start"],
          },
        },
      },

      // ── Crawl Resume options ─────────────────────────────
      {
        displayName: "Resume Options",
        name: "crawlResumeOptions",
        type: "collection",
        placeholder: "Add Option",
        default: {},
        displayOptions: {
          show: { resource: ["crawl"], crawlOperation: ["resume"] },
        },
        options: [
          {
            displayName: "Retry Failed Pages",
            name: "retryFailed",
            type: "boolean",
            default: true,
            description: "Whether to retry pages that ended in failed status",
          },
          {
            displayName: "Also Retry Cancelled Pages",
            name: "retryCancelled",
            type: "boolean",
            default: false,
            description: "Whether to retry pages that were cancelled",
          },
          {
            displayName: "Additional URLs",
            name: "additionalUrls",
            type: "string",
            default: "",
            placeholder: "https://example.com/a, https://example.com/b",
            description: "Comma-separated extra URLs to add to the crawl (max 1000)",
          },
        ],
      },

      // ── Crawl Export options ─────────────────────────────
      {
        displayName: "Export Options",
        name: "crawlExportOptions",
        type: "collection",
        placeholder: "Add Option",
        default: {},
        displayOptions: {
          show: { resource: ["crawl"], crawlOperation: ["export"] },
        },
        options: [
          {
            displayName: "Format",
            name: "format",
            type: "options",
            default: "json",
            options: [
              { name: "JSON", value: "json" },
              { name: "JSONL (Newline-Delimited)", value: "jsonl" },
              { name: "CSV", value: "csv" },
            ],
            description: "Export file format; the node parses it into one item per page",
          },
          {
            displayName: "Page Status Filter",
            name: "status",
            type: "options",
            default: "succeeded",
            options: [
              { name: "Succeeded", value: "succeeded" },
              { name: "Failed", value: "failed" },
              { name: "Rejected", value: "rejected" },
              { name: "Expired", value: "expired" },
              { name: "Queued", value: "queued" },
              { name: "Processing", value: "processing" },
              { name: "Cancelled", value: "cancelled" },
              { name: "All", value: "all" },
            ],
            description: "Only export pages with this status",
          },
          {
            displayName: "Fields",
            name: "fields",
            type: "string",
            default: "",
            placeholder: "url,status,content",
            description: "Comma-separated fields to include (empty = all)",
          },
        ],
      },

      // ── Crawl List options ───────────────────────────────
      {
        displayName: "List Filters",
        name: "crawlListFilters",
        type: "collection",
        placeholder: "Add Filter",
        default: {},
        displayOptions: {
          show: { resource: ["crawl"], crawlOperation: ["list"] },
        },
        options: [
          {
            displayName: "Limit",
            name: "limit",
            type: "number",
            default: 20,
            typeOptions: { minValue: 1, maxValue: 100 },
            description: "Max crawls to return (1-100)",
          },
          {
            displayName: "Offset",
            name: "offset",
            type: "number",
            default: 0,
            typeOptions: { minValue: 0 },
            description: "Number of crawls to skip",
          },
          {
            displayName: "Status",
            name: "status",
            type: "options",
            default: "",
            options: [
              { name: "Any", value: "" },
              { name: "Discovering", value: "discovering" },
              { name: "Scraping", value: "scraping" },
              { name: "Completed", value: "completed" },
              { name: "Partial", value: "partial" },
              { name: "Failed", value: "failed" },
              { name: "Cancelled", value: "cancelled" },
            ],
            description: "Filter by crawl status",
          },
          {
            displayName: "Domain",
            name: "domain",
            type: "string",
            default: "",
            description: "Filter by domain substring",
          },
        ],
      },

      // ── Crawl Settings ───────────────────────────────────
      {
        displayName: "Crawl Settings",
        name: "crawlSettings",
        type: "collection",
        placeholder: "Add Setting",
        default: {},
        displayOptions: {
          show: {
            resource: ["crawl"],
            crawlOperation: ["start"],
          },
        },
        options: [
          {
            displayName: "Max Pages",
            name: "maxPages",
            type: "number",
            default: 50,
            typeOptions: { minValue: 1, maxValue: 100000 },
            description: "Maximum number of pages to scrape (1-100000)",
          },
          {
            displayName: "Max Depth",
            name: "maxDepth",
            type: "number",
            default: 3,
            typeOptions: { minValue: 0, maxValue: 20 },
            description:
              "Maximum link-following depth from start URL (0 = start page only)",
          },
          {
            displayName: "Formats",
            name: "formats",
            type: "multiOptions",
            default: ["markdown"],
            options: [
              { name: "Content (AI/KB)", value: "content" },
              { name: "HTML", value: "html" },
              { name: "JSON", value: "json" },
              { name: "JSON V2 (Section Tree)", value: "json_v2" },
              { name: "Markdown", value: "markdown" },
              { name: "RAG (Chunked)", value: "rag" },
              { name: "Text", value: "text" },
            ],
            description: "Output formats for each scraped page",
          },
          {
            displayName: "Include Patterns",
            name: "includePatterns",
            type: "string",
            default: "",
            placeholder: "/blog/*,/products/*",
            description:
              "Comma-separated glob patterns — only scrape URLs matching at least one",
          },
          {
            displayName: "Exclude Patterns",
            name: "excludePatterns",
            type: "string",
            default: "",
            placeholder: "/admin/*,/login",
            description:
              "Comma-separated glob patterns — skip URLs matching any",
          },
          {
            displayName: "Sitemap Mode",
            name: "sitemap",
            type: "options",
            default: "include",
            options: [
              {
                name: "Include (Default)",
                value: "include",
                description: "Parse sitemap and follow links",
              },
              {
                name: "Skip",
                value: "skip",
                description: "Skip sitemap, discover via links only",
              },
              {
                name: "Only",
                value: "only",
                description:
                  "Crawl exclusively from sitemap — no link extraction",
              },
            ],
            description: "Sitemap discovery mode",
          },
          {
            displayName: "Render JavaScript",
            name: "renderJs",
            type: "options",
            default: "false",
            options: [
              {
                name: "No",
                value: "false",
                description: "Do not render JavaScript",
              },
              {
                name: "Yes",
                value: "true",
                description: "Always render with headless browser (Tier 4)",
              },
              {
                name: "Auto",
                value: "auto",
                description:
                  "Smart detection per page — saves 30-60% on mixed sites",
              },
            ],
            description: "JavaScript rendering mode for crawled pages",
          },
          {
            displayName: "Use Proxy",
            name: "useProxy",
            type: "boolean",
            default: false,
            description:
              "Whether to route all crawl requests through premium proxy",
          },
          {
            displayName: "Max Concurrency",
            name: "maxConcurrency",
            type: "number",
            default: 10,
            typeOptions: { minValue: 1, maxValue: 50 },
            description: "Maximum concurrent pages to scrape simultaneously",
          },
          {
            displayName: "Delay Between Requests (Seconds)",
            name: "delay",
            type: "number",
            default: 0,
            typeOptions: { minValue: 0, maxValue: 30 },
            description: "Minimum seconds between requests to the same domain",
          },
          {
            displayName: "Timeout Per Page (Seconds)",
            name: "timeout",
            type: "number",
            default: 90,
            typeOptions: { minValue: 1, maxValue: 300 },
            description: "Timeout per page in seconds",
          },
          {
            displayName: "Sitemap Path",
            name: "sitemapPath",
            type: "string",
            default: "",
            placeholder: "/product-sitemap.xml",
            description: "Custom sitemap path (must start with /)",
          },
          {
            displayName: "Per-Path Page Budget (JSON)",
            name: "budget",
            type: "json",
            default: "",
            placeholder: '{"/products/*": 100, "/blog/*": 50, "*": 5}',
            description:
              "Max pages per URL path glob; the longest matching pattern wins and * is the catch-all",
          },
          {
            displayName: "Priority (JSON)",
            name: "priority",
            type: "json",
            default: "",
            placeholder: '{"keywords": ["pricing"], "boost": ["/docs/*"], "demote": ["/tag/*"]}',
            description:
              "Content-aware URL prioritisation: keywords, boost and demote patterns",
          },
          {
            displayName: "Custom Headers (JSON)",
            name: "headers",
            type: "json",
            default: "",
            placeholder: '{"Authorization": "Bearer ..."}',
            description: "Headers (max 50) injected into every page request",
          },
          {
            displayName: "Auto Extraction",
            name: "extractionAuto",
            type: "boolean",
            default: false,
            description:
              "Whether to auto-detect the page type and extract structured data without a schema (extraction=auto). Mutually exclusive with Extraction Schema",
          },
          {
            displayName: "Extraction Schema (JSON)",
            name: "extractionSchema",
            type: "json",
            default: "",
            description: "JSON schema for structured extraction on each page",
          },
          {
            displayName: "Extraction Profile",
            name: "extractionProfile",
            type: "options",
            default: "",
            options: [
              { name: "None", value: "" },
              { name: "Auto", value: "auto" },
              { name: "Article", value: "article" },
              { name: "Directory Listing", value: "directory_listing" },
              { name: "Ecommerce Homepage", value: "ecommerce_homepage" },
              { name: "Event", value: "event" },
              { name: "FAQ", value: "faq" },
              { name: "Job Posting", value: "job_posting" },
              { name: "Product", value: "product" },
              { name: "Recipe", value: "recipe" },
            ],
            description: "Pre-defined extraction profile for each page",
          },
          {
            displayName: "Extraction Template",
            name: "extractionTemplate",
            type: "options",
            default: "",
            options: [
              { name: "None", value: "" },
              { name: "Auto", value: "auto" },
              { name: "Article", value: "article" },
              { name: "Directory Listing", value: "directory_listing" },
              { name: "Ecommerce Homepage", value: "ecommerce_homepage" },
              { name: "Event", value: "event" },
              { name: "FAQ", value: "faq" },
              { name: "Job Posting", value: "job_posting" },
              { name: "Product", value: "product" },
              { name: "Recipe", value: "recipe" },
            ],
            description:
              "Shorthand for Extraction Profile (mutually exclusive with it)",
          },
          {
            displayName: "Respect Robots.txt",
            name: "respectRobots",
            type: "boolean",
            default: true,
            description: "Whether to respect robots.txt rules for the target domain",
          },
          {
            displayName: "Include Subdomains",
            name: "includeSubdomains",
            type: "boolean",
            default: false,
            description: "Whether to follow links to subdomains",
          },
          {
            displayName: "Change Tracking (JSON)",
            name: "changeTracking",
            type: "json",
            default: "",
            placeholder: '{"enabled": true, "tracking_id": "weekly-docs"}',
            description:
              "Detect new, changed, unchanged and removed pages versus the previous crawl with the same tracking_id",
          },
          {
            displayName: "Webhook URL",
            name: "webhookUrl",
            type: "string",
            default: "",
            description: "Notified once when the crawl finishes (legacy; prefer Webhook Config)",
          },
          {
            displayName: "Webhook Config (JSON)",
            name: "webhook",
            type: "json",
            default: "",
            placeholder: '{"url": "https://example.com/hook", "events": ["crawl.completed"], "secret": "..."}',
            description:
              "Real-time event delivery with event filtering, HMAC signing and metadata. Takes precedence over Webhook URL",
          },
          {
            displayName: "Screenshot Every Page",
            name: "screenshot",
            type: "boolean",
            default: false,
            description: "Whether to capture a screenshot of every crawled page",
          },
          {
            displayName: "Wait For (CSS Selector)",
            name: "waitFor",
            type: "string",
            default: "",
            description: "CSS selector to wait for on each page",
          },
          {
            displayName: "Depth Strategy",
            name: "depthStrategy",
            type: "options",
            default: "sequential",
            options: [
              {
                name: "Sequential",
                value: "sequential",
                description: "Finish each depth before starting the next (deterministic)",
              },
              {
                name: "Eager",
                value: "eager",
                description: "Start the next depth as soon as any job finishes (faster)",
              },
            ],
            description: "How crawl depth levels are scheduled",
          },
          {
            displayName: "Max Spend",
            name: "maxCredits",
            type: "number",
            default: 0,
            typeOptions: { minValue: 0 },
            description: "Maximum total credits to spend on the crawl (0 = no limit)",
          },
          {
            displayName: "Max Tier",
            name: "maxTier",
            type: "options",
            default: "",
            options: [
              { name: "None", value: "" },
              { name: "T1 Curl", value: "1" },
              { name: "T2 HTTP", value: "2" },
              { name: "T3 Stealth", value: "3" },
              { name: "T3.5 Light JS", value: "3.5" },
              { name: "T4 Browser", value: "4" },
            ],
            description:
              "Highest tier used for page scrapes (cannot be combined with Render JavaScript = Yes below T4)",
          },
          {
            displayName: "Force Tier",
            name: "forceTier",
            type: "options",
            default: "",
            options: [
              { name: "None", value: "" },
              { name: "T1 Curl", value: "1" },
              { name: "T2 HTTP", value: "2" },
              { name: "T3 Stealth", value: "3" },
              { name: "T3.5 Light JS", value: "3.5" },
              { name: "T4 Browser", value: "4" },
            ],
            description: "Force a specific tier for every page (skips escalation)",
          },
          {
            displayName: "Output Connector (JSON)",
            name: "output",
            type: "json",
            default: "",
            placeholder: '{"type": "s3", "bucket": "my-bucket", "credentials": {...}}',
            description:
              "Deliver results to s3, gcs or a streaming webhook as pages complete (type: s3 | gcs | webhook_stream)",
          },
          {
            displayName: "Storage Backend",
            name: "storage",
            type: "options",
            default: "redis",
            options: [
              { name: "Redis (Inline, 2h)", value: "redis" },
              { name: "S3", value: "s3" },
              { name: "R2", value: "r2" },
            ],
            description:
              "Where results are stored. s3/r2 return a presigned download URL (30-day retention)",
          },
          {
            displayName: "Cache",
            name: "cache",
            type: "boolean",
            default: false,
            description: "Whether per-URL results may be served from cache",
          },
          {
            displayName: "Cache TTL (Seconds)",
            name: "cacheTtl",
            type: "number",
            default: 3600,
            typeOptions: { minValue: 60, maxValue: 86400 },
            displayOptions: { show: { cache: [true] } },
            description: "Cache time-to-live in seconds (60-86400)",
          },
          {
            displayName: "Force Refresh",
            name: "forceRefresh",
            type: "boolean",
            default: false,
            description:
              "Whether to bypass and invalidate cached entries (use with Cache)",
          },
          {
            displayName: "Wait For Poll (Seconds)",
            name: "pollTimeout",
            type: "number",
            default: 300,
            typeOptions: { minValue: 10, maxValue: 3600 },
            description:
              "How long to wait for the crawl to complete before timing out (10-3600s)",
          },
          {
            displayName: "Extraction Model",
            name: "extractionModel",
            type: "string",
            default: "",
            placeholder: "gpt-4o",
            description:
              "LLM model override for each crawled page in provider-specific format (e.g. gpt-4o, claude-opus-4-5-20251101, llama3-70b-8192). Overrides the model configured on your BYOK key.",
          },
          {
            displayName: "Extraction Provider",
            name: "extractionProvider",
            type: "options",
            default: "",
            options: [
              { name: "Auto (use most recent BYOK key)", value: "" },
              { name: "OpenAI", value: "openai" },
              { name: "Anthropic", value: "anthropic" },
              { name: "OpenRouter", value: "openrouter" },
              { name: "Groq", value: "groq" },
            ],
            description:
              "LLM provider to use for extraction on each crawled page. Selects the matching BYOK key registered at your AlterLab dashboard.",
          },
        ],
      },

      // ══════════════════════════════════════════════════════
      //  SEARCH RESOURCE
      // ══════════════════════════════════════════════════════

      {
        displayName: "Query",
        name: "searchQuery",
        type: "string",
        default: "",
        required: true,
        placeholder: "best web scraping API 2024",
        description: "Search terms (max 500 characters)",
        displayOptions: {
          show: {
            resource: ["search"],
          },
        },
      },

      {
        displayName: "Search Options",
        name: "searchOptions",
        type: "collection",
        placeholder: "Add Option",
        default: {},
        displayOptions: {
          show: {
            resource: ["search"],
          },
        },
        options: [
          {
            displayName: "Engine",
            name: "engine",
            type: "options",
            default: "duckduckgo",
            options: [
              { name: "DuckDuckGo (Fast, Cheapest)", value: "duckduckgo" },
              { name: "Google (Browser Tier)", value: "google" },
              { name: "Bing (Browser Tier)", value: "bing" },
            ],
            description:
              "Search engine. Google and Bing render in a browser and return richer results (featured snippets, People Also Ask) at a higher price",
          },
          {
            displayName: "Safe Search",
            name: "safeSearch",
            type: "boolean",
            default: true,
            description: "Whether to filter adult content from results",
          },
          {
            displayName: "Number of Results",
            name: "numResults",
            type: "number",
            default: 10,
            typeOptions: { minValue: 1, maxValue: 30 },
            description: "Number of results to return (1-30)",
          },
          {
            displayName: "Page",
            name: "page",
            type: "number",
            default: 1,
            typeOptions: { minValue: 1, maxValue: 10 },
            description: "Result page number (1-indexed)",
          },
          {
            displayName: "Country",
            name: "country",
            type: "string",
            default: "",
            placeholder: "US",
            description:
              "ISO 3166-1 alpha-2 country code for geo-targeted results (e.g. US, GB, DE)",
          },
          {
            displayName: "Language",
            name: "language",
            type: "string",
            default: "",
            placeholder: "en",
            description: "Language code for results (e.g. en, fr, de)",
          },
          {
            displayName: "Domain Filter",
            name: "domain",
            type: "string",
            default: "",
            placeholder: "example.com",
            description:
              "Restrict results to a specific domain (applied as site: prefix)",
          },
          {
            displayName: "Time Range",
            name: "timeRange",
            type: "options",
            default: "",
            options: [
              { name: "Any Time", value: "" },
              { name: "Past Hour", value: "hour" },
              { name: "Past Day", value: "day" },
              { name: "Past Week", value: "week" },
              { name: "Past Month", value: "month" },
              { name: "Past Year", value: "year" },
            ],
            description: "Filter results by recency",
          },
          {
            displayName: "Scrape Results",
            name: "scrapeResults",
            type: "boolean",
            default: false,
            description:
              "Whether to scrape each result page and include content in response",
          },
          {
            displayName: "Scrape Formats",
            name: "scrapeFormats",
            type: "multiOptions",
            default: ["markdown"],
            options: [
              { name: "Content (AI/KB)", value: "content" },
              { name: "HTML", value: "html" },
              { name: "JSON", value: "json" },
              { name: "JSON V2 (Section Tree)", value: "json_v2" },
              { name: "Markdown", value: "markdown" },
              { name: "RAG (Chunked)", value: "rag" },
              { name: "Text", value: "text" },
            ],
            description: "Output formats when Scrape Results is enabled",
            displayOptions: {
              show: {
                scrapeResults: [true],
              },
            },
          },
          {
            displayName: "Extraction Schema (JSON)",
            name: "extractionSchema",
            type: "json",
            default: "",
            placeholder: '{"title": "string", "price": "number"}',
            description:
              "JSON schema for structured extraction when Scrape Results is enabled",
            displayOptions: {
              show: {
                scrapeResults: [true],
              },
            },
          },
        ],
      },

      // ══════════════════════════════════════════════════════
      //  MAP RESOURCE
      // ══════════════════════════════════════════════════════

      {
        displayName: "URL",
        name: "mapUrl",
        type: "string",
        default: "",
        required: true,
        placeholder: "https://www.example.com",
        description: "Starting URL for site discovery",
        displayOptions: {
          show: {
            resource: ["map"],
          },
        },
      },

      {
        displayName: "Map Options",
        name: "mapOptions",
        type: "collection",
        placeholder: "Add Option",
        default: {},
        displayOptions: {
          show: {
            resource: ["map"],
          },
        },
        options: [
          {
            displayName: "Max Pages",
            name: "maxPages",
            type: "number",
            default: 500,
            typeOptions: { minValue: 1, maxValue: 50000 },
            description: "Maximum URLs to discover (1-50000)",
          },
          {
            displayName: "Max Depth",
            name: "maxDepth",
            type: "number",
            default: 3,
            typeOptions: { minValue: 0, maxValue: 10 },
            description: "Link-following depth (0 = start page + sitemap only)",
          },
          {
            displayName: "Sitemap Mode",
            name: "sitemap",
            type: "options",
            default: "include",
            options: [
              {
                name: "Include (Default)",
                value: "include",
                description: "Parse sitemaps and follow links",
              },
              {
                name: "Skip",
                value: "skip",
                description: "Ignore sitemaps",
              },
              {
                name: "Only",
                value: "only",
                description: "Return only sitemap URLs without link following",
              },
            ],
            description: "Sitemap discovery mode",
          },
          {
            displayName: "Include Patterns",
            name: "includePatterns",
            type: "string",
            default: "",
            placeholder: "/blog/*,/products/*",
            description:
              "Comma-separated glob patterns — only include URLs matching at least one",
          },
          {
            displayName: "Exclude Patterns",
            name: "excludePatterns",
            type: "string",
            default: "",
            placeholder: "/admin/*,/login",
            description:
              "Comma-separated glob patterns — exclude URLs matching any",
          },
          {
            displayName: "Search Filter",
            name: "search",
            type: "string",
            default: "",
            placeholder: "pricing documentation",
            description: "Query to filter/rank discovered URLs by relevance",
          },
          {
            displayName: "Include Metadata",
            name: "includeMetadata",
            type: "boolean",
            default: false,
            description:
              "Whether to fetch title and meta description for each URL (slower)",
          },
          {
            displayName: "Include Subdomains",
            name: "includeSubdomains",
            type: "boolean",
            default: false,
            description:
              "Whether to include URLs from subdomains of the target domain",
          },
          {
            displayName: "Respect Robots.txt",
            name: "respectRobots",
            type: "boolean",
            default: true,
            description: "Whether to respect robots.txt directives",
          },
          {
            displayName: "Custom Sitemap Path",
            name: "sitemapPath",
            type: "string",
            default: "",
            placeholder: "/custom-sitemap.xml",
            description: "Custom sitemap location (must start with /)",
          },
        ],
      },

      // ══════════════════════════════════════════════════════
      //  EXTRACT RESOURCE
      // ══════════════════════════════════════════════════════

      {
        displayName: "Content",
        name: "extractContent",
        type: "string",
        typeOptions: { rows: 6 },
        default: "",
        required: true,
        placeholder: "<html>...</html> or raw text / markdown",
        description:
          "Raw content to extract from (HTML, text, or markdown — max 500,000 characters)",
        displayOptions: {
          show: {
            resource: ["extract"],
          },
        },
      },

      {
        displayName: "Content Type",
        name: "extractContentType",
        type: "options",
        default: "html",
        displayOptions: {
          show: {
            resource: ["extract"],
          },
        },
        options: [
          { name: "HTML", value: "html" },
          { name: "Markdown", value: "markdown" },
          { name: "Text", value: "text" },
        ],
        description: "Type of the provided content",
      },

      {
        displayName: "Extract Options",
        name: "extractOptions",
        type: "collection",
        placeholder: "Add Option",
        default: {},
        displayOptions: {
          show: {
            resource: ["extract"],
          },
        },
        options: [
          {
            displayName: "Formats",
            name: "formats",
            type: "multiOptions",
            default: ["json"],
            options: [
              { name: "Content (AI/KB)", value: "content" },
              { name: "HTML", value: "html" },
              { name: "JSON", value: "json" },
              { name: "JSON V2 (Section Tree)", value: "json_v2" },
              { name: "Markdown", value: "markdown" },
              { name: "RAG (Chunked)", value: "rag" },
              { name: "Raw (Unmodified Body)", value: "raw" },
              { name: "Text", value: "text" },
            ],
            description: "Output formats for content transformation",
          },
          {
            displayName: "Extraction Schema (JSON)",
            name: "extractionSchema",
            type: "json",
            default: "",
            placeholder: '{"title": "string", "price": "number"}',
            description: "JSON Schema for structured extraction",
          },
          {
            displayName: "Extraction Profile",
            name: "extractionProfile",
            type: "options",
            default: "",
            options: [
              { name: "None", value: "" },
              { name: "Auto", value: "auto" },
              { name: "Article", value: "article" },
              { name: "Directory Listing", value: "directory_listing" },
              { name: "Ecommerce Homepage", value: "ecommerce_homepage" },
              { name: "Event", value: "event" },
              { name: "FAQ", value: "faq" },
              { name: "Job Posting", value: "job_posting" },
              { name: "Product", value: "product" },
              { name: "Recipe", value: "recipe" },
            ],
            description: "Pre-defined extraction profile (schema template)",
          },
          {
            displayName: "Extraction Template",
            name: "extractionTemplate",
            type: "options",
            default: "",
            options: [
              { name: "None", value: "" },
              { name: "Auto", value: "auto" },
              { name: "Article", value: "article" },
              { name: "Directory Listing", value: "directory_listing" },
              { name: "Ecommerce Homepage", value: "ecommerce_homepage" },
              { name: "Event", value: "event" },
              { name: "FAQ", value: "faq" },
              { name: "Job Posting", value: "job_posting" },
              { name: "Product", value: "product" },
              { name: "Recipe", value: "recipe" },
            ],
            description:
              "Shorthand alias for Extraction Profile. Mutually exclusive with Extraction Profile — use one or the other.",
          },
          {
            displayName: "Extraction Prompt",
            name: "extractionPrompt",
            type: "string",
            typeOptions: { rows: 4 },
            default: "",
            placeholder: "Extract the product name, price, and availability...",
            description: "Natural language extraction instructions for the LLM",
          },
          {
            displayName: "Extraction Model",
            name: "extractionModel",
            type: "string",
            default: "",
            placeholder: "gpt-4o",
            description:
              "LLM model override for this request in provider-specific format (e.g. gpt-4o, claude-opus-4-5-20251101, llama3-70b-8192). Overrides the model configured on your BYOK key for this request only.",
          },
          {
            displayName: "Extraction Provider",
            name: "extractionProvider",
            type: "options",
            default: "",
            options: [
              { name: "Auto (use most recent BYOK key)", value: "" },
              { name: "OpenAI", value: "openai" },
              { name: "Anthropic", value: "anthropic" },
              { name: "OpenRouter", value: "openrouter" },
              { name: "Groq", value: "groq" },
            ],
            description:
              "LLM provider to use for extraction. Selects the matching BYOK key registered at your AlterLab dashboard.",
          },
          {
            displayName: "Source URL",
            name: "sourceUrl",
            type: "string",
            default: "",
            placeholder: "https://www.example.com/page",
            description:
              "Original URL of the content (for context only, not fetched)",
          },
          {
            displayName: "Evidence",
            name: "evidence",
            type: "boolean",
            default: false,
            description:
              "Whether to include provenance/evidence for extracted fields",
          },
          {
            displayName: "Cache Control",
            name: "cache",
            type: "options",
            default: "auto",
            options: [
              {
                name: "Auto (return cached if available)",
                value: "auto",
                description:
                  "Return cached LLM extraction result if available, otherwise call the LLM and cache the result",
              },
              {
                name: "Skip (bypass cache, always call LLM)",
                value: "skip",
                description:
                  "Bypass cache lookup and always invoke the LLM. Result is still stored for future callers.",
              },
              {
                name: "Only (cached result or 404)",
                value: "only",
                description:
                  "Return cached result only. Returns HTTP 404 if the result is not cached — never calls the LLM.",
              },
            ],
            description:
              "Cache control for LLM extraction results. auto: use cache if available (default). skip: always call LLM. only: return cached or 404.",
          },
          {
            displayName: "Cache TTL (Seconds)",
            name: "cacheTtl",
            type: "number",
            default: 3600,
            typeOptions: { minValue: 1, maxValue: 86400 },
            description:
              "How long to cache this extraction result in seconds (1–86400). Defaults to 3600s (1 hour). Max 86400s (24 hours).",
          },
        ],
      },

      // ══════════════════════════════════════════════════════
      //  BATCH RESOURCE
      // ══════════════════════════════════════════════════════

      {
        displayName: "Operation",
        name: "batchOperation",
        type: "options",
        noDataExpression: true,
        default: "submit",
        displayOptions: { show: { resource: ["batch"] } },
        options: [
          {
            name: "Submit",
            value: "submit",
            description: "Submit up to 100 URLs for parallel scraping",
            action: "Submit a batch scrape",
          },
          {
            name: "List",
            value: "list",
            description: "List your batch scrape history",
            action: "List batches",
          },
        ],
        description: "The batch operation to perform",
      },

      {
        displayName: "List Filters",
        name: "batchListFilters",
        type: "collection",
        placeholder: "Add Filter",
        default: {},
        displayOptions: { show: { resource: ["batch"], batchOperation: ["list"] } },
        options: [
          {
            displayName: "Limit",
            name: "limit",
            type: "number",
            default: 20,
            typeOptions: { minValue: 1, maxValue: 50 },
            description: "Max batches to return (1-50)",
          },
          {
            displayName: "Offset",
            name: "offset",
            type: "number",
            default: 0,
            typeOptions: { minValue: 0 },
            description: "Number of batches to skip",
          },
        ],
      },

      {
        displayName: "URLs (JSON Array)",
        name: "batchUrls",
        type: "json",
        default: "[]",
        required: true,
        placeholder:
          '[{"url": "https://example.com"}, {"url": "https://example.org", "mode": "js"}]',
        description:
          'Array of URL objects to scrape in parallel (max 100). Each item: { url, mode?, formats?, advanced?, cost_controls? }. Example: [{"url": "https://example.com", "mode": "auto", "formats": ["markdown"]}]',
        displayOptions: {
          show: {
            resource: ["batch"],
            batchOperation: ["submit"],
          },
        },
      },

      {
        displayName: "Batch Options",
        name: "batchOptions",
        type: "collection",
        placeholder: "Add Option",
        default: {},
        displayOptions: {
          show: {
            resource: ["batch"],
            batchOperation: ["submit"],
          },
        },
        options: [
          {
            displayName: "BYOS Session ID",
            name: "sessionId",
            type: "string",
            default: "",
            description:
              "Stored session applied to every URL in the batch (all URLs must match the session's domain)",
          },
          {
            displayName: "Export Storage Integration ID",
            name: "exportIntegrationId",
            type: "string",
            default: "",
            description:
              "Upload results to this storage integration (UUID) when the batch completes",
          },
          {
            displayName: "Export Key Prefix",
            name: "exportPrefix",
            type: "string",
            default: "",
            description: "Key prefix override for the export (uses the integration default if empty)",
          },
          {
            displayName: "Export Format",
            name: "exportFormat",
            type: "options",
            default: "jsonl",
            options: [
              { name: "JSONL", value: "jsonl" },
              { name: "CSV", value: "csv" },
              { name: "JSON", value: "json" },
            ],
            description: "Export file format",
          },
          {
            displayName: "Webhook URL",
            name: "webhookUrl",
            type: "string",
            default: "",
            placeholder: "https://your-server.com/webhook",
            description:
              "Webhook URL to receive a batch.completed event when all jobs finish",
          },
          {
            displayName: "Wait For Completion",
            name: "waitForCompletion",
            type: "boolean",
            default: true,
            description:
              "Whether to poll until all batch jobs complete before returning results",
          },
          {
            displayName: "Poll Timeout (Seconds)",
            name: "pollTimeout",
            type: "number",
            default: 300,
            typeOptions: { minValue: 10, maxValue: 3600 },
            description:
              "How long to wait for the batch to complete (10-3600s)",
            displayOptions: {
              show: {
                waitForCompletion: [true],
              },
            },
          },
        ],
      },

      // ══════════════════════════════════════════════════════
      //  SESSION RESOURCE
      // ══════════════════════════════════════════════════════

      // ── Session Operation ───────────────────────────────
      {
        displayName: "Operation",
        name: "sessionOperation",
        type: "options",
        noDataExpression: true,
        default: "list",
        displayOptions: {
          show: {
            resource: ["session"],
          },
        },
        options: [
          {
            name: "Create",
            value: "create",
            description: "Create a new stored session",
            action: "Create a session",
          },
          {
            name: "Delete",
            value: "delete",
            description: "Delete a stored session",
            action: "Delete a session",
          },
          {
            name: "Get",
            value: "get",
            description: "Get a stored session by ID",
            action: "Get a session",
          },
          {
            name: "List",
            value: "list",
            description: "List all stored sessions",
            action: "List sessions",
          },
          {
            name: "Refresh",
            value: "refresh",
            description: "Refresh (rotate) cookies for a session",
            action: "Refresh a session",
          },
          {
            name: "Update",
            value: "update",
            description: "Update a stored session",
            action: "Update a session",
          },
          {
            name: "Validate",
            value: "validate",
            description: "Validate whether a session is still active",
            action: "Validate a session",
          },
        ],
        description: "The session operation to perform",
      },

      // ── Session ID (for get/update/delete/validate/refresh) ──
      {
        displayName: "Session ID",
        name: "sessionId",
        type: "string",
        default: "",
        required: true,
        placeholder: "e.g. a1b2c3d4-e5f6-...",
        description: "The UUID of the session",
        displayOptions: {
          show: {
            resource: ["session"],
            sessionOperation: [
              "get",
              "update",
              "delete",
              "validate",
              "refresh",
            ],
          },
        },
      },

      // ── Session Name (create) ────────────────────────────
      {
        displayName: "Name",
        name: "sessionName",
        type: "string",
        default: "",
        required: true,
        placeholder: "e.g. My Amazon Session",
        description: "A label for this session",
        displayOptions: {
          show: {
            resource: ["session"],
            sessionOperation: ["create"],
          },
        },
      },

      // ── Session Domain (create) ──────────────────────────
      {
        displayName: "Domain",
        name: "sessionDomain",
        type: "string",
        default: "",
        required: true,
        placeholder: "e.g. amazon.com",
        description: "Target domain for this session",
        displayOptions: {
          show: {
            resource: ["session"],
            sessionOperation: ["create"],
          },
        },
      },

      // ── Session Cookies (create) ─────────────────────────
      {
        displayName: "Cookies (JSON)",
        name: "sessionCookies",
        type: "json",
        default: "",
        required: true,
        placeholder: '{"session-id": "abc123", "token": "xyz"}',
        description:
          'Cookie name-value pairs as JSON object, e.g. {"session-id": "abc123"}',
        displayOptions: {
          show: {
            resource: ["session"],
            sessionOperation: ["create"],
          },
        },
      },

      // ── Session Additional Fields (create) ───────────────
      {
        displayName: "Additional Fields",
        name: "sessionCreateFields",
        type: "collection",
        placeholder: "Add Field",
        default: {},
        displayOptions: {
          show: {
            resource: ["session"],
            sessionOperation: ["create"],
          },
        },
        options: [
          {
            displayName: "Headers (JSON)",
            name: "headers",
            type: "json",
            default: "",
            placeholder: '{"Authorization": "Bearer ..."}',
            description: "Custom headers as JSON object",
          },
          {
            displayName: "Notes",
            name: "notes",
            type: "string",
            default: "",
            description: "Optional notes about this session",
          },
          {
            displayName: "Expiration",
            name: "expiresAt",
            type: "dateTime",
            default: "",
            description: "When the session should expire",
          },
        ],
      },

      // ── Session Update Fields ────────────────────────────
      {
        displayName: "Update Fields",
        name: "sessionUpdateFields",
        type: "collection",
        placeholder: "Add Field",
        default: {},
        displayOptions: {
          show: {
            resource: ["session"],
            sessionOperation: ["update"],
          },
        },
        options: [
          {
            displayName: "Name",
            name: "name",
            type: "string",
            default: "",
            description: "New name for the session",
          },
          {
            displayName: "Cookies (JSON)",
            name: "cookies",
            type: "json",
            default: "",
            placeholder: '{"session-id": "new-value"}',
            description: "Updated cookie name-value pairs as JSON object",
          },
          {
            displayName: "Headers (JSON)",
            name: "headers",
            type: "json",
            default: "",
            placeholder: '{"Authorization": "Bearer ..."}',
            description: "Updated custom headers as JSON object",
          },
          {
            displayName: "Notes",
            name: "notes",
            type: "string",
            default: "",
            description: "Updated notes",
          },
          {
            displayName: "Expiration",
            name: "expiresAt",
            type: "dateTime",
            default: "",
            description: "Updated expiration date",
          },
        ],
      },

      // ── Session Refresh Fields ───────────────────────────
      {
        displayName: "Cookies (JSON)",
        name: "refreshCookies",
        type: "json",
        default: "",
        placeholder: '{"session-id": "new-value"}',
        description:
          "New cookie name-value pairs to rotate in. If omitted, only headers are refreshed.",
        displayOptions: {
          show: {
            resource: ["session"],
            sessionOperation: ["refresh"],
          },
        },
      },
      {
        displayName: "Headers (JSON)",
        name: "refreshHeaders",
        type: "json",
        default: "",
        placeholder: '{"Authorization": "Bearer ..."}',
        description: "Updated custom headers for this session",
        displayOptions: {
          show: {
            resource: ["session"],
            sessionOperation: ["refresh"],
          },
        },
      },

      // ── Session List Filters ─────────────────────────────
      {
        displayName: "Filters",
        name: "sessionListFilters",
        type: "collection",
        placeholder: "Add Filter",
        default: {},
        displayOptions: {
          show: {
            resource: ["session"],
            sessionOperation: ["list"],
          },
        },
        options: [
          {
            displayName: "Domain",
            name: "domain",
            type: "string",
            default: "",
            placeholder: "e.g. amazon.com",
            description: "Filter sessions by domain",
          },
          {
            displayName: "Status",
            name: "status",
            type: "options",
            default: "",
            options: [
              { name: "All", value: "" },
              { name: "Active", value: "active" },
              { name: "Expired", value: "expired" },
              { name: "Invalid", value: "invalid" },
            ],
            description: "Filter sessions by status",
          },
        ],
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const results: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      try {
        const resource = this.getNodeParameter("resource", i) as string;

        // ── Detect credential type ────────────────────────
        let authName = "alterLabApi";
        let credentials: unknown;
        try {
          credentials = await this.getCredentials("alterLabOAuth2Api");
          authName = "alterLabOAuth2Api";
        } catch {
          // OAuth2 not configured, fall back to API key
          credentials = await this.getCredentials("alterLabApi");
        }

        const apiBaseUrl = normalizeBaseUrl(
          (credentials as { baseUrl?: unknown }).baseUrl,
        );
        const apiUrl = (endpoint: string) => resolveApiUrl(apiBaseUrl, endpoint);

        // Every API request identifies itself as n8n ecosystem traffic (#55).
        const request = (auth: string, options: IHttpRequestOptions) =>
          this.helpers.httpRequestWithAuthentication.call(this, auth, {
            ...options,
            headers: {
              ...(options.headers ?? {}),
              [SOURCE_HEADER]: SOURCE_VALUE,
            },
          });

        // ══════════════════════════════════════════════════
        //  SESSION RESOURCE
        // ══════════════════════════════════════════════════
        if (resource === "session") {
          const sessionOp = this.getNodeParameter(
            "sessionOperation",
            i,
          ) as string;

          if (sessionOp === "create") {
            const name = this.getNodeParameter("sessionName", i) as string;
            const domain = this.getNodeParameter("sessionDomain", i) as string;
            const cookiesRaw = this.getNodeParameter(
              "sessionCookies",
              i,
            ) as string;
            const extra = this.getNodeParameter(
              "sessionCreateFields",
              i,
              {},
            ) as {
              headers?: string;
              notes?: string;
              expiresAt?: string;
            };

            let cookies: Record<string, string>;
            try {
              cookies =
                typeof cookiesRaw === "string"
                  ? JSON.parse(cookiesRaw)
                  : cookiesRaw;
            } catch {
              throw new NodeOperationError(
                this.getNode(),
                "Invalid JSON in Cookies field",
                { itemIndex: i },
              );
            }

            const body: Record<string, unknown> = {
              name,
              domain,
              cookies,
              consent: true,
            };
            if (extra.headers) {
              try {
                body.headers =
                  typeof extra.headers === "string"
                    ? JSON.parse(extra.headers)
                    : extra.headers;
              } catch {
                throw new NodeOperationError(
                  this.getNode(),
                  "Invalid JSON in Headers field",
                  { itemIndex: i },
                );
              }
            }
            if (extra.notes) body.notes = extra.notes;
            if (extra.expiresAt) body.expires_at = extra.expiresAt;

            const response =
              await request(authName, {
                  method: "POST",
                  url: apiUrl("/api/v1/sessions"),
                  body,
                  json: true,
                  returnFullResponse: true,
                  ignoreHttpStatusErrors: true,
                },
              );

            const statusCode = (response as { statusCode: number }).statusCode;
            const responseBody = (response as { body: Record<string, unknown> })
              .body;

            if (statusCode >= 400) {
              handleApiError(this, statusCode, responseBody as JsonObject, i);
            }

            results.push({ json: formatSessionResponse(responseBody) });
            continue;
          }

          if (sessionOp === "list") {
            const filters = this.getNodeParameter(
              "sessionListFilters",
              i,
              {},
            ) as {
              domain?: string;
              status?: string;
            };

            const qs: Record<string, string> = {};
            if (filters.domain) qs.domain = filters.domain;
            if (filters.status) qs.status = filters.status;

            const response =
              await request(authName, {
                  method: "GET",
                  url: apiUrl("/api/v1/sessions"),
                  qs,
                  json: true,
                  returnFullResponse: true,
                  ignoreHttpStatusErrors: true,
                },
              );

            const statusCode = (response as { statusCode: number }).statusCode;
            const responseBody = (response as { body: Record<string, unknown> })
              .body;

            if (statusCode >= 400) {
              handleApiError(this, statusCode, responseBody as JsonObject, i);
            }

            const data = responseBody as {
              sessions: Record<string, unknown>[];
              total: number;
            };

            if (data.sessions?.length) {
              for (const session of data.sessions) {
                results.push({ json: formatSessionResponse(session) });
              }
            } else {
              results.push({
                json: { sessions: [], total: 0 },
              });
            }
            continue;
          }

          if (sessionOp === "get") {
            const sessionId = this.getNodeParameter("sessionId", i) as string;

            const response =
              await request(authName, {
                  method: "GET",
                  url: apiUrl(`/api/v1/sessions/${sessionId}`),
                  json: true,
                  returnFullResponse: true,
                  ignoreHttpStatusErrors: true,
                },
              );

            const statusCode = (response as { statusCode: number }).statusCode;
            const responseBody = (response as { body: Record<string, unknown> })
              .body;

            if (statusCode >= 400) {
              handleApiError(this, statusCode, responseBody as JsonObject, i);
            }

            results.push({ json: formatSessionResponse(responseBody) });
            continue;
          }

          if (sessionOp === "update") {
            const sessionId = this.getNodeParameter("sessionId", i) as string;
            const fields = this.getNodeParameter(
              "sessionUpdateFields",
              i,
              {},
            ) as {
              name?: string;
              cookies?: string;
              headers?: string;
              notes?: string;
              expiresAt?: string;
            };

            const body: Record<string, unknown> = {};
            if (fields.name) body.name = fields.name;
            if (fields.notes) body.notes = fields.notes;
            if (fields.expiresAt) body.expires_at = fields.expiresAt;
            if (fields.cookies) {
              try {
                body.cookies =
                  typeof fields.cookies === "string"
                    ? JSON.parse(fields.cookies)
                    : fields.cookies;
              } catch {
                throw new NodeOperationError(
                  this.getNode(),
                  "Invalid JSON in Cookies field",
                  { itemIndex: i },
                );
              }
            }
            if (fields.headers) {
              try {
                body.headers =
                  typeof fields.headers === "string"
                    ? JSON.parse(fields.headers)
                    : fields.headers;
              } catch {
                throw new NodeOperationError(
                  this.getNode(),
                  "Invalid JSON in Headers field",
                  { itemIndex: i },
                );
              }
            }

            const response =
              await request(authName, {
                  method: "PATCH",
                  url: apiUrl(`/api/v1/sessions/${sessionId}`),
                  body,
                  json: true,
                  returnFullResponse: true,
                  ignoreHttpStatusErrors: true,
                },
              );

            const statusCode = (response as { statusCode: number }).statusCode;
            const responseBody = (response as { body: Record<string, unknown> })
              .body;

            if (statusCode >= 400) {
              handleApiError(this, statusCode, responseBody as JsonObject, i);
            }

            results.push({ json: formatSessionResponse(responseBody) });
            continue;
          }

          if (sessionOp === "delete") {
            const sessionId = this.getNodeParameter("sessionId", i) as string;

            const response =
              await request(authName, {
                  method: "DELETE",
                  url: apiUrl(`/api/v1/sessions/${sessionId}`),
                  json: true,
                  returnFullResponse: true,
                  ignoreHttpStatusErrors: true,
                },
              );

            const statusCode = (response as { statusCode: number }).statusCode;

            if (statusCode >= 400) {
              const responseBody = (
                response as { body: Record<string, unknown> }
              ).body;
              handleApiError(this, statusCode, responseBody as JsonObject, i);
            }

            results.push({
              json: { sessionId, deleted: true },
            });
            continue;
          }

          if (sessionOp === "validate") {
            const sessionId = this.getNodeParameter("sessionId", i) as string;

            const response =
              await request(authName, {
                  method: "POST",
                  url: apiUrl(`/api/v1/sessions/${sessionId}/validate`),
                  json: true,
                  returnFullResponse: true,
                  ignoreHttpStatusErrors: true,
                },
              );

            const statusCode = (response as { statusCode: number }).statusCode;
            const responseBody = (response as { body: Record<string, unknown> })
              .body;

            if (statusCode >= 400) {
              handleApiError(this, statusCode, responseBody as JsonObject, i);
            }

            const data = responseBody as Record<string, unknown>;
            results.push({
              json: {
                sessionId,
                isValid: data.is_valid ?? false,
                confidence: data.confidence ?? 0,
                httpStatus: data.http_status ?? null,
                detectedUser: data.detected_user ?? null,
                cookiesExpiringSoon: data.cookies_expiring_soon ?? false,
                consecutiveFailures: data.consecutive_failures ?? 0,
                details: data.details ?? "",
              },
            });
            continue;
          }

          if (sessionOp === "refresh") {
            const sessionId = this.getNodeParameter("sessionId", i) as string;
            const cookiesRaw = this.getNodeParameter(
              "refreshCookies",
              i,
              "",
            ) as string;
            const headersRaw = this.getNodeParameter(
              "refreshHeaders",
              i,
              "",
            ) as string;

            const body: Record<string, unknown> = {};
            if (cookiesRaw) {
              try {
                body.cookies =
                  typeof cookiesRaw === "string"
                    ? JSON.parse(cookiesRaw)
                    : cookiesRaw;
              } catch {
                throw new NodeOperationError(
                  this.getNode(),
                  "Invalid JSON in Cookies field",
                  { itemIndex: i },
                );
              }
            }
            if (headersRaw) {
              try {
                body.headers =
                  typeof headersRaw === "string"
                    ? JSON.parse(headersRaw)
                    : headersRaw;
              } catch {
                throw new NodeOperationError(
                  this.getNode(),
                  "Invalid JSON in Headers field",
                  { itemIndex: i },
                );
              }
            }

            const response =
              await request(authName, {
                  method: "POST",
                  url: apiUrl(`/api/v1/sessions/${sessionId}/refresh`),
                  body,
                  json: true,
                  returnFullResponse: true,
                  ignoreHttpStatusErrors: true,
                },
              );

            const statusCode = (response as { statusCode: number }).statusCode;
            const responseBody = (response as { body: Record<string, unknown> })
              .body;

            if (statusCode >= 400) {
              handleApiError(this, statusCode, responseBody as JsonObject, i);
            }

            results.push({ json: formatSessionResponse(responseBody) });
            continue;
          }

          throw new NodeOperationError(
            this.getNode(),
            `Unknown session operation: ${sessionOp}`,
            { itemIndex: i },
          );
        }

        // ══════════════════════════════════════════════════
        //  CRAWL RESOURCE
        // ══════════════════════════════════════════════════
        if (resource === "crawl") {
          const crawlOp = this.getNodeParameter("crawlOperation", i) as string;

          if (crawlOp === "status") {
            const crawlId = this.getNodeParameter("crawlId", i) as string;

            const response =
              await request(authName, {
                  method: "GET",
                  url: apiUrl(`/api/v1/crawl/${crawlId}`),
                  json: true,
                  returnFullResponse: true,
                  ignoreHttpStatusErrors: true,
                },
              );

            const statusCode = (response as { statusCode: number }).statusCode;
            const responseBody = (response as { body: Record<string, unknown> })
              .body;

            if (statusCode >= 400) {
              handleApiError(this, statusCode, responseBody as JsonObject, i);
            }

            results.push({ json: responseBody as IDataObject });
            continue;
          }

          if (crawlOp === "cancel") {
            const crawlId = this.getNodeParameter("crawlId", i) as string;

            const response =
              await request(authName, {
                  method: "DELETE",
                  url: apiUrl(`/api/v1/crawl/${crawlId}`),
                  json: true,
                  returnFullResponse: true,
                  ignoreHttpStatusErrors: true,
                },
              );

            const statusCode = (response as { statusCode: number }).statusCode;
            const responseBody = (response as { body: Record<string, unknown> })
              .body;

            if (statusCode >= 400) {
              handleApiError(this, statusCode, responseBody as JsonObject, i);
            }

            results.push({ json: responseBody as IDataObject });
            continue;
          }

          if (crawlOp === "start") {
            const crawlUrl = this.getNodeParameter("crawlUrl", i) as string;
            const settings = this.getNodeParameter(
              "crawlSettings",
              i,
              {},
            ) as CrawlSettingsInput & { pollTimeout?: number };

            const body = buildCrawlBody(crawlUrl, settings);

            // Submit the crawl
            const crawlRequestUrl = apiUrl("/api/v1/crawl");
            const startResponse =
              await request(authName, {
                  method: "POST",
                  url: crawlRequestUrl,
                  body,
                  json: true,
                  returnFullResponse: true,
                  ignoreHttpStatusErrors: true,
                },
              );

            const startStatus = (startResponse as { statusCode: number })
              .statusCode;
            const startBody = (
              startResponse as { body: Record<string, unknown> }
            ).body;

            if (startStatus >= 400) {
              handleApiError(this, startStatus, startBody as JsonObject, i);
            }

            const crawlId = (startBody as Record<string, unknown>)
              .crawl_id as string;

            if (!crawlId) {
              throw new NodeOperationError(
                this.getNode(),
                "No crawl_id returned from API",
                { itemIndex: i },
              );
            }

            // Poll until complete or timeout
            const pollTimeoutMs = (settings.pollTimeout ?? 300) * 1000;
            const pollStart = Date.now();
            let pollDelay = 2000;
            const maxPollDelay = 10000;
            let finalBody: Record<string, unknown> = startBody;
            let crawlPollUrl = resolvePollUrl(
              apiBaseUrl,
              startResponse,
              `/api/v1/crawl/${crawlId}`,
              crawlRequestUrl,
            );

            while (Date.now() - pollStart < pollTimeoutMs) {
              await new Promise<void>((resolve) => {
                setTimeout(resolve, pollDelay);
              });
              pollDelay = Math.min(pollDelay * 1.5, maxPollDelay);

              const pollResponse =
                await request(authName, {
                    method: "GET",
                    url: crawlPollUrl,
                    json: true,
                    returnFullResponse: true,
                    ignoreHttpStatusErrors: true,
                  },
                );

              crawlPollUrl = resolvePollUrl(
                apiBaseUrl,
                pollResponse,
                crawlPollUrl,
                crawlPollUrl,
              );
              const pollStatus = (pollResponse as { statusCode: number })
                .statusCode;
              const pollBody = (
                pollResponse as { body: Record<string, unknown> }
              ).body;

              if (pollStatus >= 400) {
                handleApiError(this, pollStatus, pollBody as JsonObject, i);
              }

              finalBody = pollBody;
              const crawlStatus = (pollBody as Record<string, unknown>)
                .status as string;

              if (
                crawlStatus === "completed" ||
                crawlStatus === "cancelled" ||
                crawlStatus === "failed"
              ) {
                break;
              }
            }

            const finalStatus = (finalBody as Record<string, unknown>)
              .status as string;
            results.push({
              json: {
                ...(finalBody as IDataObject),
                crawlId,
                timedOut: finalStatus !== "completed",
              },
            });
            continue;
          }

          if (crawlOp === "resume") {
            const crawlId = this.getNodeParameter("crawlId", i) as string;
            const opts = this.getNodeParameter(
              "crawlResumeOptions",
              i,
              {},
            ) as CrawlResumeInput;

            const response = await request(authName, {
              method: "POST",
              url: apiUrl(`/api/v1/crawl/${crawlId}/resume`),
              body: buildCrawlResumeBody(opts),
              json: true,
              returnFullResponse: true,
              ignoreHttpStatusErrors: true,
            });

            const statusCode = (response as { statusCode: number }).statusCode;
            const responseBody = (response as { body: Record<string, unknown> })
              .body;

            if (statusCode >= 400) {
              handleApiError(this, statusCode, responseBody as JsonObject, i);
            }

            results.push({ json: { crawlId, ...(responseBody as IDataObject) } });
            continue;
          }

          if (crawlOp === "export") {
            const crawlId = this.getNodeParameter("crawlId", i) as string;
            const opts = this.getNodeParameter("crawlExportOptions", i, {}) as {
              format?: string;
              status?: string;
              fields?: string;
            };
            const qs = buildCrawlExportQuery(opts);

            // The endpoint streams a file (json | jsonl | csv), so fetch it
            // as text and parse it ourselves.
            const response = await request(authName, {
              method: "GET",
              url: apiUrl(`/api/v1/crawl/${crawlId}/export`),
              qs,
              json: false,
              encoding: "text",
              returnFullResponse: true,
              ignoreHttpStatusErrors: true,
            });

            const statusCode = (response as { statusCode: number }).statusCode;
            const rawBody = (response as { body: unknown }).body;

            if (statusCode >= 400) {
              let errBody: JsonObject = {};
              try {
                errBody =
                  typeof rawBody === "string"
                    ? (JSON.parse(rawBody) as JsonObject)
                    : ((rawBody ?? {}) as JsonObject);
              } catch {
                errBody = { detail: String(rawBody ?? "") };
              }
              handleApiError(this, statusCode, errBody, i);
            }

            const rows = parseCrawlExport(rawBody, qs.format);
            if (rows.length === 0) {
              results.push({
                json: {
                  crawlId,
                  format: qs.format,
                  status: qs.status ?? null,
                  count: 0,
                },
              });
            } else {
              for (const row of rows) {
                results.push({ json: row as IDataObject });
              }
            }
            continue;
          }

          if (crawlOp === "list") {
            const filters = this.getNodeParameter("crawlListFilters", i, {}) as {
              limit?: number;
              offset?: number;
              status?: string;
              domain?: string;
            };
            const qs: Record<string, string | number> = {};
            if (filters.limit && filters.limit !== 20) qs.limit = filters.limit;
            if (filters.offset) qs.offset = filters.offset;
            if (filters.status) qs.status = filters.status;
            if (filters.domain) qs.domain = filters.domain;

            const response = await request(authName, {
              method: "GET",
              url: apiUrl("/api/v1/crawl"),
              qs,
              json: true,
              returnFullResponse: true,
              ignoreHttpStatusErrors: true,
            });

            const statusCode = (response as { statusCode: number }).statusCode;
            const responseBody = (response as { body: Record<string, unknown> })
              .body;

            if (statusCode >= 400) {
              handleApiError(this, statusCode, responseBody as JsonObject, i);
            }

            const crawls = (responseBody as { crawls?: IDataObject[] }).crawls;
            if (crawls?.length) {
              for (const crawl of crawls) results.push({ json: crawl });
            } else {
              results.push({
                json: {
                  crawls: [],
                  total: (responseBody as { total?: number }).total ?? 0,
                },
              });
            }
            continue;
          }

          throw new NodeOperationError(
            this.getNode(),
            `Unknown crawl operation: ${crawlOp}`,
            { itemIndex: i },
          );
        }

        // ══════════════════════════════════════════════════
        //  SEARCH RESOURCE
        // ══════════════════════════════════════════════════
        if (resource === "search") {
          const query = this.getNodeParameter("searchQuery", i) as string;
          const opts = this.getNodeParameter("searchOptions", i, {}) as {
            numResults?: number;
            page?: number;
            country?: string;
            language?: string;
            domain?: string;
            timeRange?: string;
            scrapeResults?: boolean;
            scrapeFormats?: string[];
            extractionSchema?: string;
            engine?: string;
            safeSearch?: boolean;
          };

          const body: Record<string, unknown> = { query };
          if (opts.engine && opts.engine !== "duckduckgo") {
            body.engine = opts.engine;
          }
          if (opts.safeSearch === false) body.safe_search = false;
          if (opts.numResults && opts.numResults !== 10)
            body.num_results = opts.numResults;
          if (opts.page && opts.page !== 1) body.page = opts.page;
          if (opts.country) body.country = opts.country.toUpperCase();
          if (opts.language) body.language = opts.language.toLowerCase();
          if (opts.domain) body.domain = opts.domain;
          if (opts.timeRange) body.time_range = opts.timeRange;
          if (opts.scrapeResults) {
            body.scrape_results = true;
            if (opts.scrapeFormats?.length) body.formats = opts.scrapeFormats;
            if (opts.extractionSchema) {
              try {
                body.extraction_schema =
                  typeof opts.extractionSchema === "string"
                    ? JSON.parse(opts.extractionSchema)
                    : opts.extractionSchema;
              } catch {
                throw new NodeOperationError(
                  this.getNode(),
                  "Invalid JSON in Extraction Schema field",
                  { itemIndex: i },
                );
              }
            }
          }

          const searchRequestUrl = apiUrl("/api/v1/search");
          const response =
            await request(authName, {
                method: "POST",
                url: searchRequestUrl,
                body,
                json: true,
                returnFullResponse: true,
                ignoreHttpStatusErrors: true,
              },
            );

          const statusCode = (response as { statusCode: number }).statusCode;
          const responseBody = (response as { body: Record<string, unknown> })
            .body;

          if (statusCode >= 400) {
            handleApiError(this, statusCode, responseBody as JsonObject, i);
          }

          const data = responseBody as Record<string, unknown>;

          // If scrape_results returned async (202 or status=scraping), poll for completion
          if (statusCode === 202 || (data.status as string) === "scraping") {
            const searchId = data.search_id as string;
            if (searchId) {
              let searchPollDelay = 1000;
              const maxSearchPollDelay = 5000;
              const searchPollStart = Date.now();
              const maxSearchPollMs = 120_000; // 2 min max

              let finalData = data;
              let searchPollUrl = resolvePollUrl(
                apiBaseUrl,
                response,
                `/api/v1/search/${searchId}`,
                searchRequestUrl,
              );
              while (Date.now() - searchPollStart < maxSearchPollMs) {
                await new Promise<void>((resolve) => {
                  setTimeout(resolve, searchPollDelay);
                });
                searchPollDelay = Math.min(
                  searchPollDelay * 1.5,
                  maxSearchPollDelay,
                );

                const pollResp =
                  await request(authName, {
                      method: "GET",
                      url: searchPollUrl,
                      json: true,
                      returnFullResponse: true,
                      ignoreHttpStatusErrors: true,
                    },
                  );

                searchPollUrl = resolvePollUrl(
                  apiBaseUrl,
                  pollResp,
                  searchPollUrl,
                  searchPollUrl,
                );

                const pollStatus = (pollResp as { statusCode: number })
                  .statusCode;
                const pollBody = (pollResp as { body: Record<string, unknown> })
                  .body;

                if (pollStatus >= 400) {
                  handleApiError(this, pollStatus, pollBody as JsonObject, i);
                }

                finalData = pollBody as Record<string, unknown>;
                if ((finalData.status as string) === "completed") break;
              }

              results.push({ json: finalData as IDataObject });
              continue;
            }
          }

          results.push({ json: data as IDataObject });
          continue;
        }

        // ══════════════════════════════════════════════════
        //  MAP RESOURCE
        // ══════════════════════════════════════════════════
        if (resource === "map") {
          const mapUrl = this.getNodeParameter("mapUrl", i) as string;
          const opts = this.getNodeParameter("mapOptions", i, {}) as {
            maxPages?: number;
            maxDepth?: number;
            sitemap?: string;
            includePatterns?: string;
            excludePatterns?: string;
            search?: string;
            includeMetadata?: boolean;
            includeSubdomains?: boolean;
            respectRobots?: boolean;
            sitemapPath?: string;
          };

          const body: Record<string, unknown> = { url: mapUrl };
          if (opts.maxPages && opts.maxPages !== 500)
            body.max_pages = opts.maxPages;
          if (opts.maxDepth !== undefined && opts.maxDepth !== 3)
            body.max_depth = opts.maxDepth;
          if (opts.sitemap && opts.sitemap !== "include")
            body.sitemap = opts.sitemap;
          if (opts.includePatterns) {
            body.include_patterns = opts.includePatterns
              .split(",")
              .map((p) => p.trim())
              .filter(Boolean);
          }
          if (opts.excludePatterns) {
            body.exclude_patterns = opts.excludePatterns
              .split(",")
              .map((p) => p.trim())
              .filter(Boolean);
          }
          if (opts.search) body.search = opts.search;
          if (opts.includeMetadata) body.include_metadata = true;
          if (opts.includeSubdomains) body.include_subdomains = true;
          if (opts.respectRobots === false) body.respect_robots = false;
          if (opts.sitemapPath) body.sitemap_path = opts.sitemapPath;

          const response =
            await request(authName, {
                method: "POST",
                url: apiUrl("/api/v1/map"),
                body,
                json: true,
                returnFullResponse: true,
                ignoreHttpStatusErrors: true,
              },
            );

          const statusCode = (response as { statusCode: number }).statusCode;
          const responseBody = (response as { body: Record<string, unknown> })
            .body;

          if (statusCode >= 400) {
            handleApiError(this, statusCode, responseBody as JsonObject, i);
          }

          results.push({ json: responseBody as IDataObject });
          continue;
        }

        // ══════════════════════════════════════════════════
        //  EXTRACT RESOURCE
        // ══════════════════════════════════════════════════
        if (resource === "extract") {
          const content = this.getNodeParameter("extractContent", i) as string;
          const contentType = this.getNodeParameter(
            "extractContentType",
            i,
          ) as string;
          const opts = this.getNodeParameter("extractOptions", i, {}) as {
            formats?: string[];
            extractionSchema?: string;
            extractionProfile?: string;
            extractionTemplate?: string;
            extractionPrompt?: string;
            extractionModel?: string;
            extractionProvider?: string;
            sourceUrl?: string;
            evidence?: boolean;
            cache?: string;
            cacheTtl?: number;
          };

          const body: Record<string, unknown> = {
            content,
            content_type: contentType,
          };

          if (opts.formats?.length) body.formats = opts.formats;
          if (opts.extractionSchema) {
            try {
              body.extraction_schema =
                typeof opts.extractionSchema === "string"
                  ? JSON.parse(opts.extractionSchema)
                  : opts.extractionSchema;
            } catch {
              throw new NodeOperationError(
                this.getNode(),
                "Invalid JSON in Extraction Schema field",
                { itemIndex: i },
              );
            }
          }
          if (opts.extractionProfile)
            body.extraction_profile = opts.extractionProfile;
          if (opts.extractionTemplate)
            body.extraction_template = opts.extractionTemplate;
          if (opts.extractionPrompt)
            body.extraction_prompt = opts.extractionPrompt;
          if (opts.extractionModel)
            body.extraction_model = opts.extractionModel;
          if (opts.extractionProvider)
            body.extraction_provider = opts.extractionProvider;
          if (opts.sourceUrl) body.source_url = opts.sourceUrl;
          if (opts.evidence) body.evidence = true;
          if (opts.cache && opts.cache !== "auto") body.cache = opts.cache;
          if (opts.cacheTtl && opts.cacheTtl !== 3600)
            body.cache_ttl = opts.cacheTtl;

          const response =
            await request(authName, {
                method: "POST",
                url: apiUrl("/api/v1/extract"),
                body,
                json: true,
                returnFullResponse: true,
                ignoreHttpStatusErrors: true,
              },
            );

          const statusCode = (response as { statusCode: number }).statusCode;
          const responseBody = (response as { body: Record<string, unknown> })
            .body;

          if (statusCode >= 400) {
            handleApiError(this, statusCode, responseBody as JsonObject, i);
          }

          const data = responseBody as Record<string, unknown>;
          const formats = data.formats as Record<string, unknown> | undefined;

          const output: IDataObject = {
            extractId: data.extract_id ?? null,
            creditsUsed: data.credits_used ?? 0,
            modelUsed: data.model_used ?? null,
            extractionMethod: data.extraction_method ?? "algorithmic",
            extractionProfile: data.extraction_profile ?? null,
            contentSizeChars: data.content_size_chars ?? 0,
            cacheHit: (data.cache_hit as boolean) ?? false,
          };

          if (
            data.extraction_metadata !== undefined &&
            data.extraction_metadata !== null
          ) {
            output.extractionMetadata = data.extraction_metadata as IDataObject;
          }

          // Flatten format results into top-level keys
          if (formats && typeof formats === "object") {
            if (formats.text !== undefined) output.text = formats.text;
            if (formats.markdown !== undefined)
              output.markdown = formats.markdown;
            if (formats.html !== undefined) output.html = formats.html;
            if (formats.json !== undefined) output.json = formats.json;
            if (formats.json_v2 !== undefined) output.jsonV2 = formats.json_v2;
            if (formats.rag !== undefined) output.rag = formats.rag;
            if (formats.content !== undefined) output.content = formats.content;
            if (formats.raw !== undefined) output.raw = formats.raw;
          }

          results.push({ json: output });
          continue;
        }

        // ══════════════════════════════════════════════════
        //  BATCH RESOURCE
        // ══════════════════════════════════════════════════
        if (resource === "batch") {
          const batchOp = this.getNodeParameter(
            "batchOperation",
            i,
            "submit",
          ) as string;

          if (batchOp === "list") {
            const filters = this.getNodeParameter("batchListFilters", i, {}) as {
              limit?: number;
              offset?: number;
            };
            const qs: Record<string, number> = {};
            if (filters.limit && filters.limit !== 20) qs.limit = filters.limit;
            if (filters.offset) qs.offset = filters.offset;

            // Note: the history endpoint is /batches (plural).
            const response = await request(authName, {
              method: "GET",
              url: apiUrl("/api/v1/batches"),
              qs,
              json: true,
              returnFullResponse: true,
              ignoreHttpStatusErrors: true,
            });

            const statusCode = (response as { statusCode: number }).statusCode;
            const responseBody = (response as { body: Record<string, unknown> })
              .body;

            if (statusCode >= 400) {
              handleApiError(this, statusCode, responseBody as JsonObject, i);
            }

            const batches = (responseBody as { batches?: IDataObject[] })
              .batches;
            if (batches?.length) {
              for (const batch of batches) results.push({ json: batch });
            } else {
              results.push({
                json: {
                  batches: [],
                  total: (responseBody as { total?: number }).total ?? 0,
                },
              });
            }
            continue;
          }

          const urlsRaw = this.getNodeParameter("batchUrls", i) as string;
          const opts = this.getNodeParameter("batchOptions", i, {}) as {
            webhookUrl?: string;
            sessionId?: string;
            exportIntegrationId?: string;
            exportPrefix?: string;
            exportFormat?: string;
            waitForCompletion?: boolean;
            pollTimeout?: number;
          };

          let urls: unknown[];
          try {
            urls = parseJsonArrayParam(urlsRaw, "URLs");
          } catch {
            throw new NodeOperationError(
              this.getNode(),
              "Invalid JSON in URLs field — must be an array of URL objects",
              { itemIndex: i },
            );
          }

          const body: Record<string, unknown> = { urls };
          applyBatchOptions(body, opts);

          const batchRequestUrl = apiUrl("/api/v1/batch");
          const submitResponse =
            await request(authName, {
                method: "POST",
                url: batchRequestUrl,
                body,
                json: true,
                returnFullResponse: true,
                ignoreHttpStatusErrors: true,
              },
            );

          const submitStatus = (submitResponse as { statusCode: number })
            .statusCode;
          const submitBody = (
            submitResponse as { body: Record<string, unknown> }
          ).body;

          if (submitStatus >= 400) {
            handleApiError(this, submitStatus, submitBody as JsonObject, i);
          }

          const batchId = (submitBody as Record<string, unknown>)
            .batch_id as string;

          if (!batchId || opts.waitForCompletion === false) {
            results.push({ json: submitBody as IDataObject });
            continue;
          }

          // Poll until complete or timeout
          const batchPollTimeoutMs = (opts.pollTimeout ?? 300) * 1000;
          const batchPollStart = Date.now();
          let batchDelay = 1000;
          const maxBatchDelay = 8000;
          let finalBatchBody: Record<string, unknown> = submitBody;
          let batchPollUrl = resolvePollUrl(
            apiBaseUrl,
            submitResponse,
            `/api/v1/batch/${batchId}`,
            batchRequestUrl,
          );

          while (Date.now() - batchPollStart < batchPollTimeoutMs) {
            await new Promise<void>((resolve) => {
              setTimeout(resolve, batchDelay);
            });
            batchDelay = Math.min(batchDelay * 1.5, maxBatchDelay);

            const pollResponse =
              await request(authName, {
                  method: "GET",
                  url: batchPollUrl,
                  json: true,
                  returnFullResponse: true,
                  ignoreHttpStatusErrors: true,
                },
              );

            batchPollUrl = resolvePollUrl(
              apiBaseUrl,
              pollResponse,
              batchPollUrl,
              batchPollUrl,
            );

            const pollStatus = (pollResponse as { statusCode: number })
              .statusCode;
            const pollBody = (pollResponse as { body: Record<string, unknown> })
              .body;

            if (pollStatus >= 400) {
              handleApiError(this, pollStatus, pollBody as JsonObject, i);
            }

            finalBatchBody = pollBody;
            const batchStatus = (pollBody as Record<string, unknown>)
              .status as string;
            if (batchStatus === "completed" || batchStatus === "failed") {
              break;
            }
          }

          results.push({ json: finalBatchBody as IDataObject });
          continue;
        }

        // ══════════════════════════════════════════════════
        //  SCRAPE RESOURCE
        // ══════════════════════════════════════════════════
        const operation = this.getNodeParameter("operation", i) as string;
        const url = this.getNodeParameter("url", i) as string;
        const mode = this.getNodeParameter("mode", i) as string;

        // ── Estimate Cost operation ───────────────────────
        if (operation === "estimateCost") {
          const advancedOptions = this.getNodeParameter(
            "advancedOptions",
            i,
            {},
          ) as {
            renderJs?: boolean;
            useProxy?: boolean;
            useSystemProxy?: boolean;
            proxyCountry?: string;
          };
          const costControls = this.getNodeParameter("costControls", i, {}) as {
            maxCredits?: number;
            forceTier?: string;
            maxTier?: string;
            preferCost?: boolean;
            preferSpeed?: boolean;
            failFast?: boolean;
          };

          const body: Record<string, unknown> = { url, mode };

          const advanced: Record<string, unknown> = {};
          if (advancedOptions.renderJs) advanced.render_js = true;
          if (advancedOptions.useProxy) advanced.use_proxy = true;
          if (advancedOptions.useSystemProxy) advanced.use_system_proxy = true;
          if (advancedOptions.proxyCountry) {
            advanced.proxy_country = advancedOptions.proxyCountry;
          }
          if (Object.keys(advanced).length > 0) {
            body.advanced = advanced;
          }

          const costCtrl: Record<string, unknown> = {};
          if (costControls.maxCredits && costControls.maxCredits > 0) {
            costCtrl.max_credits = costControls.maxCredits;
          }
          if (costControls.forceTier)
            costCtrl.force_tier = costControls.forceTier;
          if (costControls.maxTier) costCtrl.max_tier = costControls.maxTier;
          if (costControls.preferCost) costCtrl.prefer_cost = true;
          if (costControls.preferSpeed) costCtrl.prefer_speed = true;
          if (costControls.failFast) costCtrl.fail_fast = true;
          if (Object.keys(costCtrl).length > 0) {
            body.cost_controls = costCtrl;
          }

          const response =
            await request(authName, {
                method: "POST",
                url: apiUrl("/api/v1/scrape/estimate"),
                body,
                json: true,
                returnFullResponse: true,
                ignoreHttpStatusErrors: true,
              },
            );

          const statusCode = (response as { statusCode: number }).statusCode;
          const responseBody = (response as { body: Record<string, unknown> })
            .body;

          if (statusCode >= 400) {
            handleApiError(this, statusCode, responseBody as JsonObject, i);
          }

          const data = responseBody as Record<string, unknown>;
          results.push({
            json: {
              url: (data.url as string) ?? "",
              estimatedTier: (data.estimated_tier as string) ?? "unknown",
              estimatedCredits: (data.estimated_credits as number) ?? 0,
              confidence: (data.confidence as string) ?? "low",
              maxPossibleCredits: (data.max_possible_credits as number) ?? 0,
              reasoning: (data.reasoning as string) ?? "",
            },
          });
          continue;
        }

        // ── Scrape operation ──────────────────────────────
        const httpMethod = this.getNodeParameter(
          "httpMethod",
          i,
          "GET",
        ) as string;
        const requestBody = this.getNodeParameter(
          "requestBody",
          i,
          "",
        ) as string;
        const outputOptions = this.getNodeParameter("outputOptions", i, {}) as {
          formats?: string[];
          includeRawHtml?: boolean;
          timeout?: number;
          maxResponseBytes?: number;
        };
        const executionMode = this.getNodeParameter("executionMode", i, {}) as {
          cache?: boolean;
          cacheTtl?: number;
          forceRefresh?: boolean;
        };
        const advancedOptions = this.getNodeParameter(
          "advancedOptions",
          i,
          {},
        ) as {
          renderJs?: boolean;
          screenshot?: boolean;
          generatePdf?: boolean;
          scrollToLoad?: boolean;
          ocr?: boolean;
          useProxy?: boolean;
          useSystemProxy?: boolean;
          proxyCountry?: string;
          waitCondition?: string;
          removeCookieBanners?: boolean;
          cookies?: string;
          sectionFilter?: string;
          sessionId?: string;
        } & ScrapeAdvancedInput;
        const scrapeExtras = this.getNodeParameter(
          "scrapeExtras",
          i,
          {},
        ) as ScrapeExtrasInput & { asyncSubmit?: boolean };
        const extraction = this.getNodeParameter("extraction", i, {}) as {
          extractionTemplate?: string;
          extractionProfile?: string;
          extractionPrompt?: string;
          extractionSchema?: string;
          extractionModel?: string;
          extractionProvider?: string;
          promoteSchemaOrg?: boolean;
          evidence?: boolean;
        };
        const costControls = this.getNodeParameter("costControls", i, {}) as {
          maxCredits?: number;
          forceTier?: string;
          maxTier?: string;
          timeBudget?: number;
          preferCost?: boolean;
          preferSpeed?: boolean;
          failFast?: boolean;
        };

        // Build request body
        const body: Record<string, unknown> = {
          url,
          mode,
          sync: true,
        };

        // HTTP method and request body
        if (httpMethod && httpMethod !== "GET") {
          body.method = httpMethod;
        }
        if (requestBody && requestBody.trim()) {
          body.body = requestBody;
        }

        // Output options
        if (outputOptions.formats?.length) {
          body.formats = outputOptions.formats;
        }
        if (outputOptions.includeRawHtml) {
          body.include_raw_html = true;
        }
        if (outputOptions.timeout && outputOptions.timeout !== 90) {
          body.timeout = outputOptions.timeout;
        }
        if (
          outputOptions.maxResponseBytes !== undefined &&
          outputOptions.maxResponseBytes !== 5242880
        ) {
          body.max_response_bytes = outputOptions.maxResponseBytes;
        }

        // Execution mode
        if (executionMode.cache) {
          body.cache = true;
          if (executionMode.cacheTtl && executionMode.cacheTtl !== 3600) {
            body.cache_ttl = executionMode.cacheTtl;
          }
        }
        if (executionMode.forceRefresh) body.force_refresh = true;

        // Advanced options → nested "advanced" object
        const advanced: Record<string, unknown> = {};
        if (advancedOptions.renderJs) advanced.render_js = true;
        if (advancedOptions.screenshot) advanced.screenshot = true;
        if (advancedOptions.generatePdf) advanced.generate_pdf = true;
        if (advancedOptions.scrollToLoad) advanced.scroll_to_load = true;
        if (advancedOptions.ocr) advanced.ocr = true;
        if (advancedOptions.useProxy) advanced.use_proxy = true;
        if (advancedOptions.useSystemProxy) advanced.use_system_proxy = true;
        if (advancedOptions.proxyCountry) {
          advanced.proxy_country = advancedOptions.proxyCountry;
        }
        if (
          advancedOptions.waitCondition &&
          advancedOptions.waitCondition !== "networkidle"
        ) {
          advanced.wait_condition = advancedOptions.waitCondition;
        }
        if (advancedOptions.removeCookieBanners === false) {
          advanced.remove_cookie_banners = false;
        }
        if (advancedOptions.cookies) {
          try {
            advanced.cookies =
              typeof advancedOptions.cookies === "string"
                ? JSON.parse(advancedOptions.cookies)
                : advancedOptions.cookies;
          } catch {
            throw new NodeOperationError(
              this.getNode(),
              "Invalid JSON in Cookies field",
              { itemIndex: i },
            );
          }
        }
        if (advancedOptions.sectionFilter) {
          try {
            advanced.section_filter =
              typeof advancedOptions.sectionFilter === "string"
                ? JSON.parse(advancedOptions.sectionFilter)
                : advancedOptions.sectionFilter;
          } catch {
            throw new NodeOperationError(
              this.getNode(),
              "Invalid JSON in Section Filter field",
              { itemIndex: i },
            );
          }
        }
        if (advancedOptions.sessionId) {
          advanced.session_id = advancedOptions.sessionId;
        }
        applyScrapeAdvancedParity(advanced, advancedOptions);
        if (Object.keys(advanced).length > 0) {
          body.advanced = advanced;
        }

        // Extraction
        if (
          extraction.extractionProfile &&
          extraction.extractionProfile !== "auto"
        ) {
          body.extraction_profile = extraction.extractionProfile;
        }
        if (extraction.extractionTemplate) {
          if (body.extraction_profile) {
            throw new NodeOperationError(
              this.getNode(),
              "Extraction Template and a non-Auto Extraction Profile are mutually exclusive",
              { itemIndex: i },
            );
          }
          body.extraction_template = extraction.extractionTemplate;
        }
        if (extraction.extractionPrompt) {
          body.extraction_prompt = extraction.extractionPrompt;
        }
        if (extraction.extractionSchema) {
          try {
            body.extraction_schema =
              typeof extraction.extractionSchema === "string"
                ? JSON.parse(extraction.extractionSchema)
                : extraction.extractionSchema;
          } catch {
            throw new NodeOperationError(
              this.getNode(),
              "Invalid JSON in Extraction Schema",
              { itemIndex: i },
            );
          }
        }
        if (extraction.promoteSchemaOrg === false) {
          body.promote_schema_org = false;
        }
        if (extraction.evidence) {
          body.evidence = true;
        }
        if (extraction.extractionModel) {
          body.extraction_model = extraction.extractionModel;
        }
        if (extraction.extractionProvider) {
          body.extraction_provider = extraction.extractionProvider;
        }

        // Cost controls → nested "cost_controls" object
        const costCtrl: Record<string, unknown> = {};
        if (costControls.maxCredits && costControls.maxCredits > 0) {
          costCtrl.max_credits = costControls.maxCredits;
        }
        if (costControls.forceTier) {
          costCtrl.force_tier = costControls.forceTier;
        }
        if (costControls.maxTier) {
          costCtrl.max_tier = costControls.maxTier;
        }
        if (costControls.timeBudget && costControls.timeBudget > 0) {
          costCtrl.time_budget = costControls.timeBudget;
        }
        if (costControls.preferCost) costCtrl.prefer_cost = true;
        if (costControls.preferSpeed) costCtrl.prefer_speed = true;
        if (costControls.failFast) costCtrl.fail_fast = true;
        if (Object.keys(costCtrl).length > 0) {
          body.cost_controls = costCtrl;
        }

        applyScrapeExtras(body, scrapeExtras);
        if (scrapeExtras.asyncSubmit) {
          body.sync = false;
          // sync_policy only applies to synchronous requests (API rejects the combo).
          delete body.sync_policy;
        }

        // ── Make the API call ─────────────────────────────
        const scrapeRequestUrl = apiUrl("/api/v1/scrape");
        let response = await request(authName, {
            method: "POST",
            url: scrapeRequestUrl,
            body,
            json: true,
            returnFullResponse: true,
            ignoreHttpStatusErrors: true,
          },
        );

        let statusCode = (response as { statusCode: number }).statusCode;
        let responseBody = (response as { body: Record<string, unknown> }).body;

        // ── Async submission: hand back the job without polling ─
        if (scrapeExtras.asyncSubmit && statusCode < 400) {
          const jobId = (responseBody?.job_id as string) ?? null;
          results.push({
            json: {
              jobId,
              status: (responseBody?.status as string) ?? "queued",
              pollUrl:
                (responseBody?.poll_url as string) ??
                (jobId ? `/api/v1/jobs/${jobId}` : null),
              ...(responseBody?.sync_downgraded !== undefined
                ? { syncDowngraded: responseBody.sync_downgraded }
                : {}),
            } as IDataObject,
          });
          continue;
        }

        // ── Handle async (202) with polling ───────────────
        if (statusCode === 202 && responseBody?.job_id) {
          const jobId = responseBody.job_id as string;
          let delay = 500;
          const maxDelay = 5000;
          const maxPollTime = ((outputOptions.timeout ?? 90) + 30) * 1000; // timeout + 30s buffer
          const pollStart = Date.now();
          let scrapePollUrl = resolvePollUrl(
            apiBaseUrl,
            response,
            `/api/v1/jobs/${jobId}`,
            scrapeRequestUrl,
          );

          while (Date.now() - pollStart < maxPollTime) {
            await new Promise<void>((resolve) => setTimeout(resolve, delay));
            delay = Math.min(delay * 2, maxDelay);

            const pollResponse =
              await request(authName, {
                  method: "GET",
                  url: scrapePollUrl,
                  json: true,
                  returnFullResponse: true,
                  ignoreHttpStatusErrors: true,
                },
              );

            scrapePollUrl = resolvePollUrl(
              apiBaseUrl,
              pollResponse,
              scrapePollUrl,
              scrapePollUrl,
            );

            const pollStatus = (pollResponse as { statusCode: number })
              .statusCode;
            const pollBody = (pollResponse as { body: Record<string, unknown> })
              .body;

            if (pollStatus === 200 && pollBody?.status_code) {
              statusCode = 200;
              responseBody = pollBody;
              break;
            }

            if (pollStatus >= 400) {
              statusCode = pollStatus;
              responseBody = pollBody;
              break;
            }

            // Still processing (200 with status: "processing") — continue polling
          }

          if (statusCode === 202) {
            throw new NodeOperationError(
              this.getNode(),
              "Scrape job timed out while waiting for results. Try increasing the timeout or using a simpler scraping mode.",
              { itemIndex: i },
            );
          }
        }

        // ── Handle errors ─────────────────────────────────
        if (statusCode >= 400) {
          handleApiError(this, statusCode, responseBody as JsonObject, i);
        }

        // ── Format output ─────────────────────────────────
        const data = responseBody as Record<string, unknown>;
        const content = data.content as
          | Record<string, unknown>
          | string
          | undefined;

        const output: IDataObject = {
          url: (data.url as string) ?? "",
          statusCode: (data.status_code as number) ?? 0,
          title: (data.title as string) ?? null,
          author: (data.author as string) ?? null,
          publishedAt: (data.published_at as string) ?? null,
          cached: (data.cached as boolean) ?? false,
          responseTimeMs: (data.response_time_ms as number) ?? 0,
          sizeBytes: (data.size_bytes as number) ?? 0,
        };

        // Flatten multi-format content.
        // When extraction_schema is provided, the API overrides content.json
        // with the filtered/extracted schema result (PR #19898). output.json
        // therefore carries the extraction result in that case.
        if (content && typeof content === "object") {
          output.markdown =
            (content as Record<string, unknown>).markdown ?? null;
          output.text = (content as Record<string, unknown>).text ?? null;
          output.json = (content as Record<string, unknown>).json ?? null;
          output.jsonV2 = (content as Record<string, unknown>).json_v2 ?? null;
          output.rag = (content as Record<string, unknown>).rag ?? null;
          output.html = (content as Record<string, unknown>).html ?? null;
        } else {
          output.markdown = content ?? null;
        }

        // Extraction results — top-level filtered_content is still returned
        // by the API alongside the content.json override above.
        output.filteredContent = data.filtered_content ?? null;
        output.extractionMethod = data.extraction_method ?? null;

        // Advanced outputs
        output.screenshotUrl = data.screenshot_url ?? null;
        output.pdfUrl = data.pdf_url ?? null;
        output.ocrResults = data.ocr_results ?? null;
        output.rawHtml = data.raw_html ?? null;

        // Billing breakdown (flattened)
        const billing = data.billing as Record<string, unknown> | undefined;
        const billingOut: IDataObject = {
          cost: billing?.total_credits ?? data.credits_used ?? 0,
          tier: billing?.tier_used ?? data.tier_used ?? "unknown",
          savings: billing?.savings ?? 0,
          suggestion: billing?.optimization_suggestion ?? null,
        };
        mapBillingExtras(billingOut, billing);
        output.billing = billingOut;
        mapScrapeResponseExtras(output, data);

        results.push({ json: output });
      } catch (rawError) {
        const error =
          rawError instanceof ParamError
            ? new NodeOperationError(this.getNode(), rawError.message, {
                itemIndex: i,
              })
            : rawError;
        if (this.continueOnFail()) {
          results.push({
            json: { error: (error as Error).message },
            pairedItem: { item: i },
          });
          continue;
        }
        throw error;
      }
    }

    return [results];
  }
}

/** Map snake_case API response to camelCase n8n output */
function formatSessionResponse(data: Record<string, unknown>): IDataObject {
  return {
    id: data.id ?? null,
    name: data.name ?? null,
    domain: data.domain ?? null,
    cookieNames: data.cookie_names ?? [],
    headerNames: data.header_names ?? null,
    status: data.status ?? null,
    expiresAt: data.expires_at ?? null,
    lastValidatedAt: data.last_validated_at ?? null,
    validationConfidence: data.validation_confidence ?? null,
    consecutiveFailures: data.consecutive_failures ?? 0,
    lastUsedAt: data.last_used_at ?? null,
    totalRequests: data.total_requests ?? 0,
    successfulRequests: data.successful_requests ?? 0,
    successRate: data.success_rate ?? 0,
    notes: data.notes ?? null,
    expiryStatus: data.expiry_status ?? null,
    createdAt: data.created_at ?? null,
    updatedAt: data.updated_at ?? null,
  };
}

function handleApiError(
  ctx: IExecuteFunctions,
  statusCode: number,
  body: JsonObject,
  itemIndex: number,
): never {
  const detail =
    (body?.detail as string) ?? (body?.message as string) ?? "Unknown error";

  switch (statusCode) {
    case 401:
      throw new NodeApiError(ctx.getNode(), body, {
        message: "Invalid API key",
        description: `${detail}. Check your API key or get a new one at https://app.alterlab.io/dashboard/keys?${UTM}`,
        httpCode: "401",
        itemIndex,
      });

    case 402:
      throw new NodeApiError(ctx.getNode(), body, {
        message: "Insufficient balance",
        description: `Top up your balance at https://app.alterlab.io/dashboard/billing?${UTM}`,
        httpCode: "402",
        itemIndex,
      });

    case 429:
      throw new NodeApiError(ctx.getNode(), body, {
        message: "Rate limit exceeded",
        description: `${detail}. Upgrade your plan for higher rate limits at https://alterlab.io/pricing?${UTM}`,
        httpCode: "429",
        itemIndex,
      });

    case 403:
      throw new NodeApiError(ctx.getNode(), body, {
        message: "Blocked by anti-bot protection",
        description: `${detail}. Try enabling "Use Proxy" in Advanced Options, or use a higher tier via Cost Controls.`,
        httpCode: "403",
        itemIndex,
      });

    case 504:
      throw new NodeApiError(ctx.getNode(), body, {
        message: "Request timed out",
        description: `${detail}. Try increasing the timeout, using async mode, or a simpler scraping mode.`,
        httpCode: "504",
        itemIndex,
      });

    default:
      throw new NodeApiError(ctx.getNode(), body, {
        message: `API error (${statusCode})`,
        description: detail,
        httpCode: String(statusCode),
        itemIndex,
      });
  }
}
