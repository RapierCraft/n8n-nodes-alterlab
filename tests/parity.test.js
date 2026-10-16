const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { AlterLab } = require("../dist/nodes/AlterLab/AlterLab.node.js");
const params = require("../dist/nodes/AlterLab/params.js");

const pkg = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"),
);

function makeContext({ params: nodeParams = {}, responses = [] } = {}) {
  const calls = [];
  const queue = [...responses];
  const context = {
    getInputData: () => [{}],
    getNodeParameter(name, _index, defaultValue) {
      return Object.prototype.hasOwnProperty.call(nodeParams, name)
        ? nodeParams[name]
        : defaultValue;
    },
    async getCredentials(name) {
      if (name === "alterLabOAuth2Api") throw new Error("not configured");
      return {};
    },
    getNode: () => ({ type: "n8n-nodes-alterlab.alterLab" }),
    continueOnFail: () => false,
    helpers: {
      async httpRequestWithAuthentication(authName, options) {
        calls.push({ authName, options });
        return queue.shift() ?? { statusCode: 200, body: {} };
      },
    },
  };
  return { context, calls };
}

async function run(nodeParams, responses = []) {
  const { context, calls } = makeContext({ params: nodeParams, responses });
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = (cb, _d, ...args) => originalSetTimeout(cb, 0, ...args);
  try {
    const out = await new AlterLab().execute.call(context);
    return { calls, items: out[0].map((i) => i.json) };
  } finally {
    global.setTimeout = originalSetTimeout;
  }
}

const ok = (body = {}, statusCode = 200) => ({ statusCode, body });

const scrapeBase = {
  resource: "scrape",
  operation: "scrape",
  url: "https://example.com",
  mode: "auto",
};

// ── #55 attribution header ────────────────────────────────────────────

test("source header version matches package.json", () => {
  assert.equal(params.NODE_VERSION, pkg.version);
  assert.equal(params.SOURCE_VALUE, `n8n-node/${pkg.version}`);
  assert.equal(params.SOURCE_HEADER, "X-AlterLab-Source");
});

test("every request sends X-AlterLab-Source (scrape, poll, crawl, batch, session)", async () => {
  const cases = [
    [{ ...scrapeBase }, [ok({ status_code: 200, content: "x" })]],
    [
      { ...scrapeBase, outputOptions: { timeout: 1 } },
      [ok({ job_id: "j1" }, 202), ok({ status_code: 200, content: "x" })],
    ],
    [
      {
        resource: "crawl",
        crawlOperation: "start",
        crawlUrl: "https://example.com",
        crawlSettings: { pollTimeout: 10 },
      },
      [ok({ crawl_id: "c1" }), ok({ status: "completed" })],
    ],
    [
      {
        resource: "batch",
        batchUrls: '[{"url":"https://example.com"}]',
        batchOptions: { waitForCompletion: true, pollTimeout: 10 },
      },
      [ok({ batch_id: "b1" }), ok({ status: "completed" })],
    ],
    [{ resource: "session", sessionOperation: "get", sessionId: "s1" }, [ok()]],
  ];
  for (const [p, responses] of cases) {
    const { calls } = await run(p, responses);
    assert.ok(calls.length >= 1);
    for (const call of calls) {
      assert.equal(call.options.headers["X-AlterLab-Source"], `n8n-node/${pkg.version}`);
    }
  }
});

// ── helpers ───────────────────────────────────────────────────────────

test("tri-state maps default to undefined and true/false to booleans", () => {
  assert.equal(params.triState("default"), undefined);
  assert.equal(params.triState(undefined), undefined);
  assert.equal(params.triState("true"), true);
  assert.equal(params.triState("false"), false);
  assert.equal(params.triState(true), true);
});

test("parseCsv handles quotes, embedded commas/newlines and CRLF", () => {
  const rows = params.parseCsv(
    'job_id,url,content\r\nj1,https://a,"hello, ""world""\nline2"\r\nj2,https://b,\r\n',
  );
  assert.deepEqual(rows, [
    { job_id: "j1", url: "https://a", content: 'hello, "world"\nline2' },
    { job_id: "j2", url: "https://b", content: "" },
  ]);
  assert.deepEqual(params.parseCsv(""), []);
});

