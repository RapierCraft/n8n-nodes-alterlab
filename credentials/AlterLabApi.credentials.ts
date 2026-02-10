import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class AlterLabApi implements ICredentialType {
	name = 'alterLabApi';
	displayName = 'AlterLab API';
	documentationUrl =
		'https://docs.alterlab.io/api?utm_source=n8n&utm_medium=integration&utm_campaign=community_node';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Your AlterLab API key. <a href="https://app.alterlab.io/dashboard/keys?utm_source=n8n&utm_medium=integration&utm_campaign=community_node" target="_blank">Find your API key</a> or <a href="https://app.alterlab.io/signin?redirect=/dashboard/keys&source=n8n&utm_source=n8n&utm_medium=integration&utm_campaign=community_node" target="_blank">sign up free — $1 balance, up to 5,000 scrapes</a>.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://api.alterlab.io',
			description: 'AlterLab API base URL. Only change for self-hosted instances.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'X-API-Key': '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/api/v1/usage',
			method: 'GET',
		},
	};
}
