const test = require("node:test");
const assert = require("node:assert/strict");

const { AlterLab } = require("../dist/nodes/AlterLab/AlterLab.node.js");
const { AlterLabApi } = require("../dist/credentials/AlterLabApi.credentials.js");
const {
  DEFAULT_BASE_URL,
  normalizeBaseUrl,
  resolveApiUrl,
  resolvePollUrl,
} = require("../dist/nodes/AlterLab/url.js");

function makeContext({ baseUrl, oauth = false, params = {}, responses = [] } = {}) {
  const calls = [];
  const queuedResponses = [...responses];
  const context = {
    getInputData: () => [{}],
    getNodeParameter(name, _index, defaultValue) {
      return Object.prototype.hasOwnProperty.call(params, name)
        ? params[name]
        : defaultValue;
    },
    async getCredentials(name) {
      if (name === "alterLabOAuth2Api") {
        if (!oauth) throw new Error("OAuth credential is not configured");
        return {};
      }
      return { baseUrl };
    },
    getNode: () => ({ type: "n8n-nodes-alterlab.alterLab" }),
    continueOnFail: () => false,
    helpers: {
      async httpRequestWithAuthentication(authName, options) {
        calls.push({ authName, options });
        return (
          queuedResponses.shift() ?? {
            statusCode: 200,
            body: {},
          }
        );
      },
    },
  };
  return { context, calls };
}

async function execute(params, options = {}) {
  const { context, calls } = makeContext({ params, ...options });
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = (callback, _delay, ...args) =>
    originalSetTimeout(callback, 0, ...args);
  try {
    await new AlterLab().execute.call(context);
  } finally {
    global.setTimeout = originalSetTimeout;
  }
  return calls;
}

function response(body = {}, statusCode = 200, extra = {}) {
  return { statusCode, body, ...extra };
}

const api = DEFAULT_BASE_URL;

test("credential test normalizes a slash before resolving usage", () => {
  const request = new AlterLabApi().test.request;
  assert.ok(request.baseURL.includes(".replace("));
  assert.ok(request.baseURL.includes(" + '/'}}"));
  assert.ok(request.url.includes(".replace("));
  assert.ok(request.url.includes(".endsWith('/api/v1')"));
  assert.ok(request.url.includes("? 'usage' : 'api/v1/usage'"));

  const cases = [
    [undefined, "https://api.alterlab.io/api/v1/usage"],
    ["https://self.example/alterlab", "https://self.example/alterlab/api/v1/usage"],
    ["https://self.example/alterlab/", "https://self.example/alterlab/api/v1/usage"],
    ["https://self.example/alterlab/api/v1", "https://self.example/alterlab/api/v1/usage"],
    ["https://self.example/alterlab/api/v1/", "https://self.example/alterlab/api/v1/usage"],
  ];
  for (const [baseUrl, expected] of cases) {
    const input = baseUrl || "https://api.alterlab.io";
    const withoutTrailingSlashes = input.replace(/\/+$/, "");
    const normalizedBaseURL = `${withoutTrailingSlashes}/`;
    const relativeUrl = withoutTrailingSlashes.endsWith("/api/v1")
      ? "usage"
      : "api/v1/usage";
    const credentialTestUrl = new URL(relativeUrl, normalizedBaseURL).href;
    assert.equal(credentialTestUrl, expected);
    assert.equal(resolveApiUrl(baseUrl, "/api/v1/usage"), expected);
  }
});

test("resolves default, prefixed, and /api/v1 base URLs", () => {
  assert.equal(normalizeBaseUrl("https://api.alterlab.io/"), api);
  assert.equal(
    resolveApiUrl(undefined, "/api/v1/sessions"),
    `${api}/api/v1/sessions`,
  );
  assert.equal(
    resolveApiUrl("https://self.example/alterlab///", "/api/v1/jobs/j1"),
    "https://self.example/alterlab/api/v1/jobs/j1",
  );
  assert.equal(
    resolveApiUrl("https://self.example/alterlab/api/v1/", "/api/v1/jobs/j1"),
    "https://self.example/alterlab/api/v1/jobs/j1",
  );
});