test("parseCrawlExport parses json, jsonl, csv and pre-parsed bodies", () => {
  assert.deepEqual(params.parseCrawlExport('[{"a":1},{"a":2}]', "json"), [{ a: 1 }, { a: 2 }]);
  assert.deepEqual(params.parseCrawlExport('{"a":1}\n{"a":2}\n', "jsonl"), [{ a: 1 }, { a: 2 }]);
  assert.deepEqual(params.parseCrawlExport("a,b\n1,2\n", "csv"), [{ a: "1", b: "2" }]);
  assert.deepEqual(params.parseCrawlExport([{ a: 1 }], "json"), [{ a: 1 }]);
  assert.deepEqual(params.parseCrawlExport("", "json"), []);
  assert.throws(() => params.parseCrawlExport("not json", "json"), params.ParamError);
  assert.throws(() => params.parseCrawlExport("{bad}\n", "jsonl"), params.ParamError);
});

// ── scrape request mapping (#217 / #285 / #47) ───────────────────────

test("scrape defaults add no parity fields", async () => {
  const { calls } = await run(scrapeBase, [ok({ status_code: 200, content: "x" })]);
  assert.deepEqual(calls[0].options.body, {
    url: "https://example.com",
    mode: "auto",
    sync: true,
  });
});

test("scrape maps advanced parity options (block_images, TLS, auto render, actions)", async () => {
  const { calls } = await run(
    {
      ...scrapeBase,
      advancedOptions: {
        renderJsAuto: true,
        blockImages: "true",
        skipTlsVerification: "false",
        includeIframes: true,
        flattenShadowDom: true,
        scrollCount: 5,
        sessionHeaders: '{"Authorization":"Bearer t"}',
        useOwnProxy: true,
        proxyIntegrationId: "p1",
        stickySession: "flow-1",
        stickySessionTtl: 600,
        actions: '[{"type":"click","selector":"#a"},{"type":"wait","milliseconds":500}]',
      },
    },
    [ok({ status_code: 200, content: "x" })],
  );
  assert.deepEqual(calls[0].options.body.advanced, {
    render_js: "auto",
    block_images: true,
    skip_tls_verification: false,
    include_iframes: true,
    flatten_shadow_dom: true,
    scroll_count: 5,
    session_headers: { Authorization: "Bearer t" },
    use_own_proxy: true,
    proxy_integration_id: "p1",
    sticky_session: "flow-1",
    sticky_session_ttl: 600,
    actions: [
      { type: "click", selector: "#a" },
      { type: "wait", milliseconds: 500 },
    ],
  });
});

test("explicit Render JavaScript wins over auto-detect; tri-state default omits fields", async () => {
  const { calls } = await run(
    {
      ...scrapeBase,
      advancedOptions: {
        renderJs: true,
        renderJsAuto: true,
        blockImages: "default",
        skipTlsVerification: "default",
      },
    },
    [ok({ status_code: 200, content: "x" })],
  );
  assert.deepEqual(calls[0].options.body.advanced, { render_js: true });
});

test("block_images=false and skip_tls_verification=true are sent explicitly", async () => {
  const { calls } = await run(
    {
      ...scrapeBase,
      advancedOptions: { blockImages: "false", skipTlsVerification: "true" },
    },
    [ok({ status_code: 200, content: "x" })],
  );
  assert.equal(calls[0].options.body.advanced.block_images, false);
  assert.equal(calls[0].options.body.advanced.skip_tls_verification, true);
});

