import type {
  ICredentialTestRequest,
  ICredentialType,
  INodeProperties,
} from "n8n-workflow";

/**
 * AlterLab OAuth2 (Authorization Code + PKCE, public client).
 *
 * The credential extends n8n's built-in `oAuth2Api`, so every override below
 * MUST use the inherited property names (`authUrl`, `accessTokenUrl`,
 * `clientId`, ...). An override under any other name leaves the inherited
 * field visible and blank (ALT-80 / #46).
 *
 * No secret is shipped in this package. Self-hosted n8n callback URLs differ
 * per instance, so the default path uses OAuth 2.0 Dynamic Client Registration
 * (RFC 7591): n8n reads AlterLab's discovery document, registers a public
 * client for this instance's own callback URL and runs PKCE (S256). Users who
 * cannot use dynamic registration switch it off and paste a client ID obtained
 * from `POST /api/v1/oauth/register` (see README).
 */

export const ALTERLAB_API_URL = "https://api.alterlab.io";
/** Browser-facing authorization route (a GET; the API route of the same name is POST-only on older deployments). */
export const ALTERLAB_AUTHORIZE_URL = "https://alterlab.io/oauth/authorize";
export const ALTERLAB_TOKEN_URL = `${ALTERLAB_API_URL}/api/v1/oauth/token`;
/** Scope vocabulary of the AlterLab authorization server (`scopes_supported`). */
export const ALTERLAB_OAUTH_SCOPES = ["scrape", "read", "write", "billing"];
/**
 * `scrape` grants the read+write API permissions every node operation needs
 * (including Account > Get Balance, which is not scope-gated). Manual
 * registrations should request only this; dynamic registration requests the
 * full `scopes_supported` list because n8n does so itself.
 */
export const ALTERLAB_DEFAULT_SCOPE = "scrape";

export class AlterLabOAuth2Api implements ICredentialType {
  name = "alterLabOAuth2Api";
  displayName = "AlterLab OAuth2 API";
  documentationUrl =
    "https://docs.alterlab.io/api?utm_source=n8n&utm_medium=integration&utm_campaign=community_node";

  extends = ["oAuth2Api"];

  properties: INodeProperties[] = [
    {
      displayName: "Register Client Automatically",
      name: "useDynamicClientRegistration",
      type: "boolean",
      default: true,
      description:
        "Whether n8n registers itself with AlterLab for this instance's callback URL (OAuth Dynamic Client Registration). Turn off only to use a client ID you registered yourself, see the package README.",
    },
    {
      displayName: "Server URL",
      name: "serverUrl",
      type: "hidden",
      default: ALTERLAB_API_URL,
    },
    {
      displayName: "Grant Type",
      name: "grantType",
      type: "hidden",
      default: "pkce",
    },
    {
      displayName: "Authorization URL",
      name: "authUrl",
      type: "hidden",
      default: ALTERLAB_AUTHORIZE_URL,
    },
    {
      displayName: "Access Token URL",
      name: "accessTokenUrl",
      type: "hidden",
      default: ALTERLAB_TOKEN_URL,
    },
    {
      displayName: "Client ID",
      name: "clientId",
      type: "string",
      default: "",
      required: true,
      displayOptions: {
        show: { useDynamicClientRegistration: [false] },
      },
      description:
        "The client_id returned by POST /api/v1/oauth/register for this n8n instance's callback URL",
    },
    {
      displayName: "Client Secret",
      name: "clientSecret",
      type: "string",
      typeOptions: { password: true },
      default: "",
      displayOptions: {
        show: { useDynamicClientRegistration: [false] },
      },
      description:
        "Leave empty. AlterLab clients registered with token_endpoint_auth_method=none are public and use PKCE instead of a secret",
    },
    {
      displayName: "Scope",
      name: "scope",
      type: "hidden",
      default: ALTERLAB_DEFAULT_SCOPE,
    },
    {
      displayName: "Auth URI Query Parameters",
      name: "authQueryParameters",
      type: "hidden",
      default: "",
    },
    {
      // Public client: no client secret is sent, so credentials in the
      // Authorization header (the n8n default) are never produced.
      displayName: "Authentication",
      name: "authentication",
      type: "hidden",
      default: "header",
    },
  ];

  // GET /api/v1/auth/identity accepts X-API-Key, Bearer sk_ and Bearer alo_at_
  // (OAuth) credentials, spends no credits and does not need a scope.
  test: ICredentialTestRequest = {
    request: {
      baseURL: ALTERLAB_API_URL,
      url: "/api/v1/auth/identity",
      method: "GET",
    },
  };
}