test("keeps same-origin absolute poll URLs and follows URL-reference semantics", () => {
  const base = "https://self.example/alterlab/";
  const submissionUrl = "https://self.example/alterlab/api/v1/jobs/submit";
  assert.equal(
    resolvePollUrl(
      base,
      { body: { poll_url: "https://self.example/alterlab/api/v1/jobs/1" } },
      "/api/v1/jobs/1",
      submissionUrl,
    ),
    "https://self.example/alterlab/api/v1/jobs/1",
  );
  assert.equal(
    resolvePollUrl(
      base,
      { body: { poll_url: "jobs/j1" } },
      "/api/v1/jobs/2",
      "https://self.example/alterlab/api/v1/scrape",
    ),
    "https://self.example/alterlab/api/v1/jobs/j1",
  );
  assert.equal(
    resolvePollUrl(
      base,
      { headers: { Location: "../j2" } },
      "/api/v1/jobs/2",
      submissionUrl,
    ),
    "https://self.example/alterlab/api/v1/j2",
  );
  assert.equal(
    resolvePollUrl(
      base,
      { headers: { Location: "/alterlab/api/v1/jobs/j3" } },
      "/api/v1/jobs/2",
      submissionUrl,
    ),
    "https://self.example/alterlab/api/v1/jobs/j3",
  );
  assert.equal(
    resolvePollUrl(
      DEFAULT_BASE_URL,
      { headers: { Location: "/api/v1/jobs/j4" } },
      "/api/v1/jobs/2",
      `${DEFAULT_BASE_URL}/api/v1/scrape`,
    ),
    `${DEFAULT_BASE_URL}/api/v1/jobs/j4`,
  );
  assert.throws(
    () =>
      resolvePollUrl(
        base,
        { headers: { Location: "../j2" } },
        "/api/v1/jobs/2",
        "https://self.example/alterlab/api/v1/scrape",
      ),
    /outside the configured API origin\/path boundary/,
  );
});

test("rejects unsafe endpoint and poll URLs", () => {
  assert.throws(
    () => resolveApiUrl("javascript:alert(1)", "/api/v1/jobs/1"),
    /http:\/\/ or https:\/\//,
  );
  assert.throws(
    () => resolveApiUrl("https://self.example", "//other.example/jobs/1"),
    /protocol-relative/,
  );
  assert.throws(
    () => resolveApiUrl("https://self.example", "javascript:alert(1)"),
    /http:\/\/ or https:\/\//,
  );
  assert.throws(
    () => normalizeBaseUrl("https://self.example/api?tenant=one"),
    /query strings/,
  );

  const base = "https://self.example/alterlab";
  const reference = `${base}/api/v1/scrape`;
  const fallback = "/api/v1/jobs/j1";
  for (const pollUrl of [
    "https://other.example/alterlab/api/v1/jobs/j1",
    "https://user:secret@self.example/alterlab/api/v1/jobs/j1",
    "//other.example/alterlab/api/v1/jobs/j1",
    "javascript:alert(1)",
    "/alterlab/admin/jobs/j1",
    "../../../admin/jobs/j1",
    "/alterlab/api/v1/%2e%2e/admin/jobs/j1",
  ]) {
    assert.throws(
      () => resolvePollUrl(base, { body: { poll_url: pollUrl } }, fallback, reference),
      /Invalid AlterLab poll URL|outside the configured API origin\/path boundary/,
      pollUrl,
    );
  }
});

test("rejects poll URLs that would leak credentials during API-key and OAuth execution", async () => {
  const params = {
    resource: "scrape",
    operation: "scrape",
    url: "https://example.com",
    mode: "auto",
    outputOptions: { timeout: 1 },
  };
  const initialResponses = [
    response(
      { job_id: "j1", poll_url: "https://attacker.example/api/v1/jobs/j1" },
      202,
    ),
    response({ job_id: "j1" }, 202, {
      headers: { Location: "https://attacker.example/api/v1/jobs/j1" },
    }),
  ];
  for (const initialResponse of initialResponses) {
    for (const oauth of [false, true]) {
      const { context, calls } = makeContext({
        baseUrl: "https://self.example/alterlab",
        oauth,
        params,
        responses: [initialResponse],
      });
      await assert.rejects(
        () => new AlterLab().execute.call(context),
        /outside the configured API origin\/path boundary/,
      );
      assert.equal(calls.length, 1);
      assert.equal(calls[0].authName, oauth ? "alterLabOAuth2Api" : "alterLabApi");
      const expectedBase = oauth
        ? DEFAULT_BASE_URL
        : "https://self.example/alterlab";
      assert.equal(
        calls[0].options.url,
        `${expectedBase}/api/v1/scrape`,
      );
    }
  }
});