test("scrape maps extras, cost time_budget, force_refresh, template and formats", async () => {
  const { calls } = await run(
    {
      ...scrapeBase,
      httpMethod: "POST",
      requestBody: '{"q":1}',
      outputOptions: { formats: ["json_v2", "rag", "raw"] },
      executionMode: { cache: true, forceRefresh: true },
      extraction: { extractionTemplate: "product" },
      costControls: { timeBudget: 30, maxTier: "3" },
      scrapeExtras: {
        contentType: "application/json",
        headers: '{"X-Test":"1"}',
        locationCountry: "de",
        locationLanguage: "DE",
        waitFor: "#ready",
        filterContent: true,
        enableScroll: "false",
        pdfFormat: "text",
        ocrLanguage: "deu",
        webhookUrl: "https://hooks.example/x",
        syncPolicy: "wait_until_deadline",
        embeddingsEnabled: true,
        embeddingsModel: "text-embedding-3-large",
        embeddingsChunkSize: 256,
        embeddingsChunkOverlap: 20,
      },
    },
    [ok({ status_code: 200, content: "x" })],
  );
  const body = calls[0].options.body;
  assert.equal(body.method, "POST");
  assert.equal(body.content_type, "application/json");
  assert.deepEqual(body.headers, { "X-Test": "1" });
  assert.deepEqual(body.location, { country: "DE", language: "de" });
  assert.deepEqual(body.formats, ["json_v2", "rag", "raw"]);
  assert.equal(body.cache, true);
  assert.equal(body.force_refresh, true);
  assert.equal(body.extraction_template, "product");
  assert.equal(body.wait_for, "#ready");
  assert.equal(body.filter_content, true);
  assert.equal(body.enable_scroll, false);
  assert.equal(body.pdf_format, "text");
  assert.equal(body.ocr_language, "deu");
  assert.equal(body.webhook_url, "https://hooks.example/x");
  assert.equal(body.sync_policy, "wait_until_deadline");
  assert.equal(body.sync, true);
  assert.deepEqual(body.embeddings, {
    enabled: true,
    model: "text-embedding-3-large",
    chunk_size: 256,
    chunk_overlap: 20,
  });
  assert.deepEqual(body.cost_controls, { max_tier: "3", time_budget: 30 });
});

test("extraction template conflicts with an explicit profile", async () => {
  await assert.rejects(
    () =>
      run(
        {
          ...scrapeBase,
          extraction: { extractionProfile: "article", extractionTemplate: "product" },
        },
        [],
      ),
    /mutually exclusive/,
  );
});

test("invalid JSON in new fields raises a node error", async () => {
  await assert.rejects(
    () => run({ ...scrapeBase, advancedOptions: { actions: "[nope" } }, []),
    /Invalid JSON in Browser Actions/,
  );
  await assert.rejects(
    () => run({ ...scrapeBase, scrapeExtras: { headers: "[1]" } }, []),
    /Headers must be a JSON object/,
  );
});

test("async submit sends sync=false, skips sync_policy and returns the job without polling", async () => {
  const { calls, items } = await run(
    {
      ...scrapeBase,
      scrapeExtras: { asyncSubmit: true, syncPolicy: "wait_until_deadline" },
    },
    [ok({ job_id: "j9", poll_url: "/api/v1/jobs/j9", status: "queued" }, 202)],
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.body.sync, false);
  assert.equal("sync_policy" in calls[0].options.body, false);
  assert.deepEqual(items[0], {
    jobId: "j9",
    status: "queued",
    pollUrl: "/api/v1/jobs/j9",
  });
});

test("scrape output maps the new response fields and billing extras", async () => {
  const { items } = await run({ ...scrapeBase }, [
    ok({
      job_id: "j1",
      url: "https://example.com",
      final_url: "https://example.com/home",
      redirected: true,
      status_code: 200,
      content: { markdown: "# hi", raw: "ignored" },
      cached: true,
      cached_at: "2026-10-01T00:00:00Z",
      expires_at: "2026-10-01T01:00:00Z",
      stale_cache: false,
      raw: "<html/>",
      warning: "w",
      action_results: [{ index: 0, type: "click", success: true }],
      billing: {
        total_credits: 3,
        tier_used: "2",
        byop_applied: true,
        byop_discount_percent: 20,
        byos_applied: false,
        method_surcharge_applied: true,
      },
    }),
  ]);
  const out = items[0];
  assert.equal(out.jobId, "j1");
  assert.equal(out.finalUrl, "https://example.com/home");
  assert.equal(out.redirected, true);
  assert.equal(out.cached, true);
  assert.equal(out.cachedAt, "2026-10-01T00:00:00Z");
  assert.equal(out.staleCache, false);
  assert.equal(out.raw, "<html/>");
  assert.equal(out.warning, "w");
  assert.deepEqual(out.actionResults, [{ index: 0, type: "click", success: true }]);
  assert.equal(out.billing.byopApplied, true);
  assert.equal(out.billing.byopDiscountPercent, 20);
  assert.equal(out.billing.byosApplied, false);
  assert.equal(out.billing.methodSurchargeApplied, true);
  assert.equal(out.billing.cost, 3);
  assert.equal("tierCapWarning" in out, false);
});

