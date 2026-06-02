export type UserStatus = 'ACTIVE' | 'DISABLED';
export type UserType = 'STUDENT' | 'TEACHER' | 'ADMIN';
export type UserApprovalStatus = 'APPROVED' | 'PENDING' | 'REJECTED';
export type ApplicationStatus = 'ACTIVE' | 'DISABLED';
export type OrganizationType = 'SCHOOL' | 'INSTITUTION' | 'INTERNAL';
export type ClassMemberRole = 'TEACHER' | 'STUDENT' | 'ASSISTANT';
export type CourseRuntimeType = 'STATIC' | 'NODE' | 'BOTH';
export type CourseStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type CourseOwnerType = 'ADMIN' | 'TEACHER' | 'DEVELOPER';
export type CourseAssignmentStatus = 'ACTIVE' | 'ARCHIVED';
export type LearningRecordStatus = 'STARTED' | 'PROGRESS' | 'COMPLETED';

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
  userType: UserType;
  approvalStatus: UserApprovalStatus;
  ageBand: string | null;
  status?: UserStatus;
  isPlatformAdmin: boolean;
  createdAt?: string;
  updatedAt?: string;
  organizations?: Array<{
    id: string;
    name: string;
    code: string | null;
    role: string | null;
  }>;
  classes?: Array<{
    id: string;
    name: string;
    role: ClassMemberRole;
    organization: {
      id: string;
      name: string;
    };
  }>;
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
  platformUserId: string;
  email: string;
  username: string | null;
  displayName: string | null;
  userType: UserType;
  approvalStatus: UserApprovalStatus;
  ageBand: string | null;
  status: UserStatus;
  createdAt: string;
  organizations: Array<{
    id: string;
    name: string;
    code: string | null;
    type: OrganizationType;
    role: {
      key: string;
      name: string;
    } | null;
  }>;
  classes: Array<{
    id: string;
    name: string;
    code: string | null;
    role: ClassMemberRole;
    organization: {
      id: string;
      name: string;
    };
  }>;
}

export interface ApplicationUsersResponse {
  application: {
    id: string;
    appId: string;
    name: string;
  };
  scope: ApplicationAccessScope;
  users: ApplicationUserSummary[];
}

export interface ApplicationAccessScope {
  application: {
    id: string;
    appId: string;
    name: string;
  };
  organizations: Array<{
    id: string;
    name: string;
    code: string | null;
    type: OrganizationType;
  }>;
  classes: Array<{
    id: string;
    name: string;
    code: string | null;
    organization: {
      id: string;
      name: string;
    };
  }>;
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
    members: Array<{
      id: string;
      role: ClassMemberRole;
      user: {
        id: string;
        username: string | null;
        email: string;
        displayName: string | null;
        userType: UserType;
      };
    }>;
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

export interface Course {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  runtimeType: CourseRuntimeType;
  entryUrl: string;
  status: CourseStatus;
  ownerType: CourseOwnerType;
  createdAt: string;
  updatedAt: string;
  _count?: {
    assignments: number;
    learningRecords: number;
  };
  createdByUser?: {
    id: string;
    email: string;
    displayName: string | null;
    userType: UserType;
  } | null;
}

export interface PortalContext {
  user: AdminUser;
  organizations: Array<{
    id: string;
    name: string;
    code: string | null;
    type: OrganizationType;
    role: unknown;
  }>;
  classes: Array<{
    id: string;
    name: string;
    code: string | null;
    role: ClassMemberRole;
    organization: {
      id: string;
      name: string;
    };
  }>;
}

export interface PortalClass {
  id: string;
  name: string;
  code: string | null;
  status: string;
  organization: {
    id: string;
    name: string;
  };
  membersCount: number;
  assignmentsCount: number;
}

export interface PortalAssignment {
  id: string;
  title: string;
  instructions: string | null;
  startAt: string | null;
  dueAt: string | null;
  status: CourseAssignmentStatus;
  createdAt: string;
  recordsCount: number;
  course: Course;
  class: {
    id: string;
    name: string;
    code: string | null;
    organization: {
      id: string;
      name: string;
    };
  };
  teacher: {
    id: string;
    email: string;
    displayName: string | null;
  };
}

export interface LearningRecord {
  id: string;
  status: LearningRecordStatus;
  score: number | null;
  durationSeconds: number | null;
  summary: unknown;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  course: {
    id: string;
    slug: string;
    title: string;
    entryUrl: string;
  };
  assignment: {
    id: string;
    title: string;
  } | null;
  class: {
    id: string;
    name: string;
    organization: {
      id: string;
      name: string;
    };
  } | null;
  student: {
    id: string;
    email: string;
    displayName: string | null;
    ageBand: string | null;
  };
}

export interface CourseLaunchResponse {
  launchToken: string;
  launchUrl: string;
  expiresAt: string;
  context: {
    launchSessionId: string;
    expiresAt: string;
    student: AdminUser;
    course: Course;
    assignment: {
      id: string;
      title: string;
      instructions: string | null;
      startAt: string | null;
      dueAt: string | null;
    } | null;
    class: {
      id: string;
      name: string;
      code: string | null;
      organization: {
        id: string;
        name: string;
        code: string | null;
      };
    } | null;
  };
  record: LearningRecord;
}

export interface CourseUploadResult {
  course: Course;
  courseRoot: string;
  files: Array<{
    path: string;
    bytes: number;
  }>;
  manifestGenerated: boolean;
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
    username?: string;
    email: string;
    password: string;
    displayName?: string;
    userType?: UserType;
    approvalStatus?: UserApprovalStatus;
    ageBand?: string;
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

