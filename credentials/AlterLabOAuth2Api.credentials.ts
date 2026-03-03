import type {
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class AlterLabOAuth2Api implements ICredentialType {
	name = 'alterLabOAuth2Api';
	displayName = 'AlterLab OAuth2 API';
	documentationUrl =
		'https://docs.alterlab.io/api?utm_source=n8n&utm_medium=integration&utm_campaign=community_node';

	extends = ['oAuth2Api'];

	properties: INodeProperties[] = [
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

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.alterlab.io',
			url: '/api/v1/usage',
			method: 'GET',
		},
	};
}
