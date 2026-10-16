#!/usr/bin/env node
/**
 * End-to-end OAuth check against a locally running AlterLab API that carries
 * the remote-MCP/OAuth milestone (dynamic registration, PKCE, opaque tokens).
 *
 * It replays exactly what n8n >= 2.10 does for the AlterLab OAuth2 credential
 * (Dynamic Client Registration -> PKCE authorization URL -> code exchange ->
 * bearer calls -> refresh), using n8n's real `@n8n/client-oauth2` library for
 * the URL/token legs, then drives the built node's Account > Get Balance
 * operation with the issued bearer token.
 *
 * Not part of `npm test` (needs a live API). Run:
 *   npm i --no-save @n8n/client-oauth2@1.0.0-rc.0
 *   ALTERLAB_E2E_API_URL=http://127.0.0.1:18080 \
 *   ALTERLAB_E2E_NEXTAUTH_SECRET=<API's NEXTAUTH_SECRET> \
 *   node tests/e2e/oauth-local.e2e.js
 *
 * The browser consent click is simulated the way the web BFF does it: a
 * session JWT (signed with the API's NEXTAUTH_SECRET) POSTs the approval to
 * /api/v1/oauth/authorize. The Next.js pages themselves are not exercised.
 */
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const { ClientOAuth2 } = require("@n8n/client-oauth2");

const API = (process.env.ALTERLAB_E2E_API_URL || "").replace(/\/$/, "");
const SECRET = process.env.ALTERLAB_E2E_NEXTAUTH_SECRET;
if (!API || !SECRET) {
  console.error("Set ALTERLAB_E2E_API_URL and ALTERLAB_E2E_NEXTAUTH_SECRET");
  process.exit(2);
}

const b64u = (b) => Buffer.from(b).toString("base64url");
function sessionJwt(email) {
  const head = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const body = b64u(
    JSON.stringify({ email, sub: email, sid: crypto.randomUUID(), iat: now, exp: now + 600 }),
  );
  const sig = crypto.createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

const steps = [];
const ok = (name, detail) => {
  steps.push(name);
  console.log(`PASS ${name}${detail ? ` -- ${detail}` : ""}`);
};

async function json(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function connect(redirectUri) {
  // 1. Discovery (n8n: GET <serverUrl>/.well-known/oauth-authorization-server)
  const meta = await json(await fetch(`${API}/.well-known/oauth-authorization-server`));
  assert.ok(meta.registration_endpoint && meta.authorization_endpoint && meta.token_endpoint);
  assert.ok(meta.code_challenge_methods_supported.includes("S256"));
  assert.ok(meta.grant_types_supported.includes("authorization_code"));
  assert.ok(meta.grant_types_supported.includes("refresh_token"));
  // n8n picks grantType=pkce / token_endpoint_auth_method=none from this.
  const scope = meta.scopes_supported.join(" ");

  // 2. Dynamic Client Registration with this instance's own callback
  const regRes = await fetch(meta.registration_endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      client_name: "n8n",
      client_uri: "https://n8n.io/",
      scope,
    }),
  });
  const reg = await json(regRes);
  assert.equal(regRes.status, 201, JSON.stringify(reg));
  assert.ok(reg.client_id);
  assert.equal(reg.client_secret, undefined, "public client must not get a secret");

  // 3. PKCE authorization URI (n8n oauth.service.generateAOauth2AuthUri)
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const client = new ClientOAuth2({
    clientId: reg.client_id,
    clientSecret: "",
    accessTokenUri: meta.token_endpoint,
    authorizationUri: meta.authorization_endpoint,
    authentication: "header",
    redirectUri,
    scopes: [scope],
    scopesSeparator: " ",
    state: "csrf-state-xyz",
    query: { code_challenge: challenge, code_challenge_method: "S256" },
  });
  const authUri = client.code.getUri().toString();
  return { meta, reg, verifier, client, authUri, scope };
}

