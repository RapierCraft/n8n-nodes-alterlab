export const DEFAULT_BASE_URL = "https://api.alterlab.io";

const API_PREFIX = "/api/v1";
const POLL_URL_FIELDS = [
  "poll_url",
  "pollUrl",
  "polling_url",
  "pollingUrl",
  "status_url",
  "statusUrl",
  "status_endpoint",
  "statusEndpoint",
  "job_url",
  "jobUrl",
] as const;

type ResponseWithBody = {
  body?: unknown;
  headers?: unknown;
};

type ApiBoundary = {
  origin: string;
  path: string;
};

/**
 * Validate and normalize the API base URL while retaining any self-hosted path
 * prefix. The API path is appended by resolveApiUrl, rather than relying on
 * URL's root-relative resolution (which would discard that prefix).
 */
export function normalizeBaseUrl(value: unknown): string {
  const raw =
    typeof value === "string" && value.trim() ? value.trim() : DEFAULT_BASE_URL;
  const parsed = parseHttpUrl(raw, "Base URL");

  if (parsed.search || parsed.hash) {
    throw new Error(
      "Invalid AlterLab Base URL: query strings and fragments are not supported.",
    );
  }

  // Reject encoded traversal in a credential base URL before retaining its path.
  try {
    canonicalPath(parsed.pathname);
  } catch {
    throw new Error("Invalid AlterLab Base URL path.");
  }

  const path = parsed.pathname.replace(/\/+$/, "");
  return `${parsed.origin}${path}`;
}

/**
 * Resolve an API endpoint against a credential base URL.
 *
 * A base URL may be a host (https://self-hosted.example), a self-hosted path
 * prefix (https://self-hosted.example/alterlab), or already include /api/v1.
 * Absolute endpoint URLs are validated and returned unchanged.
 */
export function resolveApiUrl(baseUrl: unknown, endpoint: string): string {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  if (typeof endpoint !== "string") {
    throw new Error("Invalid AlterLab API endpoint: URL must be a string.");
  }
  const candidate = endpoint.trim();

  if (!candidate) {
    throw new Error("Invalid AlterLab API endpoint: URL cannot be empty.");
  }

  if (hasUrlScheme(candidate)) {
    if (!/^https?:\/\//i.test(candidate)) {
      throw new Error(
        "Invalid AlterLab API endpoint: use an absolute http:// or https:// URL.",
      );
    }

    parseHttpUrl(candidate, "API endpoint");
    return candidate;
  }

  if (/^[\\/]{2}/.test(candidate) || candidate.includes("\\")) {
    throw new Error(
      "Invalid AlterLab API endpoint: protocol-relative URLs are not supported.",
    );
  }

  const base = new URL(normalizedBase);
  const basePath = base.pathname.replace(/\/+$/, "");
  let endpointPath = candidate.startsWith("/") ? candidate : `/${candidate}`;

  // Credentials occasionally contain the API prefix. Do not append it twice
  // when callers pass the canonical /api/v1/... endpoint paths.
  if (basePath === API_PREFIX || basePath.endsWith(API_PREFIX)) {
    if (endpointPath === API_PREFIX) {
      endpointPath = "/";
    } else if (endpointPath.startsWith(`${API_PREFIX}/`)) {
      endpointPath = endpointPath.slice(API_PREFIX.length);
    }
  }

  const endpointWithoutLeadingSlash = endpointPath.replace(/^\/+/, "");
  const joinedPath = endpointWithoutLeadingSlash
    ? `${basePath}/${endpointWithoutLeadingSlash}`
    : basePath || "/";
  const resolved = new URL(joinedPath, base.origin);
  assertWithinApiBoundary(resolved, getApiBoundary(normalizedBase));
  return resolved.href;
}

/**
 * Resolve a server-provided polling URL. Relative references use the actual
 * request URL as their base, following WHATWG URL-reference semantics. Every
 * result must remain on the configured origin and below its /api/v1 path
 * boundary so n8n never sends credentials to an untrusted poll endpoint.
 */
export function resolvePollUrl(
  baseUrl: unknown,
  response: unknown,
  fallbackEndpoint: string,
  referenceUrl?: string,
): string {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  const boundary = getApiBoundary(normalizedBase);
  const candidate = getPollUrl(response);

  if (candidate === undefined) {
    if (hasUrlScheme(fallbackEndpoint)) {
      return resolvePollCandidate(boundary, fallbackEndpoint, fallbackEndpoint);
    }
    return resolveApiUrl(normalizedBase, fallbackEndpoint);
  }

  const reference = referenceUrl ?? resolveApiUrl(normalizedBase, fallbackEndpoint);
  return resolvePollCandidate(boundary, candidate, reference);
}

