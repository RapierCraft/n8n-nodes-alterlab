"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlterLab = void 0;
const n8n_workflow_1 = require("n8n-workflow");
const UTM = 'utm_source=n8n&utm_medium=integration&utm_campaign=community_node';
class AlterLab {
    constructor() {
        this.description = {
            displayName: 'AlterLab',
            name: 'alterLab',
            icon: 'file:alterlab.svg',
            group: ['transform'],
            version: 1,
            subtitle: '={{$parameter["mode"] + " scrape"}}',
            description: 'Scrape any website with anti-bot bypass, JS rendering, structured extraction, OCR, and more',
            defaults: {
                name: 'AlterLab',
            },
            inputs: ['main'],
            outputs: ['main'],
            credentials: [
                {
                    name: 'alterLabApi',
                    displayName: 'API Key',
                },
                {
                    name: 'alterLabOAuth2Api',
                    displayName: 'OAuth2 (Recommended)',
                },
            ],
            properties: [
                // ── Primary ──────────────────────────────────────────
                {
                    displayName: 'URL',
                    name: 'url',
                    type: 'string',
                    default: '',
                    required: true,
                    placeholder: 'https://www.example.com/page',
                    description: 'The URL to scrape',
                },
                {
                    displayName: 'Mode',
                    name: 'mode',
                    type: 'options',
                    default: 'auto',
                    options: [
                        {
                            name: 'Auto',
                            value: 'auto',
                            description: 'Automatically choose the best scraping method',
                        },
                        {
                            name: 'HTML',
                            value: 'html',
                            description: 'Fast HTTP-only scraping for static pages',
                        },
                        {
                            name: 'JavaScript',
                            value: 'js',
                            description: 'Render JavaScript with headless browser',
                        },
                        {
                            name: 'PDF',
                            value: 'pdf',
                            description: 'Extract text from PDF documents',
                        },
                        {
                            name: 'OCR',
                            value: 'ocr',
                            description: 'Extract text from images',
                        },
                    ],
                    description: 'Scraping mode to use',
                },
                // ── Output Options ───────────────────────────────────
                {
                    displayName: 'Output Options',
                    name: 'outputOptions',
                    type: 'collection',
                    placeholder: 'Add Option',
                    default: {},
                    options: [
                        {
                            displayName: 'Formats',
                            name: 'formats',
                            type: 'multiOptions',
                            default: ['markdown', 'json'],
                            options: [
                                { name: 'Markdown', value: 'markdown' },
                                { name: 'JSON', value: 'json' },
                                { name: 'HTML', value: 'html' },
                                { name: 'Text', value: 'text' },
                            ],
                            description: 'Output formats for content transformation',
                        },
                        {
                            displayName: 'Include Raw HTML',
                            name: 'includeRawHtml',
                            type: 'boolean',
                            default: false,
                            description: 'Whether to include the raw HTML in the response',
                        },
                        {
                            displayName: 'Timeout (Seconds)',
                            name: 'timeout',
                            type: 'number',
                            default: 90,
                            typeOptions: { minValue: 1, maxValue: 300 },
                            description: 'Request timeout in seconds (1-300)',
                        },
                    ],
                },
                // ── Execution Mode ───────────────────────────────────
                {
                    displayName: 'Execution Mode',
                    name: 'executionMode',
                    type: 'collection',
                    placeholder: 'Add Option',
                    default: {},
                    options: [
                        {
                            displayName: 'Cache',
                            name: 'cache',
                            type: 'boolean',
                            default: false,
                            description: 'Whether to enable response caching',
                        },
                        {
                            displayName: 'Cache TTL (Seconds)',
                            name: 'cacheTtl',
                            type: 'number',
                            default: 900,
                            typeOptions: { minValue: 60, maxValue: 86400 },
                            description: 'Cache time-to-live in seconds (60-86400)',
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
                    displayName: 'Advanced Options',
                    name: 'advancedOptions',
                    type: 'collection',
                    placeholder: 'Add Option',
                    default: {},
                    options: [
                        {
                            displayName: 'Render JavaScript',
                            name: 'renderJs',
                            type: 'boolean',
                            default: false,
                            description: 'Whether to render JavaScript with a headless browser (+$0.0006)',
                        },
                        {
                            displayName: 'Screenshot',
                            name: 'screenshot',
                            type: 'boolean',
                            default: false,
                            description: 'Whether to capture a full-page screenshot (+$0.0002, requires Render JavaScript)',
                            displayOptions: {
                                show: {
                                    renderJs: [true],
                                },
                            },
                        },
                        {
                            displayName: 'Generate PDF',
                            name: 'generatePdf',
                            type: 'boolean',
                            default: false,
                            description: 'Whether to generate a PDF of the rendered page (+$0.0004, requires Render JavaScript)',
                            displayOptions: {
                                show: {
                                    renderJs: [true],
                                },
                            },
                        },
                        {
                            displayName: 'OCR',
                            name: 'ocr',
                            type: 'boolean',
                            default: false,
                            description: 'Whether to extract text from images using OCR (+$0.001, refunded if no images found)',
                        },
                        {
                            displayName: 'Use Proxy',
                            name: 'useProxy',
                            type: 'boolean',
                            default: false,
                            description: 'Whether to route through a premium proxy (+$0.0002)',
                        },
                        {
                            displayName: 'Proxy Country',
                            name: 'proxyCountry',
                            type: 'string',
                            default: '',
                            placeholder: 'US',
                            description: 'Preferred proxy country code for geo-targeting (e.g. US, DE, GB)',
                            displayOptions: {
                                show: {
                                    useProxy: [true],
                                },
                            },
                        },
                        {
                            displayName: 'Wait Condition',
                            name: 'waitCondition',
                            type: 'options',
                            default: 'networkidle',
                            options: [
                                {
                                    name: 'Network Idle',
                                    value: 'networkidle',
                                    description: 'Wait until network is idle',
                                },
                                {
                                    name: 'DOM Content Loaded',
                                    value: 'domcontentloaded',
                                    description: 'Wait until DOM content is loaded',
                                },
                                {
                                    name: 'Load',
                                    value: 'load',
                                    description: 'Wait until page load event',
                                },
                            ],
                            description: 'When to consider the page ready (JS rendering only)',
                            displayOptions: {
                                show: {
                                    renderJs: [true],
                                },
                            },
                        },
                        {
                            displayName: 'Remove Cookie Banners',
                            name: 'removeCookieBanners',
                            type: 'boolean',
                            default: true,
                            description: 'Whether to remove cookie consent banners before content extraction',
                        },
                    ],
                },
                // ── Extraction ───────────────────────────────────────
                {
                    displayName: 'Extraction',
                    name: 'extraction',
                    type: 'collection',
                    placeholder: 'Add Option',
                    default: {},
                    options: [
                        {
                            displayName: 'Extraction Profile',
                            name: 'extractionProfile',
                            type: 'options',
                            default: 'auto',
                            options: [
                                { name: 'Auto', value: 'auto' },
                                { name: 'Product', value: 'product' },
                                { name: 'Article', value: 'article' },
                                { name: 'Job Posting', value: 'job_posting' },
                                { name: 'FAQ', value: 'faq' },
                                { name: 'Recipe', value: 'recipe' },
                                { name: 'Event', value: 'event' },
                            ],
                            description: 'Pre-defined extraction profile for structured data',
                        },
                        {
                            displayName: 'Extraction Prompt',
                            name: 'extractionPrompt',
                            type: 'string',
                            typeOptions: { rows: 4 },
                            default: '',
                            placeholder: 'Extract the product name, price, and rating...',
                            description: 'Natural language instructions for what data to extract',
                        },
                        {
                            displayName: 'Extraction Schema (JSON)',
                            name: 'extractionSchema',
                            type: 'json',
                            default: '',
                            placeholder: '{"name": "string", "price": "number"}',
                            description: 'JSON Schema to filter and structure extracted data',
                        },
                        {
                            displayName: 'Promote Schema.org',
                            name: 'promoteSchemaOrg',
                            type: 'boolean',
                            default: true,
                            description: 'Whether to use Schema.org structured data as primary output when available',
                        },
                        {
                            displayName: 'Evidence',
                            name: 'evidence',
                            type: 'boolean',
                            default: false,
                            description: 'Whether to include provenance/evidence for extracted fields',
                        },
                    ],
                },
                // ── Cost Controls ────────────────────────────────────
                {
                    displayName: 'Cost Controls',
                    name: 'costControls',
                    type: 'collection',
                    placeholder: 'Add Option',
                    default: {},
                    options: [
                        {
                            displayName: 'Max Spend',
                            name: 'maxCredits',
                            type: 'number',
                            default: 0,
                            typeOptions: { minValue: 0 },
                            description: 'Maximum to spend per request in microcents (0 = no limit)',
                        },
                        {
                            displayName: 'Force Tier',
                            name: 'forceTier',
                            type: 'options',
                            default: '',
                            options: [
                                { name: 'None', value: '' },
                                { name: 'T1 Curl — $0.0002', value: '1' },
                                { name: 'T2 HTTP — $0.0003', value: '2' },
                                { name: 'T3 Stealth — $0.0005', value: '3' },
                                { name: 'T3.5 Light JS — $0.0007', value: '3.5' },
                                { name: 'T4 Browser — $0.001', value: '4' },
                            ],
                            description: 'Force a specific scraping tier (skip escalation)',
                        },
                        {
                            displayName: 'Max Tier',
                            name: 'maxTier',
                            type: 'options',
                            default: '',
                            options: [
                                { name: 'None', value: '' },
                                { name: 'T1 Curl — $0.0002', value: '1' },
                                { name: 'T2 HTTP — $0.0003', value: '2' },
                                { name: 'T3 Stealth — $0.0005', value: '3' },
                                { name: 'T3.5 Light JS — $0.0007', value: '3.5' },
                                { name: 'T4 Browser — $0.001', value: '4' },
                            ],
                            description: 'Maximum tier to escalate to',
                        },
                        {
                            displayName: 'Prefer Cost',
                            name: 'preferCost',
                            type: 'boolean',
                            default: false,
                            description: 'Whether to optimize for lower cost (try cheaper tiers first)',
                        },
                        {
                            displayName: 'Prefer Speed',
                            name: 'preferSpeed',
                            type: 'boolean',
                            default: false,
                            description: 'Whether to optimize for speed (skip to reliable tier)',
                        },
                        {
                            displayName: 'Fail Fast',
                            name: 'failFast',
                            type: 'boolean',
                            default: false,
                            description: 'Whether to return an error instead of escalating to expensive tiers',
                        },
                    ],
                },
            ],
        };
    }
    async execute() {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1;
        const items = this.getInputData();
        const results = [];
        for (let i = 0; i < items.length; i++) {
            try {
                const url = this.getNodeParameter('url', i);
                const mode = this.getNodeParameter('mode', i);
                const outputOptions = this.getNodeParameter('outputOptions', i, {});
                const executionMode = this.getNodeParameter('executionMode', i, {});
                const advancedOptions = this.getNodeParameter('advancedOptions', i, {});
                const extraction = this.getNodeParameter('extraction', i, {});
                const costControls = this.getNodeParameter('costControls', i, {});
                // Build request body
                const body = {
                    url,
                    mode,
                    sync: true,
                };
                // Output options
                if ((_a = outputOptions.formats) === null || _a === void 0 ? void 0 : _a.length) {
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
                const advanced = {};
                if (advancedOptions.renderJs)
                    advanced.render_js = true;
                if (advancedOptions.screenshot)
                    advanced.screenshot = true;
                if (advancedOptions.generatePdf)
                    advanced.generate_pdf = true;
                if (advancedOptions.ocr)
                    advanced.ocr = true;
                if (advancedOptions.useProxy)
                    advanced.use_proxy = true;
                if (advancedOptions.proxyCountry) {
                    advanced.proxy_country = advancedOptions.proxyCountry;
                }
                if (advancedOptions.waitCondition && advancedOptions.waitCondition !== 'networkidle') {
                    advanced.wait_condition = advancedOptions.waitCondition;
                }
                if (advancedOptions.removeCookieBanners === false) {
                    advanced.remove_cookie_banners = false;
                }
                if (Object.keys(advanced).length > 0) {
                    body.advanced = advanced;
                }
                // Extraction
                if (extraction.extractionProfile && extraction.extractionProfile !== 'auto') {
                    body.extraction_profile = extraction.extractionProfile;
                }
                if (extraction.extractionPrompt) {
                    body.extraction_prompt = extraction.extractionPrompt;
                }
                if (extraction.extractionSchema) {
                    try {
                        body.extraction_schema =
                            typeof extraction.extractionSchema === 'string'
                                ? JSON.parse(extraction.extractionSchema)
                                : extraction.extractionSchema;
                    }
                    catch {
                        throw new n8n_workflow_1.NodeOperationError(this.getNode(), 'Invalid JSON in Extraction Schema', { itemIndex: i });
                    }
                }
                if (extraction.promoteSchemaOrg === false) {
                    body.promote_schema_org = false;
                }
                if (extraction.evidence) {
                    body.evidence = true;
                }
                // Cost controls → nested "cost_controls" object
                const costCtrl = {};
                if (costControls.maxCredits && costControls.maxCredits > 0) {
                    costCtrl.max_credits = costControls.maxCredits;
                }
                if (costControls.forceTier) {
                    costCtrl.force_tier = costControls.forceTier;
                }
                if (costControls.maxTier) {
                    costCtrl.max_tier = costControls.maxTier;
                }
                if (costControls.preferCost)
                    costCtrl.prefer_cost = true;
                if (costControls.preferSpeed)
                    costCtrl.prefer_speed = true;
                if (costControls.failFast)
                    costCtrl.fail_fast = true;
                if (Object.keys(costCtrl).length > 0) {
                    body.cost_controls = costCtrl;
                }
                // ── Detect credential type ────────────────────────
                let authName = 'alterLabApi';
                try {
                    await this.getCredentials('alterLabOAuth2Api');
                    authName = 'alterLabOAuth2Api';
                }
                catch {
                    // OAuth2 not configured, fall back to API key
                }
                // ── Make the API call ─────────────────────────────
                let response = await this.helpers.httpRequestWithAuthentication.call(this, authName, {
                    method: 'POST',
                    url: '/api/v1/scrape',
                    body,
                    json: true,
                    returnFullResponse: true,
                    ignoreHttpStatusErrors: true,
                });
                let statusCode = response.statusCode;
                let responseBody = response.body;
                // ── Handle async (202) with polling ───────────────
                if (statusCode === 202 && (responseBody === null || responseBody === void 0 ? void 0 : responseBody.job_id)) {
                    const jobId = responseBody.job_id;
                    let delay = 500;
                    const maxDelay = 5000;
                    const maxPollTime = (((_b = outputOptions.timeout) !== null && _b !== void 0 ? _b : 90) + 30) * 1000; // timeout + 30s buffer
                    const pollStart = Date.now();
                    while (Date.now() - pollStart < maxPollTime) {
                        await new Promise((resolve) => setTimeout(resolve, delay));
                        delay = Math.min(delay * 2, maxDelay);
                        const pollResponse = await this.helpers.httpRequestWithAuthentication.call(this, authName, {
                            method: 'GET',
                            url: `/api/v1/jobs/${jobId}`,
                            json: true,
                            returnFullResponse: true,
                            ignoreHttpStatusErrors: true,
                        });
                        const pollStatus = pollResponse.statusCode;
                        const pollBody = pollResponse.body;
                        if (pollStatus === 200 && (pollBody === null || pollBody === void 0 ? void 0 : pollBody.status_code)) {
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
                        throw new n8n_workflow_1.NodeOperationError(this.getNode(), 'Scrape job timed out while waiting for results. Try increasing the timeout or using a simpler scraping mode.', { itemIndex: i });
                    }
                }
                // ── Handle errors ─────────────────────────────────
                if (statusCode >= 400) {
                    handleApiError(this, statusCode, responseBody, i);
                }
                // ── Format output ─────────────────────────────────
                const data = responseBody;
                const content = data.content;
                const output = {
                    url: (_c = data.url) !== null && _c !== void 0 ? _c : '',
                    statusCode: (_d = data.status_code) !== null && _d !== void 0 ? _d : 0,
                    title: (_e = data.title) !== null && _e !== void 0 ? _e : null,
                    author: (_f = data.author) !== null && _f !== void 0 ? _f : null,
                    publishedAt: (_g = data.published_at) !== null && _g !== void 0 ? _g : null,
                    cached: (_h = data.cached) !== null && _h !== void 0 ? _h : false,
                    responseTimeMs: (_j = data.response_time_ms) !== null && _j !== void 0 ? _j : 0,
                    sizeBytes: (_k = data.size_bytes) !== null && _k !== void 0 ? _k : 0,
                };
                // Flatten multi-format content
                if (content && typeof content === 'object') {
                    output.markdown = (_l = content.markdown) !== null && _l !== void 0 ? _l : null;
                    output.text = (_m = content.text) !== null && _m !== void 0 ? _m : null;
                    output.json = (_o = content.json) !== null && _o !== void 0 ? _o : null;
                    output.html = (_p = content.html) !== null && _p !== void 0 ? _p : null;
                }
                else {
                    output.markdown = content !== null && content !== void 0 ? content : null;
                }
                // Extraction results
                output.filteredContent = (_q = data.filtered_content) !== null && _q !== void 0 ? _q : null;
                output.extractionMethod = (_r = data.extraction_method) !== null && _r !== void 0 ? _r : null;
                // Advanced outputs
                output.screenshotUrl = (_s = data.screenshot_url) !== null && _s !== void 0 ? _s : null;
                output.pdfUrl = (_t = data.pdf_url) !== null && _t !== void 0 ? _t : null;
                output.ocrResults = (_u = data.ocr_results) !== null && _u !== void 0 ? _u : null;
                output.rawHtml = (_v = data.raw_html) !== null && _v !== void 0 ? _v : null;
                // Billing breakdown (flattened)
                const billing = data.billing;
                output.billing = {
                    cost: (_x = (_w = billing === null || billing === void 0 ? void 0 : billing.total_credits) !== null && _w !== void 0 ? _w : data.credits_used) !== null && _x !== void 0 ? _x : 0,
                    tier: (_z = (_y = billing === null || billing === void 0 ? void 0 : billing.tier_used) !== null && _y !== void 0 ? _y : data.tier_used) !== null && _z !== void 0 ? _z : 'unknown',
                    savings: (_0 = billing === null || billing === void 0 ? void 0 : billing.savings) !== null && _0 !== void 0 ? _0 : 0,
                    suggestion: (_1 = billing === null || billing === void 0 ? void 0 : billing.optimization_suggestion) !== null && _1 !== void 0 ? _1 : null,
                };
                results.push({ json: output });
            }
            catch (error) {
                if (this.continueOnFail()) {
                    results.push({
                        json: { error: error.message },
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
exports.AlterLab = AlterLab;
function handleApiError(ctx, statusCode, body, itemIndex) {
    var _a, _b;
    const detail = (_b = (_a = body === null || body === void 0 ? void 0 : body.detail) !== null && _a !== void 0 ? _a : body === null || body === void 0 ? void 0 : body.message) !== null && _b !== void 0 ? _b : 'Unknown error';
    switch (statusCode) {
        case 401:
            throw new n8n_workflow_1.NodeApiError(ctx.getNode(), body, {
                message: 'Invalid API key',
                description: `${detail}. Check your API key or get a new one at https://app.alterlab.io/dashboard/keys?${UTM}`,
                httpCode: '401',
                itemIndex,
            });
        case 402:
            throw new n8n_workflow_1.NodeApiError(ctx.getNode(), body, {
                message: 'Insufficient balance',
                description: `${detail}. Top up your balance at https://app.alterlab.io/dashboard/billing?${UTM}`,
                httpCode: '402',
                itemIndex,
            });
        case 429:
            throw new n8n_workflow_1.NodeApiError(ctx.getNode(), body, {
                message: 'Rate limit exceeded',
                description: `${detail}. Upgrade your plan for higher rate limits at https://alterlab.io/pricing?${UTM}`,
                httpCode: '429',
                itemIndex,
            });
        case 403:
            throw new n8n_workflow_1.NodeApiError(ctx.getNode(), body, {
                message: 'Blocked by anti-bot protection',
                description: `${detail}. Try enabling "Use Proxy" in Advanced Options, or use a higher tier via Cost Controls.`,
                httpCode: '403',
                itemIndex,
            });
        case 504:
            throw new n8n_workflow_1.NodeApiError(ctx.getNode(), body, {
                message: 'Request timed out',
                description: `${detail}. Try increasing the timeout, using async mode, or a simpler scraping mode.`,
                httpCode: '504',
                itemIndex,
            });
        default:
            throw new n8n_workflow_1.NodeApiError(ctx.getNode(), body, {
                message: `API error (${statusCode})`,
                description: detail,
                httpCode: String(statusCode),
                itemIndex,
            });
    }
}
//# sourceMappingURL=AlterLab.node.js.map