  updateUserApproval(id: string, approvalStatus: UserApprovalStatus) {
    return this.request<AdminUser>(`/users/${id}/approval`, {
      method: 'PATCH',
      body: { approvalStatus },
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

  listApplicationUsers(appId: string, userType?: UserType) {
    const query = userType ? `?userType=${encodeURIComponent(userType)}` : '';
    return this.request<ApplicationUsersResponse>(`/applications/${appId}/users${query}`);
  }

  getApplicationAccessScope(appId: string) {
    return this.request<ApplicationAccessScope>(`/applications/${appId}/access-scope`);
  }

  updateApplicationAccessScope(
    appId: string,
    input: { organizationIds?: string[]; classIds?: string[] },
  ) {
    return this.request<ApplicationAccessScope>(`/applications/${appId}/access-scope`, {
      method: 'PATCH',
      body: input,
    });
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

  listCourses() {
    return this.request<Course[]>('/courses');
  }

  createCourse(input: {
    slug: string;
    title: string;
    description?: string;
    runtimeType?: CourseRuntimeType;
    entryUrl: string;
    ownerType?: CourseOwnerType;
  }) {
    return this.request<Course>('/courses', {
      method: 'POST',
      body: input,
    });
  }

  updateCourse(id: string, input: {
    slug?: string;
    title?: string;
    description?: string;
    runtimeType?: CourseRuntimeType;
    entryUrl?: string;
    ownerType?: CourseOwnerType;
  }) {
    return this.request<Course>(`/courses/${id}`, {
      method: 'PATCH',
      body: input,
    });
  }

  updateCourseStatus(id: string, status: CourseStatus) {
    return this.request<Course>(`/courses/${id}/status`, {
      method: 'PATCH',
      body: { status },
    });
  }

  uploadCourseFiles(id: string, input: {
    files: Array<{ path: string; contentBase64: string }>;
    publish?: boolean;
  }) {
    return this.request<CourseUploadResult>(`/courses/${id}/files`, {
      method: 'POST',
      body: input,
    });
  }

  portalMe() {
    return this.request<PortalContext>('/portal/me');
  }

  listTeacherClasses() {
    return this.request<{ classes: PortalClass[] }>('/portal/teacher/classes');
  }

  listTeacherClassStudents(classId: string) {
    return this.request<{ students: AdminUser[] }>(
      `/portal/teacher/classes/${classId}/students`,
    );
  }

  listTeacherCourses() {
    return this.request<{ courses: Course[] }>('/portal/teacher/courses');
  }

  createTeacherAssignment(input: {
    courseId: string;
    classId: string;
    title: string;
    instructions?: string;
    startAt?: string;
    dueAt?: string;
  }) {
    return this.request<PortalAssignment>('/portal/teacher/assignments', {
      method: 'POST',
      body: input,
    });
  }

  listTeacherAssignments() {
    return this.request<{ assignments: PortalAssignment[] }>('/portal/teacher/assignments');
  }

  listTeacherLearningRecords(query: {
    classId?: string;
    assignmentId?: string;
    courseId?: string;
  } = {}) {
    const params = new URLSearchParams();
    if (query.classId) params.set('classId', query.classId);
    if (query.assignmentId) params.set('assignmentId', query.assignmentId);
    if (query.courseId) params.set('courseId', query.courseId);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return this.request<{ records: LearningRecord[] }>(`/portal/teacher/learning-records${suffix}`);
  }

  listStudentCourses() {
    return this.request<{ courses: Course[] }>('/portal/student/courses');
  }

  listStudentAssignments() {
    return this.request<{ assignments: PortalAssignment[] }>('/portal/student/assignments');
  }

  listStudentLearningRecords() {
    return this.request<{ records: LearningRecord[] }>('/portal/student/learning-records');
  }

  reportLearningRecord(input: {
    courseId?: string;
    courseSlug?: string;
    assignmentId?: string;
    classId?: string;
    status: LearningRecordStatus;
    score?: number;
    durationSeconds?: number;
    summary?: Record<string, unknown>;
  }) {
    return this.request<LearningRecord>('/course-runtime/records', {
      method: 'POST',
      body: input,
    });
  }

  createCourseLaunch(input: {
    courseId?: string;
    courseSlug?: string;
    assignmentId?: string;
    classId?: string;
  }) {
    return this.request<CourseLaunchResponse>('/course-runtime/launch', {
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
