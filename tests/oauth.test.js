const test = require("node:test");
const assert = require("node:assert/strict");

const {
  AlterLabOAuth2Api,
  ALTERLAB_AUTHORIZE_URL,
  ALTERLAB_TOKEN_URL,
  ALTERLAB_OAUTH_SCOPES,
} = require("../dist/credentials/AlterLabOAuth2Api.credentials.js");
const { AlterLabApi } = require("../dist/credentials/AlterLabApi.credentials.js");
const { AlterLab } = require("../dist/nodes/AlterLab/AlterLab.node.js");
const { formatBalanceResponse } = require("../dist/nodes/AlterLab/params.js");
const inherited = require("./fixtures/n8n-oauth2api-properties.json").properties;

const cred = new AlterLabOAuth2Api();
const byName = Object.fromEntries(cred.properties.map((p) => [p.name, p]));

/** Mirror of n8n's merge: parent properties first, same-name child properties replace them. */
function mergedProperties() {
  const merged = new Map(inherited.map((p) => [p.name, p]));
  for (const p of cred.properties) merged.set(p.name, p);
  return [...merged.values()];
}

function isVisible(prop, values) {
  const show = prop.displayOptions?.show ?? {};
  return Object.entries(show).every(([key, allowed]) => allowed.includes(values[key]));
}

function values(overrides = {}) {
  const v = {};
  for (const p of mergedProperties()) v[p.name] = p.default;
  return { ...v, ...overrides };
}

test("every override uses a property name inherited from n8n's oAuth2Api (ALT-80)", () => {
  const inheritedNames = new Set(inherited.map((p) => p.name));
  for (const p of cred.properties) {
    assert.ok(inheritedNames.has(p.name), `${p.name} is not an inherited oAuth2Api property`);
  }
  assert.equal(byName.authorizationUrl, undefined, "authorizationUrl is not an n8n property; use authUrl");
  assert.ok(byName.authUrl && byName.accessTokenUrl);
});

test("credential extends oAuth2Api and defaults to PKCE with canonical URLs", () => {
  assert.deepEqual(cred.extends, ["oAuth2Api"]);
  assert.equal(byName.grantType.default, "pkce");
  assert.equal(byName.authUrl.default, "https://alterlab.io/oauth/authorize");
  assert.equal(ALTERLAB_AUTHORIZE_URL, byName.authUrl.default);
  assert.equal(byName.accessTokenUrl.default, "https://api.alterlab.io/api/v1/oauth/token");
  assert.equal(ALTERLAB_TOKEN_URL, byName.accessTokenUrl.default);
  assert.equal(byName.authentication.default, "header");
  for (const hidden of ["authUrl", "accessTokenUrl", "grantType", "scope", "serverUrl"]) {
    assert.equal(byName[hidden].type, "hidden", `${hidden} must not be user-editable`);
  }
  assert.ok(!/app\.alterlab\.io\/oauth/.test(JSON.stringify(cred.properties)));
});

test("no secret is shipped in the public package", () => {
  assert.equal(byName.clientSecret.default, "");
  assert.equal(byName.clientId.default, "");
  const source = require("node:fs").readFileSync(
    require.resolve("../dist/credentials/AlterLabOAuth2Api.credentials.js"),
    "utf8",
  );
  assert.ok(!/altrlab_n8n|n8n-community-node/.test(source), "legacy shared client/secret removed");
  assert.ok(!/client_?secret\s*[:=]\s*["'][^"']+["']/i.test(source));
});

test("scopes come from the backend vocabulary", () => {
  assert.deepEqual([...ALTERLAB_OAUTH_SCOPES].sort(), ["billing", "read", "scrape", "write"]);
  for (const s of byName.scope.default.split(" ")) assert.ok(ALTERLAB_OAUTH_SCOPES.includes(s), s);
  assert.equal(byName.scope.default, "scrape", "least privilege: read+write only");
});

test("default UI: automatic registration, no inherited blank required field is visible", () => {
  const v = values();
  assert.equal(v.useDynamicClientRegistration, true);
  const visibleRequired = mergedProperties().filter(
    (p) => p.type !== "hidden" && isVisible(p, v) && p.required && !p.default,
  );
  assert.deepEqual(visibleRequired.map((p) => p.name), []);
  const visibleNames = mergedProperties()
    .filter((p) => p.type !== "hidden" && isVisible(p, v))
    .map((p) => p.name);
  assert.ok(!visibleNames.includes("authUrl"), "inherited Authorization URL must not be shown blank");
  assert.ok(!visibleNames.includes("accessTokenUrl"));
  assert.ok(visibleNames.includes("useDynamicClientRegistration"));
});