// ── crawl (#217 / #47 / #285) ─────────────────────────────────────────

test("crawl start sends max_concurrency at the top level, never in advanced", async () => {
  const { calls } = await run(
    {
      resource: "crawl",
      crawlOperation: "start",
      crawlUrl: "https://example.com",
      crawlSettings: { maxConcurrency: 25, delay: 2, timeout: 30, pollTimeout: 10 },
    },
    [ok({ crawl_id: "c1" }), ok({ status: "completed" })],
  );
  const body = calls[0].options.body;
  assert.equal(body.max_concurrency, 25);
  assert.deepEqual(body.advanced, { delay: 2, timeout: 30 });
});

test("crawl start maps the full parity surface", async () => {
  const { calls } = await run(
    {
      resource: "crawl",
      crawlOperation: "start",
      crawlUrl: "https://example.com",
      crawlSettings: {
        pollTimeout: 10,
        formats: ["markdown", "rag"],
        sitemap: "only",
        sitemapPath: "/sm.xml",
        budget: '{"/blog/*": 10, "*": 5}',
        priority: '{"keywords": ["pricing"]}',
        headers: '{"X-A":"b"}',
        extractionAuto: true,
        extractionModel: "gpt-4o",
        respectRobots: false,
        includeSubdomains: true,
        changeTracking: '{"enabled": true}',
        webhookUrl: "https://hooks.example/done",
        webhook: '{"url": "https://hooks.example/ev", "events": ["crawl.completed"]}',
        screenshot: true,
        waitFor: "#app",
        depthStrategy: "eager",
        renderJs: "auto",
        maxCredits: 500,
        maxTier: "3",
        forceTier: "2",
        output: '{"type": "webhook_stream", "url": "https://hooks.example/s"}',
        storage: "s3",
        cache: true,
        cacheTtl: 120,
        forceRefresh: true,
      },
    },
    [ok({ crawl_id: "c1" }), ok({ status: "completed" })],
  );
  assert.deepEqual(calls[0].options.body, {
    url: "https://example.com",
    formats: ["markdown", "rag"],
    sitemap: "only",
    sitemap_path: "/sm.xml",
    budget: { "/blog/*": 10, "*": 5 },
    priority: { keywords: ["pricing"] },
    headers: { "X-A": "b" },
    extraction: "auto",
    extraction_model: "gpt-4o",
    respect_robots: false,
    include_subdomains: true,
    change_tracking: { enabled: true },
    webhook_url: "https://hooks.example/done",
    webhook: { url: "https://hooks.example/ev", events: ["crawl.completed"] },
    output: { type: "webhook_stream", url: "https://hooks.example/s" },
    storage: "s3",
    cache: true,
    cache_ttl: 120,
    force_refresh: true,
    advanced: {
      render_js: "auto",
      screenshot: true,
      wait_for: "#app",
      depth_strategy: "eager",
    },
    cost_controls: { max_credits: 500, max_tier: "3", force_tier: "2" },
  });
});

test("crawl start rejects mutually exclusive extraction options", () => {
  assert.throws(
    () => params.buildCrawlBody("https://x", { extractionAuto: true, extractionSchema: "{}" }),
    /mutually exclusive/,
  );
  assert.throws(
    () =>
      params.buildCrawlBody("https://x", {
        extractionProfile: "article",
        extractionTemplate: "product",
      }),
    /mutually exclusive/,
  );
});

