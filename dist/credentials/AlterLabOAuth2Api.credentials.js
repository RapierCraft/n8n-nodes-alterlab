"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlterLabOAuth2Api = void 0;
class AlterLabOAuth2Api {
    constructor() {
        this.name = 'alterLabOAuth2Api';
        this.displayName = 'AlterLab OAuth2 API';
        this.documentationUrl = 'https://docs.alterlab.io/api?utm_source=n8n&utm_medium=integration&utm_campaign=community_node';
        this.extends = ['oAuth2Api'];
        this.properties = [
            {
                displayName: 'Grant Type',
                name: 'grantType',
                type: 'hidden',
                default: 'authorizationCode',
            },
            {
                displayName: 'Authorization URL',
                name: 'authorizationUrl',
                type: 'hidden',
                default: 'https://app.alterlab.io/oauth/authorize',
            },
            {
                displayName: 'Access Token URL',
                name: 'accessTokenUrl',
                type: 'hidden',
                default: 'https://api.alterlab.io/api/v1/oauth/token',
            },
            {
                displayName: 'Client ID',
                name: 'clientId',
                type: 'hidden',
                default: 'n8n-community-node',
            },
            {
                displayName: 'Client Secret',
                name: 'clientSecret',
                type: 'hidden',
                default: 'altrlab_n8n_Kx7mP2vQ9wR4jH6nB3cT5zY8',
            },
            {
                displayName: 'Scope',
                name: 'scope',
                type: 'hidden',
                default: 'scrape',
            },
            {
                displayName: 'Auth URI Query Parameters',
                name: 'authQueryParameters',
                type: 'hidden',
                default: '',
            },
            {
                displayName: 'Authentication',
                name: 'authentication',
                type: 'hidden',
                default: 'body',
            },
        ];
    }
}
exports.AlterLabOAuth2Api = AlterLabOAuth2Api;
//# sourceMappingURL=AlterLabOAuth2Api.credentials.js.map