test("API-key execution resolves every synchronous operation against the credential base", async () => {
  const cases = [
    {
      name: "session create",
      params: {
        resource: "session",
        sessionOperation: "create",
        sessionName: "session",
        sessionDomain: "example.com",
        sessionCookies: "{}",
      },
      responses: [response()],
      expected: ["/api/v1/sessions"],
    },
    {
      name: "session list",
      params: { resource: "session", sessionOperation: "list" },
      responses: [response({ sessions: [], total: 0 })],
      expected: ["/api/v1/sessions"],
    },
    {
      name: "session get",
      params: { resource: "session", sessionOperation: "get", sessionId: "s1" },
      responses: [response()],
      expected: ["/api/v1/sessions/s1"],
    },
    {
      name: "session update",
      params: { resource: "session", sessionOperation: "update", sessionId: "s1" },
      responses: [response()],
      expected: ["/api/v1/sessions/s1"],
    },
    {
      name: "session delete",
      params: { resource: "session", sessionOperation: "delete", sessionId: "s1" },
      responses: [response()],
      expected: ["/api/v1/sessions/s1"],
    },
    {
      name: "session validate",
      params: { resource: "session", sessionOperation: "validate", sessionId: "s1" },
      responses: [response({})],
      expected: ["/api/v1/sessions/s1/validate"],
    },
    {
      name: "session refresh",
      params: { resource: "session", sessionOperation: "refresh", sessionId: "s1" },
      responses: [response()],
      expected: ["/api/v1/sessions/s1/refresh"],
    },
    {
      name: "crawl status",
      params: { resource: "crawl", crawlOperation: "status", crawlId: "c1" },
      responses: [response()],
      expected: ["/api/v1/crawl/c1"],
    },
    {
      name: "crawl cancel",
      params: { resource: "crawl", crawlOperation: "cancel", crawlId: "c1" },
      responses: [response()],
      expected: ["/api/v1/crawl/c1"],
    },
    {
      name: "map",
      params: { resource: "map", mapUrl: "https://example.com" },
      responses: [response()],
      expected: ["/api/v1/map"],
    },
    {
      name: "extract",
      params: {
        resource: "extract",
        extractContent: "content",
        extractContentType: "text",
      },
      responses: [response({ formats: {} })],
      expected: ["/api/v1/extract"],
    },
    {
      name: "batch without waiting",
      params: {
        resource: "batch",
        batchUrls: "[{\"url\":\"https://example.com\"}]",
        batchOptions: { waitForCompletion: false },
      },
      responses: [response({ batch_id: "b1" })],
      expected: ["/api/v1/batch"],
    },
    {
      name: "cost estimate",
      params: {
        resource: "scrape",
        operation: "estimateCost",
        url: "https://example.com",
        mode: "auto",
      },
      responses: [response()],
      expected: ["/api/v1/scrape/estimate"],
    },
    {
      name: "scrape",
      params: {
        resource: "scrape",
        operation: "scrape",
        url: "https://example.com",
        mode: "auto",
      },
      responses: [response({ status_code: 200, content: "ok" })],
      expected: ["/api/v1/scrape"],
    },
  ];

  for (const testCase of cases) {
    const calls = await execute(testCase.params, {
      baseUrl: "https://self.example/alterlab/",
      responses: testCase.responses,
    });
    assert.deepEqual(
      calls.map(({ authName, options }) => [authName, options.url]),
      testCase.expected.map((path) => ["alterLabApi", `https://self.example/alterlab${path}`]),
      testCase.name,
    );
  }
});

test("API-key execution resolves all operation polling requests", async () => {
  const cases = [
    {
      name: "crawl start and poll",
      params: {
        resource: "crawl",
        crawlOperation: "start",
        crawlUrl: "https://example.com",
        crawlSettings: { pollTimeout: 10 },
      },
      responses: [response({ crawl_id: "c1" }), response({ status: "completed" })],
      expected: ["/api/v1/crawl", "/api/v1/crawl/c1"],
    },
    {
      name: "search and poll",
      params: {
        resource: "search",
        searchQuery: "alterlab",
        searchOptions: { scrapeResults: true },
      },
      responses: [
        response({ status: "scraping", search_id: "s1" }, 202),
        response({ status: "completed" }),
      ],
      expected: ["/api/v1/search", "/api/v1/search/s1"],
    },
    {
      name: "batch submit and poll",
      params: {
        resource: "batch",
        batchUrls: "[{\"url\":\"https://example.com\"}]",
        batchOptions: { waitForCompletion: true, pollTimeout: 10 },
      },
      responses: [response({ batch_id: "b1" }), response({ status: "completed" })],
      expected: ["/api/v1/batch", "/api/v1/batch/b1"],
    },
    {
      name: "async scrape and poll",
      params: {
        resource: "scrape",
        operation: "scrape",
        url: "https://example.com",
        mode: "auto",
        outputOptions: { timeout: 1 },
      },
      responses: [
        response({ job_id: "j1" }, 202),
        response({ status_code: 200, content: "ok" }),
      ],
      expected: ["/api/v1/scrape", "/api/v1/jobs/j1"],
    },
  ];

  for (const testCase of cases) {
    const calls = await execute(testCase.params, {
      baseUrl: "https://self.example/alterlab/",
      responses: testCase.responses,
    });
    assert.deepEqual(
      calls.map(({ options }) => options.url),
      testCase.expected.map((path) => `https://self.example/alterlab${path}`),
      testCase.name,
    );
  }
});