test("crawl resume builds the API body and defaults to retrying failed pages", async () => {
  const defaults = await run(
    { resource: "crawl", crawlOperation: "resume", crawlId: "c1" },
    [ok({ crawl_id: "c1", resumed: 2 })],
  );
  assert.equal(defaults.calls[0].options.method, "POST");
  assert.equal(defaults.calls[0].options.url, "https://api.alterlab.io/api/v1/crawl/c1/resume");
  assert.deepEqual(defaults.calls[0].options.body, {});
  assert.equal(defaults.items[0].crawlId, "c1");

  const custom = await run(
    {
      resource: "crawl",
      crawlOperation: "resume",
      crawlId: "c1",
      crawlResumeOptions: {
        retryCancelled: true,
        additionalUrls: "https://a.example/1, https://a.example/2",
      },
    },
    [ok({})],
  );
  assert.deepEqual(custom.calls[0].options.body, {
    retry_statuses: ["failed", "cancelled"],
    additional_urls: ["https://a.example/1", "https://a.example/2"],
  });

  assert.deepEqual(params.buildCrawlResumeBody({ retryFailed: false }), {
    retry_failed: false,
    retry_statuses: [],
  });
});

test("crawl export requests a text download and emits one item per page", async () => {
  const csv = 'job_id,url,status\nj1,https://a,succeeded\nj2,https://b,succeeded\n';
  const { calls, items } = await run(
    {
      resource: "crawl",
      crawlOperation: "export",
      crawlId: "c1",
      crawlExportOptions: { format: "csv", status: "all", fields: "job_id, url ,status" },
    },
    [ok(csv)],
  );
  const opts = calls[0].options;
  assert.equal(opts.method, "GET");
  assert.equal(opts.url, "https://api.alterlab.io/api/v1/crawl/c1/export");
  assert.deepEqual(opts.qs, { format: "csv", status: "all", fields: "job_id,url,status" });
  assert.equal(opts.json, false);
  assert.equal(opts.encoding, "text");
  assert.deepEqual(items, [
    { job_id: "j1", url: "https://a", status: "succeeded" },
    { job_id: "j2", url: "https://b", status: "succeeded" },
  ]);

  const jsonl = await run(
    { resource: "crawl", crawlOperation: "export", crawlId: "c1", crawlExportOptions: { format: "jsonl" } },
    [ok('{"url":"https://a"}\n{"url":"https://b"}\n')],
  );
  assert.deepEqual(jsonl.items, [{ url: "https://a" }, { url: "https://b" }]);
  assert.deepEqual(jsonl.calls[0].options.qs, { format: "jsonl" });

  const empty = await run(
    { resource: "crawl", crawlOperation: "export", crawlId: "c1" },
    [ok("[]")],
  );
  assert.deepEqual(empty.items, [{ crawlId: "c1", format: "json", status: null, count: 0 }]);
});

test("crawl export surfaces API errors returned as JSON text", async () => {
  await assert.rejects(
    () =>
      run({ resource: "crawl", crawlOperation: "export", crawlId: "gone" }, [
        ok('{"detail":{"error":"crawl_not_found","message":"Crawl not found or expired."}}', 404),
      ]),
    /API error \(404\)/,
  );
});

test("crawl list passes filters and splits crawls into items", async () => {
  const { calls, items } = await run(
    {
      resource: "crawl",
      crawlOperation: "list",
      crawlListFilters: { limit: 5, offset: 10, status: "completed", domain: "example" },
    },
    [ok({ crawls: [{ crawl_id: "a" }, { crawl_id: "b" }], total: 2, limit: 5, offset: 10 })],
  );
  assert.equal(calls[0].options.url, "https://api.alterlab.io/api/v1/crawl");
  assert.deepEqual(calls[0].options.qs, {
    limit: 5,
    offset: 10,
    status: "completed",
    domain: "example",
  });
  assert.deepEqual(items, [{ crawl_id: "a" }, { crawl_id: "b" }]);
});

// ── search / batch / extract ──────────────────────────────────────────