function resolvePollCandidate(
  boundary: ApiBoundary,
  candidateValue: string,
  referenceValue: string,
): string {
  const candidate = candidateValue.trim();
  if (!candidate) {
    throw new Error("Invalid AlterLab poll URL: URL cannot be empty.");
  }

  if (/^[\\/]{2}/.test(candidate)) {
    throw new Error(
      "Invalid AlterLab poll URL: protocol-relative URLs are not supported.",
    );
  }

  if (hasUrlScheme(candidate)) {
    if (!/^https?:\/\//i.test(candidate)) {
      throw new Error(
        "Invalid AlterLab poll URL: use an absolute http:// or https:// URL.",
      );
    }

    const parsed = parseHttpUrl(candidate, "poll URL");
    assertWithinApiBoundary(parsed, boundary);
    return candidate;
  }

  if (candidate.includes("\\")) {
    throw new Error(
      "Invalid AlterLab poll URL: backslash URL references are not supported.",
    );
  }

  const reference = parseHttpUrl(referenceValue, "poll URL reference");
  assertWithinApiBoundary(reference, boundary);

  let resolved: URL;
  try {
    resolved = new URL(candidate, reference);
  } catch {
    throw new Error(`Invalid AlterLab poll URL reference: ${candidate}.`);
  }

  if (resolved.username || resolved.password) {
    throw new Error(
      "Invalid AlterLab poll URL: embedded credentials are not supported.",
    );
  }
  assertWithinApiBoundary(resolved, boundary);
  return resolved.href;
}

function getApiBoundary(baseUrl: string): ApiBoundary {
  const base = new URL(baseUrl);
  const basePath = base.pathname.replace(/\/+$/, "");
  const deploymentPath =
    basePath === API_PREFIX
      ? ""
      : basePath.endsWith(API_PREFIX)
        ? basePath.slice(0, -API_PREFIX.length)
        : basePath;
  const path = `${deploymentPath}/${API_PREFIX.replace(/^\//, "")}`;
  return { origin: base.origin, path: path === "" ? "/" : path };
}

function assertWithinApiBoundary(url: URL, boundary: ApiBoundary): void {
  if (url.origin !== boundary.origin) {
    throw new Error(
      "Invalid AlterLab poll URL: URL is outside the configured API origin/path boundary.",
    );
  }

  let path: string;
  try {
    path = canonicalPath(url.pathname);
  } catch {
    throw new Error("Invalid AlterLab poll URL path.");
  }
  const boundaryPath = canonicalPath(boundary.path);
  if (path !== boundaryPath && !path.startsWith(`${boundaryPath}/`)) {
    throw new Error(
      "Invalid AlterLab poll URL: URL is outside the configured API origin/path boundary.",
    );
  }
}

function canonicalPath(pathname: string): string {
  let decoded = pathname;
  try {
    // Decode more than once so double-encoded dot/slash segments cannot evade
    // the boundary check before a proxy or server decodes them.
    for (let i = 0; i < 3; i++) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
  } catch {
    throw new Error("Invalid URL path encoding.");
  }

  const segments = decoded.replace(/\\/g, "/").split("/");
  const normalized: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (normalized.length === 0) {
        throw new Error("URL path escapes its root.");
      }
      normalized.pop();
      continue;
    }
    normalized.push(segment);
  }
  return `/${normalized.join("/")}`;
}

function parseHttpUrl(value: string, label: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(
      `Invalid AlterLab ${label}: ${value}. Use an absolute http:// or https:// URL.`,
    );
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== "http:" && protocol !== "https:") {
    throw new Error(
      `Invalid AlterLab ${label} protocol: ${parsed.protocol}. Use http:// or https://.`,
    );
  }
  if (!parsed.hostname || parsed.username || parsed.password) {
    throw new Error(
      `Invalid AlterLab ${label}: include an http:// or https:// URL without embedded credentials.`,
    );
  }
  return parsed;
}

function hasUrlScheme(value: string): boolean {
  return /^[a-z][a-z\d+.-]*:/i.test(value);
}

function getPollUrl(response: unknown): string | undefined {
  if (!response || typeof response !== "object") return undefined;

  const fullResponse = response as ResponseWithBody;
  const body =
    fullResponse.body && typeof fullResponse.body === "object"
      ? (fullResponse.body as Record<string, unknown>)
      : (response as Record<string, unknown>);

  for (const field of POLL_URL_FIELDS) {
    const value = body[field];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  const headers = fullResponse.headers;
  if (headers && typeof headers === "object") {
    const headerRecord = headers as Record<string, unknown>;
    for (const key of Object.keys(headerRecord)) {
      if (key.toLowerCase() === "location") {
        const value = headerRecord[key];
        if (typeof value === "string" && value.trim()) return value.trim();
      }
    }
  }

  return undefined;
}
