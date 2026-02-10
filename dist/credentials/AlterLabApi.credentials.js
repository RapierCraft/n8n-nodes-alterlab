"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlterLabApi = void 0;
class AlterLabApi {
    constructor() {
        this.name = 'alterLabApi';
        this.displayName = 'AlterLab API';
        this.documentationUrl = 'https://docs.alterlab.io/api?utm_source=n8n&utm_medium=integration&utm_campaign=community_node';
        this.properties = [
            {
                displayName: 'API Key',
                name: 'apiKey',
                type: 'string',
                typeOptions: { password: true },
                default: '',
                required: true,
                description: 'Your AlterLab API key. <a href="https://app.alterlab.io/dashboard/keys?utm_source=n8n&utm_medium=integration&utm_campaign=community_node" target="_blank">Find your API key</a> or <a href="https://app.alterlab.io/signin?redirect=/dashboard/keys&source=n8n&utm_source=n8n&utm_medium=integration&utm_campaign=community_node" target="_blank">sign up free — $1 balance, up to 5,000 scrapes</a>.',
            },
            {
                displayName: 'Base URL',
                name: 'baseUrl',
                type: 'string',
                default: 'https://api.alterlab.io',
                description: 'AlterLab API base URL. Only change for self-hosted instances.',
            },
        ];
        this.authenticate = {
            type: 'generic',
            properties: {
                headers: {
                    'X-API-Key': '={{$credentials.apiKey}}',
                },
            },
        };
        this.test = {
            request: {
                baseURL: '={{$credentials.baseUrl}}',
                url: '/api/v1/usage',
                method: 'GET',
            },
        };
    }
}
exports.AlterLabApi = AlterLabApi;
//# sourceMappingURL=AlterLabApi.credentials.js.map