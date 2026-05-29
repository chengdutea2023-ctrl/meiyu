export type TokenAudience = 'platform' | 'application';

export interface JwtUserPayload {
  sub: string;
  username: string;
  email: string;
  isPlatformAdmin: boolean;
  userType?: string;
  audience: TokenAudience;
  appId?: string;
}