test("search maps engine and safe_search only when non-default", async () => {
  const defaults = await run({ resource: "search", searchQuery: "q" }, [ok({})]);
  assert.deepEqual(defaults.calls[0].options.body, { query: "q" });

  const custom = await run(
    {
      resource: "search",
      searchQuery: "q",
      searchOptions: {
        engine: "google",
        safeSearch: false,
        scrapeResults: true,
        scrapeFormats: ["json_v2", "rag", "content"],
      },
    },
    [ok({})],
  );
  assert.deepEqual(custom.calls[0].options.body, {
    query: "q",
    engine: "google",
    safe_search: false,
    scrape_results: true,
    formats: ["json_v2", "rag", "content"],
  });
});

test("batch submit maps session_id, export config and webhook", async () => {
  const { calls } = await run(
    {
      resource: "batch",
      batchUrls: '[{"url":"https://example.com","advanced":{"block_images":true}}]',
      batchOptions: {
        waitForCompletion: false,
        webhookUrl: "https://hooks.example/b",
        sessionId: "11111111-1111-1111-1111-111111111111",
        exportIntegrationId: "22222222-2222-2222-2222-222222222222",
        exportPrefix: "n8n/",
        exportFormat: "csv",
      },
    },
    [ok({ batch_id: "b1" }, 202)],
  );
  assert.deepEqual(calls[0].options.body, {
    urls: [{ url: "https://example.com", advanced: { block_images: true } }],
    webhook_url: "https://hooks.example/b",
    session_id: "11111111-1111-1111-1111-111111111111",
    export: {
      integration_id: "22222222-2222-2222-2222-222222222222",
      prefix: "n8n/",
      format: "csv",
    },
  });
});

test("batch submit is the default operation for existing workflows", async () => {
  const { calls } = await run(
    {
      resource: "batch",
      batchUrls: '[{"url":"https://example.com"}]',
      batchOptions: { waitForCompletion: false },
    },
    [ok({ batch_id: "b1" }, 202)],
  );
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.url, "https://api.alterlab.io/api/v1/batch");
});

test("batch list uses the plural history endpoint and splits batches", async () => {
  const { calls, items } = await run(
    { resource: "batch", batchOperation: "list", batchListFilters: { limit: 5, offset: 5 } },
    [ok({ batches: [{ batch_id: "b1" }, { batch_id: "b2" }], total: 2 })],
  );
  assert.equal(calls[0].options.url, "https://api.alterlab.io/api/v1/batches");
  assert.deepEqual(calls[0].options.qs, { limit: 5, offset: 5 });
  assert.deepEqual(items, [{ batch_id: "b1" }, { batch_id: "b2" }]);
});

test("extract output flattens content and raw formats", async () => {
  const { items } = await run(
    { resource: "extract", extractContent: "<p>x</p>", extractContentType: "html" },
    [ok({ extract_id: "e1", formats: { content: { body_markdown: "x" }, raw: "<p>x</p>" } })],
  );
  assert.deepEqual(items[0].content, { body_markdown: "x" });
  assert.equal(items[0].raw, "<p>x</p>");
});

// ── node description sanity ───────────────────────────────────────────

test("node exposes new operations and options", () => {
  const props = new AlterLab().description.properties;
  const byName = (n) => props.filter((p) => p.name === n);
  const crawlOps = byName("crawlOperation")[0].options.map((o) => o.value);
  assert.deepEqual(crawlOps.sort(), ["cancel", "export", "list", "resume", "start", "status"]);
  assert.deepEqual(
    byName("batchOperation")[0].options.map((o) => o.value),
    ["submit", "list"],
  );
  const advanced = byName("advancedOptions")[0].options.map((o) => o.name);
  for (const n of ["blockImages", "skipTlsVerification", "actions", "renderJsAuto"]) {
    assert.ok(advanced.includes(n), n);
  }
  const names = new Set();
  for (const p of props) {
    // Option names within a collection must be unique.
    if (p.type === "collection") {
      const inner = p.options.map((o) => o.name);
      assert.equal(new Set(inner).size, inner.length, `duplicate option in ${p.name}`);
    }
    names.add(p.name);
  }
});
