export type UserStatus = 'ACTIVE' | 'DISABLED';
export type UserType = 'STUDENT' | 'TEACHER' | 'ADMIN';
export type UserApprovalStatus = 'APPROVED' | 'PENDING' | 'REJECTED';
export type ApplicationStatus = 'ACTIVE' | 'DISABLED';
export type OrganizationType = 'SCHOOL' | 'INSTITUTION' | 'INTERNAL';
export type ClassMemberRole = 'TEACHER' | 'STUDENT' | 'ASSISTANT';
export type CourseRuntimeType = 'STATIC' | 'NODE' | 'BOTH';
export type CourseStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type CourseOwnerType = 'ADMIN' | 'TEACHER' | 'DEVELOPER';
export type CourseDeploymentStatus =
  | 'NOT_UPLOADED'
  | 'UPLOADED'
  | 'READY'
  | 'STATIC_PUBLISHED'
  | 'DEPLOYING'
  | 'RUNNING'
  | 'FAILED'
  | 'STOPPED';
export type CourseAssignmentStatus = 'ACTIVE' | 'ARCHIVED';
export type LearningRecordStatus = 'STARTED' | 'PROGRESS' | 'COMPLETED';

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: AdminUser;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
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
  deletedAt?: string | null;
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
  deletedAt?: string | null;
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
  deletedAt?: string | null;
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

export interface OrganizationClassSummary {
  id: string;
  name: string;
  code: string | null;
  status: string;
  createdAt: string;
  organization: {
    id: string;
    name: string;
    code: string | null;
    type: OrganizationType;
  };
  members: Array<{
    id: string;
    role: ClassMemberRole;
    user: {
      id: string;
      username: string | null;
      email: string;
      displayName: string | null;
      userType: UserType;
      approvalStatus: UserApprovalStatus;
      status: UserStatus;
    };
  }>;
  _count?: {
    courseAssignments: number;
    members: number;
  };
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
  manifest: CourseManifest | null;
  manifestValid: boolean;
  manifestErrors: string[];
  deploymentStatus: CourseDeploymentStatus;
  deploymentMessage: string | null;
  nodePort: number | null;
  uploadedAt: string | null;
  deployedAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: {
    assignments: number;
    learningRecords: number;
    coursewares?: number;
    coursewareLinks?: number;
  };
  coursewares?: Courseware[];
  createdByUser?: {
    id: string;
    email: string;
    displayName: string | null;
    userType: UserType;
  } | null;
}

export interface Courseware {
  id: string;
  courseId: string;
  slug: string;
  title: string;
  description: string | null;
  sortOrder: number;
  runtimeType: CourseRuntimeType;
  entryUrl: string;
  status: CourseStatus;
  manifest: CourseManifest | null;
  manifestValid: boolean;
  manifestErrors: string[];
  deploymentStatus: CourseDeploymentStatus;
  deploymentMessage: string | null;
  nodePort: number | null;
  uploadedAt: string | null;
  deployedAt: string | null;
  createdAt: string;
  updatedAt: string;
  course?: Course;
  _count?: {
    learningRecords: number;
    launchSessions: number;
  };
}

export interface CourseManifest {
  slug: string;
  title: string;
  runtimeType: CourseRuntimeType;
  entry: string;
  nodePort: number | null;
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
  courseware: {
    id: string;
    slug: string;
    title: string;
    entryUrl: string;
    sortOrder: number;
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
    courseware: Courseware;
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
  courseware?: Courseware;
  courseRoot: string;
  coursewareRoot?: string;
  files: Array<{
    path: string;
    bytes: number;
  }>;
  manifestGenerated: boolean;
  manifest?: CourseManifest;
  manifestValid?: boolean;
  manifestErrors?: string[];
  deploymentStatus?: CourseDeploymentStatus;
}

export interface CourseManifestResponse {
  course: Course;
  courseware?: Courseware;
  courseRoot: string;
  coursewareRoot?: string;
  manifest: CourseManifest | null;
  manifestValid: boolean;
  manifestErrors: string[];
  deploymentStatus: CourseDeploymentStatus;
  deploymentMessage: string | null;
  nodePort: number | null;
  uploadedAt: string | null;
  deployedAt: string | null;
}

export interface CourseRuntimeStatusResponse extends CourseManifestResponse {
  pid: number | null;
  running: boolean;
  serviceName?: string | null;
  systemdActive?: boolean | null;
  systemdManaged?: boolean;
  logTail: string;
  serverDir?: string;
  error?: string;
}

export interface RecycleBinResponse {
  users: AdminUser[];
  courses: Course[];
  coursewares: Courseware[];
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

type AuthRefreshHandlers = {
  getRefreshToken: () => string | null;
  onTokenRefresh: (response: RefreshResponse) => void;
  onAuthFailure: () => void;
};

export class ApiClient {
  private refreshPromise: Promise<boolean> | null = null;