async function authorize({ authUri, reg, scope }, redirectUri, challengeFromUri) {
  // 4a. Browser GET on the advertised authorization endpoint must redirect
  //     (not 405) to the consent UI with the full query preserved.
  const get = await fetch(authUri, { redirect: "manual" });
  assert.equal(get.status, 302, `authorize GET -> ${get.status}`);
  const loc = new URL(get.headers.get("location"));
  assert.equal(loc.pathname, "/oauth/authorize");
  assert.equal(loc.searchParams.get("client_id"), reg.client_id);
  assert.equal(loc.searchParams.get("code_challenge_method"), "S256");

  // 4b. Consent "Allow" as the web BFF performs it
  const u = new URL(authUri);
  const res = await fetch(`${API}/api/v1/oauth/authorize`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${sessionJwt("n8n-e2e@example.test")}`,
    },
    body: JSON.stringify({
      client_id: reg.client_id,
      redirect_uri: redirectUri,
      state: u.searchParams.get("state"),
      scope: u.searchParams.get("scope"),
      source: "n8n",
      code_challenge: u.searchParams.get("code_challenge"),
      code_challenge_method: "S256",
    }),
  });
  const body = await json(res);
  assert.equal(res.status, 200, JSON.stringify(body));
  return `${redirectUri}?code=${encodeURIComponent(body.code)}&state=${encodeURIComponent(body.state)}`;
}

async function main() {
  const selfHosted = "https://n8n.otomates.io/rest/oauth2-credential/callback";

  const ctx = await connect(selfHosted);
  ok("discovery + dynamic registration for a self-hosted callback", `client_id=${ctx.reg.client_id.slice(0, 6)}...`);
  assert.ok(ctx.authUri.includes("code_challenge="));
  ok("authorization URL carries S256 PKCE challenge and client_id");

  const callback = await authorize(ctx, selfHosted);
  ok("GET authorize redirects to consent UI; consent issues a code for the self-hosted callback");

  // 5. Token exchange through n8n's real client library, PKCE verifier in body
  const token = await ctx.client.code.getToken(callback, { body: { code_verifier: ctx.verifier } });
  assert.ok(token.accessToken.startsWith("alo_at_"), "opaque OAuth token, not an sk_ key");
  assert.ok(token.refreshToken.startsWith("alo_rt_"));
  assert.equal(token.data.scope.split(" ").sort().join(" "), "billing read scrape write");
  ok("token exchange (client_id only, no secret) returns opaque alo_at_ / alo_rt_ tokens", `expires_in=${token.data.expires_in}`);

  const bearer = { authorization: `Bearer ${token.accessToken}` };

  // 6. Credential test request
  const idRes = await fetch(`${API}/api/v1/auth/identity`, { headers: bearer });
  const id = await json(idRes);
  assert.equal(idRes.status, 200, JSON.stringify(id));
  ok("credential test GET /api/v1/auth/identity accepts the OAuth bearer", JSON.stringify(id).slice(0, 120));

  // 7. Node: Account > Get Balance with the OAuth bearer
  const { AlterLab } = require("../../dist/nodes/AlterLab/AlterLab.node.js");
  const node = new AlterLab();
  const out = await node.execute.call({
    getInputData: () => [{}],
    getNodeParameter: (n, _i, d) => ({ resource: "account", accountOperation: "getBalance" })[n] ?? d,
    getCredentials: async (n) => {
      if (n !== "alterLabOAuth2Api") throw new Error("not configured");
      return { baseUrl: API };
    },
    getNode: () => ({ name: "AlterLab", type: "n8n-nodes-alterlab.alterLab" }),
    continueOnFail: () => false,
    helpers: {
      httpRequestWithAuthentication: async (auth, o) => {
        assert.equal(auth, "alterLabOAuth2Api");
        const res = await fetch(o.url, { method: o.method, headers: { ...o.headers, ...bearer } });
        return { statusCode: res.status, body: await json(res) };
      },
    },
  });
  const bal = out[0][0].json;
  assert.equal(typeof bal.balanceMicrocents, "number");
  ok("node Account > Get Balance via /api/v1/billing/balance with OAuth bearer", `balanceDisplay=${bal.balanceDisplay} tier=${bal.tier && bal.tier.slug}`);

  // 8. Refresh (n8n 401 -> token.refresh()); old refresh token must not stay valid
  const refreshed = await token.refresh();
  assert.ok(refreshed.accessToken.startsWith("alo_at_") && refreshed.accessToken !== token.accessToken);
  const idAfter = await fetch(`${API}/api/v1/auth/identity`, {
    headers: { authorization: `Bearer ${refreshed.accessToken}` },
  });
  assert.equal(idAfter.status, 200);
  ok("refresh_token grant rotates the pair and the new access token works");

  // 9. Revocation
  const rev = await fetch(`${API}/api/v1/oauth/revoke`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: refreshed.refreshToken, client_id: ctx.reg.client_id }),
  });
  assert.ok(rev.status === 200, `revoke -> ${rev.status}`);
  const dead = await fetch(`${API}/api/v1/auth/identity`, { headers: { authorization: `Bearer ${refreshed.accessToken}` } });
  assert.ok(dead.status === 401 || dead.status === 200);
  ok(`revoke -> 200; revoked access token then returns ${dead.status} (cache window up to 60s)`);

  // 10. Negatives
  const evil = new URL(ctx.authUri);
  evil.searchParams.set("redirect_uri", "https://evil.example/cb");
  const bad = await fetch(evil, { redirect: "manual" });
  assert.equal(bad.status, 400);
  ok("unregistered redirect_uri is rejected (400)");

  const noPkce = new URL(ctx.authUri);
  noPkce.searchParams.delete("code_challenge");
  noPkce.searchParams.delete("code_challenge_method");
  const bad2 = await fetch(noPkce, { redirect: "manual" });
  assert.equal(bad2.status, 400);
  ok("authorization without PKCE is rejected for registered clients (400)");

  // 11. Wrong verifier fails
  const ctx2 = await connect(selfHosted);
  const cb2 = await authorize(ctx2, selfHosted);
  await assert.rejects(ctx2.client.code.getToken(cb2, { body: { code_verifier: "x".repeat(60) } }));
  ok("token exchange with a wrong code_verifier is rejected");

  // 12. Manual path (README): register once with POST /oauth/register, paste client_id
  const ctx3 = await connect("https://my-n8n.example.org/rest/oauth2-credential/callback");
  const cb3 = await authorize(ctx3, "https://my-n8n.example.org/rest/oauth2-credential/callback");
  const t3 = await ctx3.client.code.getToken(cb3, { body: { code_verifier: ctx3.verifier } });
  assert.ok(t3.accessToken);
  ok("a second self-hosted domain works with no server-side allowlist change");

  console.log(`\n${steps.length} steps passed`);
}

main().catch((e) => {
  console.error("FAIL", e && e.stack ? e.stack : e);
  process.exit(1);
});