test("manual mode asks only for client id (secret optional), not URLs", () => {
  const v = values({ useDynamicClientRegistration: false });
  const visible = mergedProperties()
    .filter((p) => p.type !== "hidden" && isVisible(p, v))
    .map((p) => p.name);
  assert.ok(visible.includes("clientId"));
  assert.ok(visible.includes("clientSecret"));
  assert.ok(!visible.includes("authUrl") && !visible.includes("accessTokenUrl"));
  assert.notEqual(byName.clientSecret.required, true, "public PKCE client has no secret");
});

test("OAuth credential test is valid for OAuth bearer tokens", () => {
  const request = cred.test.request;
  assert.equal(request.method, "GET");
  assert.equal(request.baseURL, "https://api.alterlab.io");
  assert.equal(request.url, "/api/v1/auth/identity");
  assert.ok(!request.url.includes("usage"));
});

test("API-key credential stays the unchanged default", () => {
  const apiKey = new AlterLabApi();
  assert.equal(apiKey.name, "alterLabApi");
  assert.equal(apiKey.authenticate.properties.headers["X-API-Key"], "={{$credentials.apiKey}}");
  assert.equal(apiKey.properties.find((p) => p.name === "baseUrl").default, "https://api.alterlab.io");
  const creds = new AlterLab().description.credentials.map((c) => c.name);
  assert.deepEqual(creds, ["alterLabApi", "alterLabOAuth2Api"]);
});

test("package manifest registers both credentials", () => {
  const pkg = require("../package.json");
  assert.deepEqual(pkg.n8n.credentials, [
    "dist/credentials/AlterLabApi.credentials.js",
    "dist/credentials/AlterLabOAuth2Api.credentials.js",
  ]);
});

// ── Account > Get Balance ────────────────────────────────────────────

const balanceBody = {
  balance_microcents: 12_345_678,
  balance_display: "$12.34",
  total_deposited_cents: 2000,
  total_spent_cents: 800,
  total_granted_cents: 100,
  tier: {
    name: "Starter",
    slug: "starter",
    requests_per_minute: 60,
    concurrent_requests: 5,
    floor_cents: 500,
    next_tier: null,
    at_risk: false,
    at_risk_threshold: 0.15,
  },
  auto_recharge: { enabled: true, threshold_display: "$5.00", recharge_display: "$20.00" },
};

test("formatBalanceResponse flattens the balance route", () => {
  const out = formatBalanceResponse(balanceBody);
  assert.equal(out.balanceMicrocents, 12_345_678);
  assert.equal(out.balanceUsd, 12.34);
  assert.equal(out.balanceDisplay, "$12.34");
  assert.equal(out.totalDepositedCents, 2000);
  assert.deepEqual(out.tier, {
    name: "Starter",
    slug: "starter",
    requestsPerMinute: 60,
    concurrentRequests: 5,
    floorCents: 500,
    atRisk: false,
  });
  assert.deepEqual(out.autoRecharge, {
    enabled: true,
    thresholdDisplay: "$5.00",
    rechargeDisplay: "$20.00",
  });
  assert.equal(formatBalanceResponse({}).balanceUsd, 0);
});

async function runBalance({ oauth, statusCode = 200, body = balanceBody }) {
  const calls = [];
  const context = {
    getInputData: () => [{}],
    getNodeParameter: (name, _i, d) =>
      ({ resource: "account", accountOperation: "getBalance" })[name] ?? d,
    async getCredentials(name) {
      if (name === "alterLabOAuth2Api" && !oauth) throw new Error("not configured");
      return {};
    },
    getNode: () => ({ type: "n8n-nodes-alterlab.alterLab", name: "AlterLab" }),
    continueOnFail: () => false,
    helpers: {
      async httpRequestWithAuthentication(authName, options) {
        calls.push({ authName, options });
        return { statusCode, body };
      },
    },
  };
  const out = await new AlterLab().execute.call(context);
  return { out, calls };
}

for (const oauth of [false, true]) {
  test(`Account > Get Balance calls GET /api/v1/billing/balance (${oauth ? "OAuth2" : "API key"})`, async () => {
    const { out, calls } = await runBalance({ oauth });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].authName, oauth ? "alterLabOAuth2Api" : "alterLabApi");
    assert.equal(calls[0].options.method, "GET");
    assert.equal(calls[0].options.url, "https://api.alterlab.io/api/v1/billing/balance");
    assert.match(calls[0].options.headers["X-AlterLab-Source"], /^n8n-node\//);
    assert.equal(out[0][0].json.balanceUsd, 12.34);
  });
}

test("Account > Get Balance surfaces API errors", async () => {
  await assert.rejects(
    runBalance({ oauth: true, statusCode: 401, body: { detail: "Invalid or expired OAuth access token" } }),
    /Invalid API key|401/,
  );
});

test("Account resource and operation are exposed", () => {
  const props = new AlterLab().description.properties;
  const resource = props.find((p) => p.name === "resource");
  assert.ok(resource.options.some((o) => o.value === "account"));
  const op = props.find((p) => p.name === "accountOperation");
  assert.deepEqual(op.options.map((o) => o.value), ["getBalance"]);
});
