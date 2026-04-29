export interface JiaoxuePlatformClientOptions {
  baseUrl: string;
  appId: string;
  appSecret?: string;
  fetcher?: typeof fetch;
}

export interface BuildAuthorizeUrlInput {
  redirectUri: string;
  state?: string;
  scope?: string;
}

export interface ExchangeCodeInput {
  code: string;
  redirectUri: string;
  appSecret?: string;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: {
    id: string;
    username: string;
    email: string;
    displayName: string | null;
    isPlatformAdmin: boolean;
  };
}

export class JiaoxuePlatformClient {
  private readonly baseUrl: string;
  private readonly appId: string;
  private readonly appSecret?: string;
  private readonly fetcher: typeof fetch;

  constructor(options: JiaoxuePlatformClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.appId = options.appId;
    this.appSecret = options.appSecret;
    this.fetcher = options.fetcher ?? fetch;
  }

  buildAuthorizeUrl(input: BuildAuthorizeUrlInput): string {
    const url = new URL(`${this.baseUrl}/api/v1/auth/authorize`);
    url.searchParams.set('appId', this.appId);
    url.searchParams.set('redirectUri', input.redirectUri);

    if (input.state) {
      url.searchParams.set('state', input.state);
    }

    if (input.scope) {
      url.searchParams.set('scope', input.scope);
    }

    return url.toString();
  }

  async exchangeCode(input: ExchangeCodeInput): Promise<TokenResponse> {
    const appSecret = input.appSecret ?? this.appSecret;

    if (!appSecret) {
      throw new Error('appSecret is required to exchange authorization code');
    }

    return this.post<TokenResponse>('/api/v1/auth/token', {
      appId: this.appId,
      appSecret,
      code: input.code,
      redirectUri: input.redirectUri,
    });
  }

  async getCurrentUser<T = unknown>(accessToken: string): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl}/api/v1/auth/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch current user: ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Request failed: ${response.status} ${text}`);
    }

    return response.json() as Promise<T>;
  }
}

