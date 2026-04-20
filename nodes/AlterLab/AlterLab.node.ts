import type {
  IDataObject,
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  JsonObject,
} from "n8n-workflow";
import { NodeApiError, NodeOperationError } from "n8n-workflow";

const UTM = "utm_source=n8n&utm_medium=integration&utm_campaign=community_node";

export class AlterLab implements INodeType {
  description: INodeTypeDescription = {
    displayName: "AlterLab",
    name: "alterLab",
    icon: "file:alterlab.svg",
    group: ["transform"],
    version: 1,
    subtitle:
      '={{$parameter["resource"] === "session" ? "session " + $parameter["sessionOperation"] : ($parameter["operation"] === "estimateCost" ? "cost estimate" : $parameter["mode"] + " scrape")}}',
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
            name: "Scrape",
            value: "scrape",
            description: "Scrape websites and extract content",
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
              { name: "Markdown", value: "markdown" },
              { name: "JSON", value: "json" },
              { name: "HTML", value: "html" },
              { name: "Text", value: "text" },
            ],
            description: "Output formats for content transformation",
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
            ],
            description: "Pre-defined extraction profile for structured data",
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
        try {
          await this.getCredentials("alterLabOAuth2Api");
          authName = "alterLabOAuth2Api";
        } catch {
          // OAuth2 not configured, fall back to API key
        }

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
              await this.helpers.httpRequestWithAuthentication.call(
                this,
                authName,
                {
                  method: "POST",
                  url: "/api/v1/sessions",
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
              await this.helpers.httpRequestWithAuthentication.call(
                this,
                authName,
                {
                  method: "GET",
                  url: "/api/v1/sessions",
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
              await this.helpers.httpRequestWithAuthentication.call(
                this,
                authName,
                {
                  method: "GET",
                  url: `/api/v1/sessions/${sessionId}`,
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
              await this.helpers.httpRequestWithAuthentication.call(
                this,
                authName,
                {
                  method: "PATCH",
                  url: `/api/v1/sessions/${sessionId}`,
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
              await this.helpers.httpRequestWithAuthentication.call(
                this,
                authName,
                {
                  method: "DELETE",
                  url: `/api/v1/sessions/${sessionId}`,
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
              await this.helpers.httpRequestWithAuthentication.call(
                this,
                authName,
                {
                  method: "POST",
                  url: `/api/v1/sessions/${sessionId}/validate`,
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
              await this.helpers.httpRequestWithAuthentication.call(
                this,
                authName,
                {
                  method: "POST",
                  url: `/api/v1/sessions/${sessionId}/refresh`,
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
            await this.helpers.httpRequestWithAuthentication.call(
              this,
              authName,
              {
                method: "POST",
                url: "/api/v1/scrape/estimate",
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
        const outputOptions = this.getNodeParameter("outputOptions", i, {}) as {
          formats?: string[];
          includeRawHtml?: boolean;
          timeout?: number;
        };
        const executionMode = this.getNodeParameter("executionMode", i, {}) as {
          cache?: boolean;
          cacheTtl?: number;
        };
        const advancedOptions = this.getNodeParameter(
          "advancedOptions",
          i,
          {},
        ) as {
          renderJs?: boolean;
          screenshot?: boolean;
          generatePdf?: boolean;
          ocr?: boolean;
          useProxy?: boolean;
          proxyCountry?: string;
          waitCondition?: string;
          removeCookieBanners?: boolean;
          sessionId?: string;
        };
        const extraction = this.getNodeParameter("extraction", i, {}) as {
          extractionProfile?: string;
          extractionPrompt?: string;
          extractionSchema?: string;
          promoteSchemaOrg?: boolean;
          evidence?: boolean;
        };
        const costControls = this.getNodeParameter("costControls", i, {}) as {
          maxCredits?: number;
          forceTier?: string;
          maxTier?: string;
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

        // Execution mode
        if (executionMode.cache) {
          body.cache = true;
          if (executionMode.cacheTtl && executionMode.cacheTtl !== 3600) {
            body.cache_ttl = executionMode.cacheTtl;
          }
        }

        // Advanced options → nested "advanced" object
        const advanced: Record<string, unknown> = {};
        if (advancedOptions.renderJs) advanced.render_js = true;
        if (advancedOptions.screenshot) advanced.screenshot = true;
        if (advancedOptions.generatePdf) advanced.generate_pdf = true;
        if (advancedOptions.ocr) advanced.ocr = true;
        if (advancedOptions.useProxy) advanced.use_proxy = true;
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
        if (advancedOptions.sessionId) {
          advanced.session_id = advancedOptions.sessionId;
        }
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
        if (costControls.preferCost) costCtrl.prefer_cost = true;
        if (costControls.preferSpeed) costCtrl.prefer_speed = true;
        if (costControls.failFast) costCtrl.fail_fast = true;
        if (Object.keys(costCtrl).length > 0) {
          body.cost_controls = costCtrl;
        }

        // ── Make the API call ─────────────────────────────
        let response = await this.helpers.httpRequestWithAuthentication.call(
          this,
          authName,
          {
            method: "POST",
            url: "/api/v1/scrape",
            body,
            json: true,
            returnFullResponse: true,
            ignoreHttpStatusErrors: true,
          },
        );

        let statusCode = (response as { statusCode: number }).statusCode;
        let responseBody = (response as { body: Record<string, unknown> }).body;

        // ── Handle async (202) with polling ───────────────
        if (statusCode === 202 && responseBody?.job_id) {
          const jobId = responseBody.job_id as string;
          let delay = 500;
          const maxDelay = 5000;
          const maxPollTime = ((outputOptions.timeout ?? 90) + 30) * 1000; // timeout + 30s buffer
          const pollStart = Date.now();

          while (Date.now() - pollStart < maxPollTime) {
            await new Promise<void>((resolve) => setTimeout(resolve, delay));
            delay = Math.min(delay * 2, maxDelay);

            const pollResponse =
              await this.helpers.httpRequestWithAuthentication.call(
                this,
                authName,
                {
                  method: "GET",
                  url: `/api/v1/jobs/${jobId}`,
                  json: true,
                  returnFullResponse: true,
                  ignoreHttpStatusErrors: true,
                },
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

        // Flatten multi-format content
        if (content && typeof content === "object") {
          output.markdown =
            (content as Record<string, unknown>).markdown ?? null;
          output.text = (content as Record<string, unknown>).text ?? null;
          output.json = (content as Record<string, unknown>).json ?? null;
          output.html = (content as Record<string, unknown>).html ?? null;
        } else {
          output.markdown = content ?? null;
        }

        // Extraction results
        output.filteredContent = data.filtered_content ?? null;
        output.extractionMethod = data.extraction_method ?? null;

        // Advanced outputs
        output.screenshotUrl = data.screenshot_url ?? null;
        output.pdfUrl = data.pdf_url ?? null;
        output.ocrResults = data.ocr_results ?? null;
        output.rawHtml = data.raw_html ?? null;

        // Billing breakdown (flattened)
        const billing = data.billing as Record<string, unknown> | undefined;
        output.billing = {
          cost: billing?.total_credits ?? data.credits_used ?? 0,
          tier: billing?.tier_used ?? data.tier_used ?? "unknown",
          savings: billing?.savings ?? 0,
          suggestion: billing?.optimization_suggestion ?? null,
        };

        results.push({ json: output });
      } catch (error) {
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
        description: `${detail}. Top up your balance at https://app.alterlab.io/dashboard/billing?${UTM}`,
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
