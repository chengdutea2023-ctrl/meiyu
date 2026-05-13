export type UserStatus = 'ACTIVE' | 'DISABLED';
export type ApplicationStatus = 'ACTIVE' | 'DISABLED';
export type OrganizationType = 'SCHOOL' | 'INSTITUTION' | 'INTERNAL';
export type ClassMemberRole = 'TEACHER' | 'STUDENT' | 'ASSISTANT';

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: AdminUser;
}

export interface AdminUser {
  id: string;
  username: string | null;
  email: string;
  displayName: string | null;
  status?: UserStatus;
  isPlatformAdmin: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Application {
  id: string;
  appId: string;
  name: string;
  description: string | null;
  homeUrl: string;
  allowedOrigins: string[];
  redirectUris: string[];
  status: ApplicationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationUserSummary {
  id: string;
  appId: string;
  externalUserId: string;
  platformUserId: string;
  email: string;
  username: string | null;
  displayName: string | null;
  ageBand: string | null;
  agentName: string | null;
  emailVerified: boolean;
  firstLinkedAt: string;
  lastSyncedAt: string;
  user: {
    id: string;
    email: string;
    username: string | null;
    displayName: string | null;
    status: UserStatus;
    createdAt: string;
  };
}

export interface ApplicationUsersResponse {
  application: {
    id: string;
    appId: string;
    name: string;
  };
  agents: Array<{
    name: string | null;
    userCount: number;
  }>;
  users: ApplicationUserSummary[];
}

export interface CreatedApplication extends Application {
  appSecret: string;
  secretVisibleOnce: boolean;
}

export interface OrganizationSummary {
  id: string;
  name: string;
  code: string | null;
  type: OrganizationType;
  status: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    classes: number;
    members: number;
  };
}

export interface OrganizationDetail extends OrganizationSummary {
  classes: Array<{
    id: string;
    name: string;
    code: string | null;
    status: string;
    createdAt: string;
  }>;
  members: Array<{
    id: string;
    user: {
      id: string;
      username: string | null;
      email: string;
      displayName: string | null;
    };
    role: {
      id: string;
      key: string;
      name: string;
    } | null;
  }>;
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

export class ApiClient {
  constructor(private readonly getToken: () => string | null) {}

  login(usernameOrEmail: string, password: string) {
    return this.request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: { usernameOrEmail, password },
      skipAuth: true,
    });
  }

  me() {
    return this.request<{
      user: AdminUser;
      organizations: unknown[];
      classes: unknown[];
    }>('/auth/me');
  }

  listUsers() {
    return this.request<AdminUser[]>('/users');
  }

  createUser(input: {
    username: string;
    email: string;
    password: string;
    displayName?: string;
    isPlatformAdmin?: boolean;
  }) {
    return this.request<AdminUser>('/users', {
      method: 'POST',
      body: input,
    });
  }

  updateUserStatus(id: string, status: UserStatus) {
    return this.request<AdminUser>(`/users/${id}/status`, {
      method: 'PATCH',
      body: { status },
    });
  }

  listApplications() {
    return this.request<Application[]>('/applications');
  }

  createApplication(input: {
    appId?: string;
    name: string;
    description?: string;
    homeUrl: string;
    allowedOrigins?: string[];
    redirectUris?: string[];
  }) {
    return this.request<CreatedApplication>('/applications', {
      method: 'POST',
      body: input,
    });
  }

  updateApplicationStatus(appId: string, status: ApplicationStatus) {
    return this.request<Application>(`/applications/${appId}/status`, {
      method: 'PATCH',
      body: { status },
    });
  }

  listApplicationUsers(appId: string, agentName?: string) {
    const query = agentName ? `?agentName=${encodeURIComponent(agentName)}` : '';
    return this.request<ApplicationUsersResponse>(`/applications/${appId}/users${query}`);
  }

  listOrganizations() {
    return this.request<OrganizationSummary[]>('/organizations');
  }

  getOrganization(id: string) {
    return this.request<OrganizationDetail>(`/organizations/${id}`);
  }

  createOrganization(input: {
    name: string;
    code?: string;
    type?: OrganizationType;
  }) {
    return this.request<OrganizationSummary>('/organizations', {
      method: 'POST',
      body: input,
    });
  }

  createClass(organizationId: string, input: { name: string; code?: string }) {
    return this.request(`/organizations/${organizationId}/classes`, {
      method: 'POST',
      body: input,
    });
  }

  addOrganizationMember(
    organizationId: string,
    input: { userId: string; roleId?: string },
  ) {
    return this.request(`/organizations/${organizationId}/members`, {
      method: 'POST',
      body: input,
    });
  }

  addClassMember(
    classId: string,
    input: { userId: string; role?: ClassMemberRole },
  ) {
    return this.request(`/organizations/classes/${classId}/members`, {
      method: 'POST',
      body: input,
    });
  }

  private async request<T>(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      skipAuth?: boolean;
    } = {},
  ): Promise<T> {
    const headers = new Headers({
      'Content-Type': 'application/json',
    });

    const token = this.getToken();
    if (!options.skipAuth && token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      let message = `请求失败：${response.status}`;
      try {
        const payload = (await response.json()) as {
          message?: string | string[];
        };
        if (payload.message) {
          message = Array.isArray(payload.message)
            ? payload.message.join('；')
            : payload.message;
        }
      } catch {
        const text = await response.text();
        if (text) {
          message = text;
        }
      }
      throw new Error(message);
    }

    return response.json() as Promise<T>;
  }
}