  constructor(
    private readonly getToken: () => string | null,
    private readonly authRefresh?: AuthRefreshHandlers,
  ) {}

  login(usernameOrEmail: string, password: string) {
    return this.request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: { usernameOrEmail, password },
      skipAuth: true,
    });
  }

  refresh(refreshToken: string) {
    return this.request<RefreshResponse>('/auth/refresh', {
      method: 'POST',
      body: { refreshToken },
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

  resetUserPassword(id: string, password: string) {
    return this.request<AdminUser>(`/users/${id}/password`, {
      method: 'PATCH',
      body: { password },
    });
  }

  deleteUser(id: string) {
    return this.request<AdminUser>(`/users/${id}`, {
      method: 'DELETE',
    });
  }

  restoreUser(id: string) {
    return this.request<AdminUser>(`/users/${id}/restore`, {
      method: 'PATCH',
    });
  }

  permanentlyDeleteUser(id: string) {
    return this.request<{ id: string; deleted: boolean }>(`/users/${id}/permanent`, {
      method: 'DELETE',
    });
  }

  getRecycleBin() {
    return this.request<RecycleBinResponse>('/recycle-bin');
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

  listClasses() {
    return this.request<OrganizationClassSummary[]>('/organizations/classes');
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

  removeClassMember(classId: string, userId: string) {
    return this.request<{ classId: string; userId: string; removed: boolean }>(
      `/organizations/classes/${classId}/members/${userId}`,
      {
        method: 'DELETE',
      },
    );
  }

  listCourses() {
    return this.request<Course[]>('/courses');
  }

  createCourse(input: {
    slug?: string;
    title: string;
    description?: string;
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

  deleteCourse(id: string) {
    return this.request<Course>(`/courses/${id}`, {
      method: 'DELETE',
    });
  }

  restoreCourse(id: string) {
    return this.request<Course>(`/courses/${id}/restore`, {
      method: 'PATCH',
    });
  }

  permanentlyDeleteCourse(id: string) {
    return this.request<{ id: string; deleted: boolean }>(`/courses/${id}/permanent`, {
      method: 'DELETE',
    });
  }

  listCoursewares(courseId: string) {
    return this.request<Courseware[]>(`/courses/${courseId}/coursewares`);
  }

  listAllCoursewares() {
    return this.request<Courseware[]>('/coursewares');
  }

  createCourseware(courseId: string, input: {
    slug?: string;
    title: string;
    description?: string;
    runtimeType?: CourseRuntimeType;
    sortOrder?: number;
    entryUrl?: string;
    nodePort?: number;
  }) {
    return this.request<Courseware>(`/courses/${courseId}/coursewares`, {
      method: 'POST',
      body: input,
    });
  }

  updateCourseware(id: string, input: {
    slug?: string;
    title?: string;
    description?: string;
    runtimeType?: CourseRuntimeType;
    sortOrder?: number;
    entryUrl?: string;
    nodePort?: number;
  }) {
    return this.request<Courseware>(`/coursewares/${id}`, {
      method: 'PATCH',
      body: input,
    });
  }

  updateCoursewareStatus(id: string, status: CourseStatus) {
    return this.request<Courseware>(`/coursewares/${id}/status`, {
      method: 'PATCH',
      body: { status },
    });
  }

  deleteCourseware(id: string) {
    return this.request<Courseware>(`/coursewares/${id}`, {
      method: 'DELETE',
    });
  }

  restoreCourseware(id: string) {
    return this.request<Courseware>(`/coursewares/${id}/restore`, {
      method: 'PATCH',
    });
  }

  permanentlyDeleteCourseware(id: string) {
    return this.request<{ id: string; deleted: boolean }>(`/coursewares/${id}/permanent`, {
      method: 'DELETE',
    });
  }

  updateCoursewareOrder(courseId: string, items: Array<{ id: string; sortOrder: number }>) {
    return this.request<Courseware[]>(`/courses/${courseId}/coursewares/order`, {
      method: 'PATCH',
      body: { items },
    });
  }

  selectCoursewares(courseId: string, coursewareIds: string[]) {
    return this.request<Courseware[]>(`/courses/${courseId}/coursewares/selection`, {
      method: 'PATCH',
      body: { coursewareIds },
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

  uploadCourseZip(id: string, input: {
    fileName: string;
    contentBase64: string;
    publish?: boolean;
  }) {
    return this.request<CourseUploadResult>(`/courses/${id}/zip`, {
      method: 'POST',
      body: input,
    });
  }

  uploadCoursewareZip(id: string, input: {
    fileName: string;
    contentBase64: string;
    publish?: boolean;
  }) {
    return this.request<CourseUploadResult>(`/coursewares/${id}/zip`, {
      method: 'POST',
      body: input,
    });
  }

  getCoursewareManifest(id: string) {
    return this.request<CourseManifestResponse>(`/coursewares/${id}/manifest`);
  }

  getCoursewareRuntimeStatus(id: string) {
    return this.request<CourseRuntimeStatusResponse>(`/coursewares/${id}/runtime-status`);
  }

  deployCoursewareRuntime(id: string, env?: Record<string, string>) {
    return this.request<CourseRuntimeStatusResponse>(`/coursewares/${id}/deploy`, {
      method: 'POST',
      body: { env },
    });
  }

  restartCoursewareRuntime(id: string, env?: Record<string, string>) {
    return this.request<CourseRuntimeStatusResponse>(`/coursewares/${id}/restart`, {
      method: 'POST',
      body: { env },
    });
  }

  getCourseManifest(id: string) {
    return this.request<CourseManifestResponse>(`/courses/${id}/manifest`);
  }

  getCourseRuntimeStatus(id: string) {
    return this.request<CourseRuntimeStatusResponse>(`/courses/${id}/runtime-status`);
  }

  deployCourseRuntime(id: string, env?: Record<string, string>) {
    return this.request<CourseRuntimeStatusResponse>(`/courses/${id}/deploy`, {
      method: 'POST',
      body: { env },
    });
  }

  restartCourseRuntime(id: string, env?: Record<string, string>) {
    return this.request<CourseRuntimeStatusResponse>(`/courses/${id}/restart`, {
      method: 'POST',
      body: { env },
    });
  }

  listCourseAssignments() {
    return this.request<{ assignments: PortalAssignment[] }>('/course-assignments');
  }

  createCourseAssignment(input: {
    courseId: string;
    classId: string;
    teacherId: string;
    title: string;
    instructions?: string;
    startAt?: string;
    dueAt?: string;
  }) {
    return this.request<PortalAssignment>('/course-assignments', {
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
    coursewareId?: string;
  } = {}) {
    const params = new URLSearchParams();
    if (query.classId) params.set('classId', query.classId);
    if (query.assignmentId) params.set('assignmentId', query.assignmentId);
    if (query.courseId) params.set('courseId', query.courseId);
    if (query.coursewareId) params.set('coursewareId', query.coursewareId);
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
    coursewareId?: string;
    coursewareSlug?: string;
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
    coursewareId?: string;
    coursewareSlug?: string;
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
    allowRefresh = true,
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

    if (
      response.status === 401 &&
      allowRefresh &&
      !options.skipAuth &&
      (await this.refreshAccessToken())
    ) {
      return this.request<T>(path, options, false);
    }

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

  private async refreshAccessToken() {
    if (!this.authRefresh) {
      return false;
    }

    const refreshToken = this.authRefresh.getRefreshToken();
    if (!refreshToken) {
      return false;
    }

    if (!this.refreshPromise) {
      this.refreshPromise = this.refresh(refreshToken)
        .then((response) => {
          this.authRefresh?.onTokenRefresh(response);
          return true;
        })
        .catch(() => {
          this.authRefresh?.onAuthFailure();
          return false;
        })
        .finally(() => {
          this.refreshPromise = null;
        });
    }

    return this.refreshPromise;
  }
}