test("uses server-provided absolute and relative scrape poll URLs", async () => {
  const absoluteCalls = await execute(
    {
      resource: "scrape",
      operation: "scrape",
      url: "https://example.com",
      mode: "auto",
      outputOptions: { timeout: 1 },
    },
    {
      baseUrl: "https://self.example/alterlab/",
      responses: [
        response({ job_id: "j1", poll_url: "https://self.example/alterlab/api/v1/jobs/j1" }, 202),
        response({ status_code: 200, content: "ok" }),
      ],
    },
  );
  assert.equal(
    absoluteCalls[1].options.url,
    "https://self.example/alterlab/api/v1/jobs/j1",
  );

  const relativeCalls = await execute(
    {
      resource: "scrape",
      operation: "scrape",
      url: "https://example.com",
      mode: "auto",
      outputOptions: { timeout: 1 },
    },
    {
      baseUrl: "https://self.example/alterlab/",
      responses: [
        response({ job_id: "j1", poll_url: "jobs/j1" }, 202),
        response({ status_code: 200, content: "ok" }),
      ],
    },
  );
  assert.equal(
    relativeCalls[1].options.url,
    "https://self.example/alterlab/api/v1/jobs/j1",
  );
});

test("uses server-provided poll URLs for crawl, search, and batch", async () => {
  const cases = [
    {
      params: {
        resource: "crawl",
        crawlOperation: "start",
        crawlUrl: "https://example.com",
        crawlSettings: { pollTimeout: 10 },
      },
      responses: [
        response({ crawl_id: "c1", poll_url: "https://self.example/alterlab/api/v1/crawl/c1" }),
        response({ status: "completed" }),
      ],
      expected: "https://self.example/alterlab/api/v1/crawl/c1",
    },
    {
      params: {
        resource: "search",
        searchQuery: "alterlab",
        searchOptions: { scrapeResults: true },
      },
      responses: [
        response({ status: "scraping", search_id: "s1", poll_url: "search/s1" }, 202),
        response({ status: "completed" }),
      ],
      expected: "https://self.example/alterlab/api/v1/search/s1",
    },
    {
      params: {
        resource: "batch",
        batchUrls: "[{\"url\":\"https://example.com\"}]",
        batchOptions: { waitForCompletion: true, pollTimeout: 10 },
      },
      responses: [
        response({ batch_id: "b1", poll_url: "https://self.example/alterlab/api/v1/batch/b1" }),
        response({ status: "completed" }),
      ],
      expected: "https://self.example/alterlab/api/v1/batch/b1",
    },
  ];

  for (const testCase of cases) {
    const calls = await execute(testCase.params, {
      baseUrl: "https://self.example/alterlab/",
      responses: testCase.responses,
    });
    assert.equal(calls[1].options.url, testCase.expected);
  }
});

test("preserves OAuth authentication and defaults its cloud base URL", async () => {
  const calls = await execute(
    {
      resource: "map",
      mapUrl: "https://example.com",
    },
    { oauth: true, responses: [response()] },
  );
  assert.deepEqual(
    [calls[0].authName, calls[0].options.url],
    ["alterLabOAuth2Api", `${api}/api/v1/map`],
  );
});

test("returns a clear execution error for an unsafe credential base URL", async () => {
  await assert.rejects(
    () =>
      execute(
        { resource: "map", mapUrl: "https://example.com" },
        { baseUrl: "file:///tmp/alterlab", responses: [] },
      ),
    /Invalid AlterLab Base URL protocol/,
  );
});
