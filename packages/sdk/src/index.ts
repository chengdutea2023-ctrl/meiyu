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

export interface SyncApplicationUserInput {
  email: string;
  externalUserId: string;
  username?: string;
  displayName?: string;
  emailVerified?: boolean;
  appSecret?: string;
}

export interface SyncedApplicationUser {
  platformUserId: string;
  email: string;
  created: boolean;
  linked: boolean;
  sourceAppId: string | null;
  applicationUser: {
    appId: string;
    externalUserId: string;
    username: string | null;
    displayName: string | null;
    emailVerified: boolean;
    firstLinkedAt: string;
    lastSyncedAt: string;
  };
}

export interface PlatformUserContext {
  platformUserId: string;
  email: string;
  username: string | null;
  displayName: string | null;
  sourceAppId: string | null;
  applicationUser: {
    appId: string;
    externalUserId: string;
    emailVerified: boolean;
    firstLinkedAt: string;
    lastSyncedAt: string;
  };
  organizations: unknown[];
  classes: unknown[];
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: {
    id: string;
    username: string | null;
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

  async syncApplicationUser(input: SyncApplicationUserInput): Promise<SyncedApplicationUser> {
    const appSecret = input.appSecret ?? this.appSecret;

    if (!appSecret) {
      throw new Error('appSecret is required to sync application user');
    }

    return this.postWithAppCredentials<SyncedApplicationUser>(
      '/api/v1/app-auth/users/sync',
      appSecret,
      {
        email: input.email,
        externalUserId: input.externalUserId,
        username: input.username,
        displayName: input.displayName,
        emailVerified: input.emailVerified,
      },
    );
  }

  async getPlatformUserByEmail(email: string, appSecret = this.appSecret): Promise<PlatformUserContext> {
    if (!appSecret) {
      throw new Error('appSecret is required to fetch platform user context');
    }

    const url = new URL(`${this.baseUrl}/api/v1/app-auth/users/by-email`);
    url.searchParams.set('email', email);

    const response = await this.fetcher(url, {
      headers: {
        'X-App-Id': this.appId,
        'X-App-Secret': appSecret,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Request failed: ${response.status} ${text}`);
    }

    return response.json() as Promise<PlatformUserContext>;
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

  private async postWithAppCredentials<T>(
    path: string,
    appSecret: string,
    body: unknown,
  ): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-App-Id': this.appId,
        'X-App-Secret': appSecret,
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
