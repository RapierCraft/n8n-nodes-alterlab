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

const BASE_URL = "https://api.alterlab.io";

function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

export class AlterLab implements INodeType {
  description: INodeTypeDescription = {
    displayName: "AlterLab",
    name: "alterLab",
    icon: "file:alterlab.svg",
    group: ["transform"],
    version: 1,
    subtitle:
      '={{$parameter["operation"] === "estimateCost" ? "cost estimate" : $parameter["operation"] === "batchScrape" ? "batch scrape" : $parameter["mode"] + " scrape"}}',
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
    requestDefaults: {
      baseURL: BASE_URL,
    },
    properties: [
      // ── Operation ────────────────────────────────────────
      {
        displayName: "Operation",
        name: "operation",
        type: "options",
        noDataExpression: true,
        default: "scrape",
        options: [
          {
            name: "Scrape",
            value: "scrape",
            description: "Scrape a URL and return its content",
            action: "Scrape a URL",
          },
          {
            name: "Batch Scrape",
            value: "batchScrape",
            description: "Scrape up to 100 URLs in a single batch request",
            action: "Scrape a batch of URLs",
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
            operation: ["scrape", "batchScrape"],
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
              {
                name: "JSON v2 (Structured)",
                value: "json_v2",
                description:
                  "Deterministic extraction with section tree, classified links, and structured tables",
              },
              { name: "HTML", value: "html" },
              { name: "Text", value: "text" },
              {
                name: "RAG (Chunked)",
                value: "rag",
                description:
                  "Chunked markdown with token counts and metadata for vector DB ingestion",
              },
            ],
            description:
              "Output formats. JSON v2 provides structured extraction with section trees. RAG produces chunked output optimized for vector databases.",
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
            operation: ["scrape", "batchScrape"],
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
            default: 900,
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
        options: [
          {
            displayName: "Render JavaScript",
            name: "renderJs",
            type: "boolean",
            default: false,
            description:
              "Whether to render JavaScript with a headless browser (+$0.0006)",
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
            operation: ["scrape", "batchScrape"],
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

      // ── Session / Authentication ─────────────────────────
      {
        displayName: "Session",
        name: "session",
        type: "collection",
        placeholder: "Add Option",
        default: {},
        displayOptions: {
          show: {
            operation: ["scrape", "batchScrape"],
          },
        },
        options: [
          {
            displayName: "Use Authenticated Session",
            name: "useSession",
            type: "boolean",
            default: false,
            description:
              "Whether to inject your own cookies for authenticated scraping (e.g. logged-in pages, member areas)",
          },
          {
            displayName: "Session ID",
            name: "sessionId",
            type: "string",
            default: "",
            placeholder: "e.g. a1b2c3d4-5678-90ab-cdef-1234567890ab",
            description:
              "UUID of a stored session from the AlterLab dashboard. The stored session cookies will be injected automatically.",
            displayOptions: {
              show: {
                useSession: [true],
              },
            },
          },
          {
            displayName: "Inline Cookies",
            name: "cookies",
            type: "json",
            default: "",
            placeholder: '{"session_id": "abc123", "auth_token": "xyz"}',
            description:
              "Cookie key-value pairs as JSON to inject into the request. Use this instead of Session ID for one-off authenticated scrapes.",
            displayOptions: {
              show: {
                useSession: [true],
              },
            },
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
              { name: "T3 Stealth — $0.0005", value: "3" },
              { name: "T3.5 Light JS — $0.0007", value: "3.5" },
              { name: "T4 Browser — $0.001", value: "4" },
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
              { name: "T3 Stealth — $0.0005", value: "3" },
              { name: "T3.5 Light JS — $0.0007", value: "3.5" },
              { name: "T4 Browser — $0.001", value: "4" },
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

      // ── Batch Options ────────────────────────────────────
      {
        displayName: "Webhook URL",
        name: "webhookUrl",
        type: "string",
        default: "",
        placeholder: "https://your-server.com/webhook",
        description:
          "Optional URL to receive a webhook notification when the batch completes",
        displayOptions: {
          show: {
            operation: ["batchScrape"],
          },
        },
      },
      {
        displayName: "Polling Timeout (Seconds)",
        name: "batchPollingTimeout",
        type: "number",
        default: 300,
        typeOptions: { minValue: 30, maxValue: 900 },
        description:
          "Maximum time to wait for the batch to complete (30-900 seconds)",
        displayOptions: {
          show: {
            operation: ["batchScrape"],
          },
        },
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const operation = this.getNodeParameter("operation", 0) as string;

    // Detect credential type once for all items
    let authName = "alterLabApi";
    try {
      await this.getCredentials("alterLabOAuth2Api");
      authName = "alterLabOAuth2Api";
    } catch {
      // OAuth2 not configured, fall back to API key
    }

    // ── Batch Scrape operation ──────────────────────────
    if (operation === "batchScrape") {
      return executeBatchScrape(this, items, authName);
    }

    const results: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      try {
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
                url: `${BASE_URL}/api/v1/scrape/estimate`,
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
          if (executionMode.cacheTtl && executionMode.cacheTtl !== 900) {
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

        // Session / authenticated scraping → injected into "advanced"
        const session = this.getNodeParameter("session", i, {}) as {
          useSession?: boolean;
          sessionId?: string;
          cookies?: string;
        };
        if (session.useSession) {
          // Ensure advanced object exists in body
          if (!body.advanced) {
            body.advanced = advanced;
          }
          const adv = body.advanced as Record<string, unknown>;
          if (session.sessionId) {
            adv.session_id = session.sessionId;
          }
          if (session.cookies) {
            try {
              adv.cookies =
                typeof session.cookies === "string"
                  ? JSON.parse(session.cookies)
                  : session.cookies;
            } catch {
              throw new NodeOperationError(
                this.getNode(),
                "Invalid JSON in Inline Cookies",
                { itemIndex: i },
              );
            }
          }
          // Re-assign in case advanced was empty before
          if (Object.keys(adv).length > 0) {
            body.advanced = adv;
          }
        }

        // ── Make the API call ─────────────────────────────
        let response = await this.helpers.httpRequestWithAuthentication.call(
          this,
          authName,
          {
            method: "POST",
            url: `${BASE_URL}/api/v1/scrape`,
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
            await sleep(delay);
            delay = Math.min(delay * 2, maxDelay);

            const pollResponse =
              await this.helpers.httpRequestWithAuthentication.call(
                this,
                authName,
                {
                  method: "GET",
                  url: `${BASE_URL}/api/v1/jobs/${jobId}`,
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
          output.jsonV2 = (content as Record<string, unknown>).json_v2 ?? null;
          output.html = (content as Record<string, unknown>).html ?? null;
          output.rag = (content as Record<string, unknown>).rag ?? null;
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

/**
 * Format a single scrape result into n8n output format.
 */
function formatScrapeResult(data: Record<string, unknown>): IDataObject {
  const content = data.content as Record<string, unknown> | string | undefined;

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

  if (content && typeof content === "object") {
    output.markdown = (content as Record<string, unknown>).markdown ?? null;
    output.text = (content as Record<string, unknown>).text ?? null;
    output.json = (content as Record<string, unknown>).json ?? null;
    output.jsonV2 = (content as Record<string, unknown>).json_v2 ?? null;
    output.html = (content as Record<string, unknown>).html ?? null;
    output.rag = (content as Record<string, unknown>).rag ?? null;
  } else {
    output.markdown = content ?? null;
  }

  output.filteredContent = data.filtered_content ?? null;
  output.extractionMethod = data.extraction_method ?? null;
  output.screenshotUrl = data.screenshot_url ?? null;
  output.pdfUrl = data.pdf_url ?? null;
  output.ocrResults = data.ocr_results ?? null;
  output.rawHtml = data.raw_html ?? null;

  const billing = data.billing as Record<string, unknown> | undefined;
  output.billing = {
    cost: billing?.total_credits ?? data.credits_used ?? 0,
    tier: billing?.tier_used ?? data.tier_used ?? "unknown",
    savings: billing?.savings ?? 0,
    suggestion: billing?.optimization_suggestion ?? null,
  };

  return output;
}

/**
 * Build a per-URL request body for the batch API from node parameters.
 */
function buildBatchItemBody(
  ctx: IExecuteFunctions,
  itemIndex: number,
): Record<string, unknown> {
  const url = ctx.getNodeParameter("url", itemIndex) as string;
  const mode = ctx.getNodeParameter("mode", itemIndex) as string;
  const outputOptions = ctx.getNodeParameter(
    "outputOptions",
    itemIndex,
    {},
  ) as {
    formats?: string[];
    includeRawHtml?: boolean;
    timeout?: number;
  };
  const executionMode = ctx.getNodeParameter(
    "executionMode",
    itemIndex,
    {},
  ) as {
    cache?: boolean;
  };
  const advancedOptions = ctx.getNodeParameter(
    "advancedOptions",
    itemIndex,
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
  };
  const extraction = ctx.getNodeParameter("extraction", itemIndex, {}) as {
    extractionProfile?: string;
    extractionPrompt?: string;
    extractionSchema?: string;
  };
  const costControls = ctx.getNodeParameter("costControls", itemIndex, {}) as {
    maxCredits?: number;
    forceTier?: string;
    maxTier?: string;
    preferCost?: boolean;
    preferSpeed?: boolean;
    failFast?: boolean;
  };

  const body: Record<string, unknown> = { url, mode };

  if (outputOptions.formats?.length) {
    body.formats = outputOptions.formats;
  }
  if (outputOptions.includeRawHtml) {
    body.include_raw_html = true;
  }
  if (outputOptions.timeout && outputOptions.timeout !== 90) {
    body.timeout = outputOptions.timeout;
  }
  if (executionMode.cache) {
    body.cache = true;
  }

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
  if (Object.keys(advanced).length > 0) {
    body.advanced = advanced;
  }

  if (extraction.extractionProfile && extraction.extractionProfile !== "auto") {
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
        ctx.getNode(),
        "Invalid JSON in Extraction Schema",
        { itemIndex },
      );
    }
  }

  const costCtrl: Record<string, unknown> = {};
  if (costControls.maxCredits && costControls.maxCredits > 0) {
    costCtrl.max_credits = costControls.maxCredits;
  }
  if (costControls.forceTier) costCtrl.force_tier = costControls.forceTier;
  if (costControls.maxTier) costCtrl.max_tier = costControls.maxTier;
  if (costControls.preferCost) costCtrl.prefer_cost = true;
  if (costControls.preferSpeed) costCtrl.prefer_speed = true;
  if (costControls.failFast) costCtrl.fail_fast = true;
  if (Object.keys(costCtrl).length > 0) {
    body.cost_controls = costCtrl;
  }

  // Session / authenticated scraping → injected into "advanced"
  const session = ctx.getNodeParameter("session", itemIndex, {}) as {
    useSession?: boolean;
    sessionId?: string;
    cookies?: string;
  };
  if (session.useSession) {
    if (!body.advanced) {
      body.advanced = advanced;
    }
    const adv = body.advanced as Record<string, unknown>;
    if (session.sessionId) {
      adv.session_id = session.sessionId;
    }
    if (session.cookies) {
      try {
        adv.cookies =
          typeof session.cookies === "string"
            ? JSON.parse(session.cookies)
            : session.cookies;
      } catch {
        throw new NodeOperationError(
          ctx.getNode(),
          "Invalid JSON in Inline Cookies",
          { itemIndex },
        );
      }
    }
    if (Object.keys(adv).length > 0) {
      body.advanced = adv;
    }
  }

  return body;
}

/**
 * Execute batch scrape: collect all input items into one batch API call,
 * poll for completion, and return one output item per URL result.
 */
async function executeBatchScrape(
  ctx: IExecuteFunctions,
  items: INodeExecutionData[],
  authName: string,
): Promise<INodeExecutionData[][]> {
  if (items.length > 100) {
    throw new NodeOperationError(
      ctx.getNode(),
      `Batch scrape supports up to 100 URLs, but ${items.length} items were provided. Split your data into smaller batches upstream.`,
    );
  }

  // Build batch request body from all input items
  const batchUrls: Record<string, unknown>[] = [];
  for (let i = 0; i < items.length; i++) {
    batchUrls.push(buildBatchItemBody(ctx, i));
  }

  const body: Record<string, unknown> = { urls: batchUrls };

  const webhookUrl = ctx.getNodeParameter("webhookUrl", 0, "") as string;
  if (webhookUrl) {
    body.webhook_url = webhookUrl;
  }

  // Submit batch
  const response = await ctx.helpers.httpRequestWithAuthentication.call(
    ctx,
    authName,
    {
      method: "POST",
      url: "/api/v1/batch",
      body,
      json: true,
      returnFullResponse: true,
      ignoreHttpStatusErrors: true,
    },
  );

  const statusCode = (response as { statusCode: number }).statusCode;
  const responseBody = (response as { body: Record<string, unknown> }).body;

  if (statusCode >= 400) {
    handleApiError(ctx, statusCode, responseBody as JsonObject, 0);
  }

  const batchId = responseBody.batch_id as string;

  // Poll for completion with exponential backoff
  const pollingTimeout = ctx.getNodeParameter(
    "batchPollingTimeout",
    0,
    300,
  ) as number;
  const maxPollTime = pollingTimeout * 1000;
  let delay = 1000;
  const maxDelay = 5000;
  const pollStart = Date.now();
  let batchResult: Record<string, unknown> | undefined;

  while (Date.now() - pollStart < maxPollTime) {
    await new Promise<void>((resolve) => setTimeout(resolve, delay));
    delay = Math.min(delay * 2, maxDelay);

    const pollResponse = await ctx.helpers.httpRequestWithAuthentication.call(
      ctx,
      authName,
      {
        method: "GET",
        url: `/api/v1/batch/${batchId}`,
        json: true,
        returnFullResponse: true,
        ignoreHttpStatusErrors: true,
      },
    );

    const pollStatusCode = (pollResponse as { statusCode: number }).statusCode;
    const pollBody = (pollResponse as { body: Record<string, unknown> }).body;

    if (pollStatusCode >= 400) {
      handleApiError(ctx, pollStatusCode, pollBody as JsonObject, 0);
    }

    const status = pollBody.status as string;
    if (status === "completed" || status === "partial" || status === "failed") {
      batchResult = pollBody;
      break;
    }
  }

  if (!batchResult) {
    throw new NodeOperationError(
      ctx.getNode(),
      `Batch ${batchId} timed out after ${pollingTimeout}s. Use a webhook URL to receive results asynchronously, or increase the polling timeout.`,
    );
  }

  // Map results to output items
  const batchItems = (batchResult.items as Record<string, unknown>[]) ?? [];
  const results: INodeExecutionData[] = [];

  for (const batchItem of batchItems) {
    if (batchItem.status === "succeeded" && batchItem.result) {
      const output = formatScrapeResult(
        batchItem.result as Record<string, unknown>,
      );
      output.batchId = batchId;
      output.jobId = (batchItem.job_id as string) ?? "";
      results.push({ json: output });
    } else {
      results.push({
        json: {
          url: (batchItem.url as string) ?? "",
          jobId: (batchItem.job_id as string) ?? "",
          batchId,
          status: (batchItem.status as string) ?? "unknown",
          error: (batchItem.error as string) ?? "Scrape failed",
        },
      });
    }
  }

  // Add batch summary to first result
  if (results.length > 0) {
    (results[0].json as IDataObject).batchSummary = {
      batchId,
      total: batchResult.total,
      completed: batchResult.completed,
      failed: batchResult.failed,
      status: batchResult.status,
    };
  }

  return [results];
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
