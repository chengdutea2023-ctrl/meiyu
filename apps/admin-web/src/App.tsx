import {
  ApartmentOutlined,
  AppstoreOutlined,
  BankOutlined,
  BookOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EyeOutlined,
  FileExcelOutlined,
  FileZipOutlined,
  FileDoneOutlined,
  LogoutOutlined,
  LockOutlined,
  PlusOutlined,
  ReloadOutlined,
  RestOutlined,
  RocketOutlined,
  ReadOutlined,
  SyncOutlined,
  TeamOutlined,
  UndoOutlined,
  UploadOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Badge,
  Button,
  Calendar,
  Card,
  DatePicker,
  Descriptions,
  Drawer,
  Form,
  Input,
  Layout,
  Menu,
  Modal,
  Popconfirm,
  Segmented,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { Dayjs } from 'dayjs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  ApiClient,
  Application,
  ApplicationStatus,
  ApplicationUsersResponse,
  CreatedApplication,
  OrganizationDetail,
  OrganizationClassSummary,
  OrganizationSummary,
  OrganizationType,
  UserStatus,
  UserType,
  UserApprovalStatus,
  AdminUser,
  ClassMemberRole,
  ApplicationAccessScope,
  Course,
  Courseware,
  CourseAssignmentStatus,
  CourseTeachingStatus,
  CourseDeploymentStatus,
  CourseManifestResponse,
  CourseOwnerType,
  CourseRuntimeType,
  CourseStatus,
  CourseRuntimeStatusResponse,
  LearningRecord,
  LearningRecordArtifact,
  LearningRecordStatus,
  PortalAssignment,
  PortalAssignmentCoursewareState,
  PortalClass,
  PortalContext,
  RecycleBinResponse,
  RefreshResponse,
  ImportStudentInputRow,
  ImportStudentRowResult,
  ImportStudentsResponse,
  WorkItem,
} from './api';

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;

const TOKEN_KEY = 'jiaoxue_admin_portal_access_token';
const REFRESH_TOKEN_KEY = 'jiaoxue_admin_portal_refresh_token';
const USER_KEY = 'jiaoxue_admin_portal_user';

type ViewKey =
  | 'dashboard'
  | 'scheduling'
  | 'users'
  | 'applications'
  | 'organizations'
  | 'courses'
  | 'recycleBin';
type PortalMode = 'admin' | 'teacher' | 'student';
type OrganizationClassMember = OrganizationDetail['classes'][number]['members'][number];
type PortalStorageKeys = {
  token: string;
  refreshToken: string;
  user: string;
};

function consumeAccessTokenFromHash(keys: PortalStorageKeys) {
  const hash = window.location.hash.replace(/^#/, '');

  if (!hash) {
    return null;
  }

  const params = new URLSearchParams(hash);
  const accessToken = params.get('accessToken');
  const refreshToken = params.get('refreshToken');

  if (!accessToken) {
    return null;
  }

  localStorage.setItem(keys.token, accessToken);
  if (refreshToken) {
    localStorage.setItem(keys.refreshToken, refreshToken);
  }
  localStorage.removeItem(keys.user);
  clearAccessTokenHash();

  return accessToken;
}

function clearAccessTokenHash() {
  if (!window.location.hash.includes('accessToken=')) {
    return;
  }

  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${window.location.search}`,
  );
}

function readStoredUser(keys: PortalStorageKeys) {
  const raw = localStorage.getItem(keys.user);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AdminUser;
  } catch {
    localStorage.removeItem(keys.user);
    return null;
  }
}

function App() {
  const registrationRedirect = registrationRedirectFromLocation();

  if (registrationRedirect) {
    return <RegistrationRedirect redirect={registrationRedirect} />;
  }

  return <MainApp />;
}

function RegistrationRedirect({
  redirect,
}: {
  redirect: { url: string; title: string; description: string };
}) {
  useEffect(() => {
    window.location.replace(redirect.url);
  }, [redirect.url]);

  return (
    <div className="login-page">
      <div className="login-panel">
        <Title level={1}>{redirect.title}</Title>
        <Text className="login-subtitle">{redirect.description}</Text>
      </div>
    </div>
  );
}

function MainApp() {
  const portalMode = resolvePortalMode();
  const storageKeys = useMemo(() => portalStorageKeys(portalMode), [portalMode]);
  const [token, setToken] = useState(
    () => consumeAccessTokenFromHash(storageKeys) ?? localStorage.getItem(storageKeys.token),
  );
  const [refreshToken, setRefreshToken] = useState(
    () => localStorage.getItem(storageKeys.refreshToken),
  );
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(
    () => readStoredUser(storageKeys),
  );
  const [view, setView] = useState<ViewKey>('dashboard');
  const [workItemCount, setWorkItemCount] = useState(0);
  const [loadingSession, setLoadingSession] = useState(Boolean(token));
  const [messageApi, contextHolder] = message.useMessage();

  const saveTokenPair = useCallback((response: RefreshResponse) => {
    localStorage.setItem(storageKeys.token, response.accessToken);
    localStorage.setItem(storageKeys.refreshToken, response.refreshToken);
    setToken(response.accessToken);
    setRefreshToken(response.refreshToken);
  }, [storageKeys.refreshToken, storageKeys.token]);

  const logout = useCallback(() => {
    localStorage.removeItem(storageKeys.token);
    localStorage.removeItem(storageKeys.refreshToken);
    localStorage.removeItem(storageKeys.user);
    setToken(null);
    setRefreshToken(null);
      setCurrentUser(null);
      setView('dashboard');
      setWorkItemCount(0);
  }, [storageKeys.refreshToken, storageKeys.token, storageKeys.user]);

  const api = useMemo(
    () =>
      new ApiClient(
        () => localStorage.getItem(storageKeys.token) ?? token,
        {
          getRefreshToken: () =>
            localStorage.getItem(storageKeys.refreshToken) ?? refreshToken,
          onTokenRefresh: saveTokenPair,
          onAuthFailure: logout,
        },
      ),
    [logout, refreshToken, saveTokenPair, token],
  );

  const saveSession = useCallback(
    (nextToken: string, nextRefreshToken: string, user: AdminUser) => {
      localStorage.setItem(storageKeys.token, nextToken);
      localStorage.setItem(storageKeys.refreshToken, nextRefreshToken);
      localStorage.setItem(storageKeys.user, JSON.stringify(user));
      setToken(nextToken);
      setRefreshToken(nextRefreshToken);
      setCurrentUser(user);
    },
    [storageKeys.refreshToken, storageKeys.token, storageKeys.user],
  );

  useEffect(() => {
    clearAccessTokenHash();
  }, []);

  useEffect(() => {
    const handleHashChange = () => {
      const nextToken = consumeAccessTokenFromHash(storageKeys);

      if (!nextToken) {
        return;
      }

      setToken(nextToken);
      setCurrentUser(null);
      setLoadingSession(true);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [storageKeys]);

  useEffect(() => {
    if (!token) {
      setLoadingSession(false);
      return;
    }

    api
      .me()
      .then((result) => {
        if (!canAccessPortal(result.user, portalMode)) {
          messageApi.error(portalAccessError(portalMode));
          logout();
          return;
        }
        setCurrentUser(result.user);
        localStorage.setItem(storageKeys.user, JSON.stringify(result.user));
      })
      .catch(() => {
        logout();
      })
      .finally(() => {
        setLoadingSession(false);
      });
  }, [api, logout, messageApi, portalMode, storageKeys.user, token]);

  useEffect(() => {
    if (!token || !currentUser || portalMode !== 'admin' || !currentUser.isPlatformAdmin) {
      setWorkItemCount(0);
      return;
    }

    api
      .getWorkItemSummary()
      .then((result) => setWorkItemCount(result.pendingCount))
      .catch(() => undefined);
  }, [api, currentUser, portalMode, token]);

  if (token && loadingSession && !currentUser) {
    return (
      <>
        {contextHolder}
        <div className="login-page">
          <div className="login-panel">
            <Title level={1}>正在进入{portalTitle(portalMode)}</Title>
            <Text className="login-subtitle">正在同步你的登录状态</Text>
          </div>
        </div>
      </>
    );
  }

  if (!token || !currentUser) {
    return (
      <>
        {contextHolder}
        <LoginPage
          mode={portalMode}
          loading={loadingSession}
          onLogin={async (usernameOrEmail, password) => {
            const result = await api.login(usernameOrEmail, password);
            if (!canAccessPortal(result.user, portalMode)) {
              throw new Error(portalAccessError(portalMode));
            }
            saveSession(result.accessToken, result.refreshToken, result.user);
            messageApi.success('登录成功');
          }}
        />
      </>
    );
  }

  if (portalMode !== 'admin') {
    return (
      <>
        {contextHolder}
        <RolePortal
          api={api}
          mode={portalMode}
          currentUser={currentUser}
          onLogout={logout}
        />
      </>
    );
  }

  return (
    <>
      {contextHolder}
      <Layout className="app-shell">
        <Sider className="app-sider" width={248}>
          <div className="brand">
            <div className="brand-mark">
              <ApartmentOutlined />
            </div>
            <div>
              <div className="brand-title">智美教育新生态业务底座</div>
              <div className="brand-subtitle">管理后台</div>
            </div>
          </div>
          <Menu
            mode="inline"
            selectedKeys={[view]}
            onClick={(item) => setView(item.key as ViewKey)}
            items={[
              {
                key: 'dashboard',
                icon: <AppstoreOutlined />,
                label: (
                  <Badge count={workItemCount} size="small" offset={[8, -2]}>
                    <span>概览</span>
                  </Badge>
                ),
              },
              {
                key: 'scheduling',
                icon: <FileDoneOutlined />,
                label: '排课管理',
              },
              {
                key: 'users',
                icon: <TeamOutlined />,
                label: '用户管理',
              },
              {
                key: 'applications',
                icon: <ApartmentOutlined />,
                label: '第三方课程（测试中）',
              },
              {
                key: 'courses',
                icon: <BookOutlined />,
                label: '课程课件',
              },
              {
                key: 'organizations',
                icon: <BankOutlined />,
                label: '机构与班级',
              },
              {
                key: 'recycleBin',
                icon: <RestOutlined />,
                label: '回收站',
              },
            ]}
          />
        </Sider>
        <Layout>
          <Header className="app-header">
            <div>
              <Text className="header-label">当前管理员</Text>
              <div className="header-user">
                {currentUser.displayName || currentUser.username || currentUser.email}
              </div>
            </div>
            <Button icon={<LogoutOutlined />} onClick={logout}>
              退出
            </Button>
          </Header>
          <Content className="app-content">
            {view === 'dashboard' && (
              <Dashboard
                api={api}
                onNavigate={setView}
                onWorkItemCountChange={setWorkItemCount}
              />
            )}
            {view === 'scheduling' && <SchedulingPage api={api} />}
            {view === 'users' && <UsersPage api={api} />}
            {view === 'applications' && <ApplicationsPage api={api} />}
            {view === 'courses' && <CoursesPage api={api} />}
            {view === 'organizations' && <OrganizationsPage api={api} />}
            {view === 'recycleBin' && <RecycleBinPage api={api} />}
          </Content>
        </Layout>
      </Layout>
    </>
  );
}

function LoginPage({
  mode,
  loading,
  onLogin,
}: {
  mode: PortalMode;
  loading: boolean;
  onLogin: (usernameOrEmail: string, password: string) => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const forgotPasswordUrl = ssoForgotPasswordUrl();

  return (
    <div className="login-page">
      <div className="login-panel">
        <Title level={1}>智美教育新生态业务底座</Title>
        <Text className="login-subtitle">{portalTitle(mode)}</Text>
        {error && <Alert type="error" message={error} showIcon />}
        <Form
          layout="vertical"
          initialValues={{
            usernameOrEmail: mode === 'admin' ? 'admin@example.com' : '',
            password: '',
          }}
          onFinish={async (values: {
            usernameOrEmail: string;
            password: string;
          }) => {
            setError(null);
            setSubmitting(true);
            try {
              await onLogin(values.usernameOrEmail, values.password);
            } catch (loginError) {
              setError(
                loginError instanceof Error
                  ? loginError.message
                  : '登录失败',
              );
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <Form.Item
            label="用户名或邮箱"
            name="usernameOrEmail"
            rules={[{ required: true, message: '请输入用户名或邮箱' }]}
          >
            <Input size="large" autoComplete="username" disabled={loading} />
          </Form.Item>
          <Form.Item
            label="密码"
            name="password"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 8, message: '密码至少需要 8 位' },
            ]}
          >
            <Input.Password
              size="large"
              autoComplete="current-password"
              disabled={loading}
            />
          </Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            size="large"
            block
            loading={loading || submitting}
          >
            登录
          </Button>
          {mode !== 'admin' && (
            <div className="login-help">
              <Text type="secondary">忘记密码？</Text>
              <Typography.Link href={forgotPasswordUrl}>
                去重置密码
              </Typography.Link>
            </div>
          )}
        </Form>
      </div>
    </div>
  );
}

function Dashboard({
  api,
  onNavigate,
  onWorkItemCountChange,
}: {
  api: ApiClient;
  onNavigate: (view: ViewKey) => void;
  onWorkItemCountChange: (count: number) => void;
}) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const platformOrigin = window.location.origin;
  const studentRegisterUrl = `${platformOrigin}/register/student`;
  const teacherRegisterUrl = `${platformOrigin}/register/teacher`;
  const teacherPortalUrl = siblingPortalOrigin('teacher');
  const studentPortalUrl = siblingPortalOrigin('student');
  const agentPortalUrl = siblingPortalOrigin('agent');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [
        nextUsers,
        nextApplications,
        nextOrganizations,
        nextCourses,
        nextWorkItems,
      ] =
        await Promise.all([
          api.listUsers(),
          api.listApplications(),
          api.listOrganizations(),
          api.listCourses(),
          api.listWorkItems(),
        ]);
      setUsers(nextUsers);
      setApplications(nextApplications);
      setOrganizations(nextOrganizations);
      setCourses(nextCourses);
      setWorkItems(nextWorkItems.items);
      onWorkItemCountChange(nextWorkItems.items.length);
    } finally {
      setLoading(false);
    }
  }, [api, onWorkItemCountChange]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const classCount = organizations.reduce(
    (total, item) => total + (item._count?.classes ?? 0),
    0,
  );

  const markWorkItemDone = async (item: WorkItem) => {
    try {
      await api.completeWorkItem(item.id);
      message.success('已标记处理');
      await reload();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '标记处理失败');
    }
  };

  const openWorkItemTarget = (item: WorkItem) => {
    onNavigate(adminWorkItemTarget(item));
  };

  return (
    <section>
      <PageHeader
        title="概览"
        description="统一账号、第三方课程、机构班级的当前状态。"
        extra={
          <Button icon={<ReloadOutlined />} onClick={reload} loading={loading}>
            刷新
          </Button>
        }
      />
      <AdminWorkItemsPanel
        items={workItems}
        loading={loading}
        onOpen={openWorkItemTarget}
        onComplete={markWorkItemDone}
      />
      <div className="metrics-grid">
        <div className="metric">
          <Statistic title="用户" value={users.length} prefix={<TeamOutlined />} />
        </div>
        <div className="metric">
          <Statistic
            title="第三方课程"
            value={applications.length}
            prefix={<ApartmentOutlined />}
          />
        </div>
        <div className="metric">
          <Statistic
            title="机构/学校"
            value={organizations.length}
            prefix={<BankOutlined />}
          />
        </div>
        <div className="metric">
          <Statistic
            title="课程"
            value={courses.length}
            prefix={<BookOutlined />}
          />
        </div>
      </div>
      <Alert
        className="content-alert"
        type="info"
        showIcon
        message="当前主线是底座统一维护教师、学生、学校和班级。"
        description={`当前班级数：${classCount}。教师、学生后台和课程运行区由底座统一承载。`}
      />
      <div className="link-panel">
        <div>
          <Title level={3}>线上入口地址</Title>
          <Text type="secondary">用于分享注册入口、教师后台、学生后台和课件运行区。</Text>
        </div>
        <Space direction="vertical" size={12} className="link-list">
          <AccessLink label="学生注册" url={studentRegisterUrl} />
          <AccessLink label="教师注册" url={teacherRegisterUrl} />
          <AccessLink label="教师后台" url={teacherPortalUrl} />
          <AccessLink label="学生后台" url={studentPortalUrl} />
          <AccessLink label="课件运行区" url={agentPortalUrl} />
        </Space>
      </div>
    </section>
  );
}

function SchedulingPage({ api }: { api: ApiClient }) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [classes, setClasses] = useState<OrganizationClassSummary[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [assignments, setAssignments] = useState<PortalAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [courseFilter, setCourseFilter] = useState<string | undefined>();
  const [classFilter, setClassFilter] = useState<string | undefined>();
  const [teacherFilter, setTeacherFilter] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState<CourseAssignmentStatus | undefined>();
  const [form] = Form.useForm();
  const selectedClassId = Form.useWatch<string>('classId', form);
  const selectedCourseId = Form.useWatch<string>('courseId', form);
  const selectedTeacherId = Form.useWatch<string>('teacherId', form);
  const [messageApi, contextHolder] = message.useMessage();

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [nextCourses, nextClasses, nextAssignments, nextUsers] = await Promise.all([
        api.listCourses(),
        api.listClasses(),
        api.listCourseAssignments(),
        api.listUsers(),
      ]);
      setCourses(nextCourses);
      setClasses(nextClasses);
      setAssignments(nextAssignments.assignments);
      setUsers(nextUsers);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const assignableCourses = useMemo(
    () =>
      courses.filter(
        (course) => course.status === 'PUBLISHED' && (course.coursewares?.length ?? 0) > 0,
      ),
    [courses],
  );

  const classMap = useMemo(
    () => new Map(classes.map((classItem) => [classItem.id, classItem])),
    [classes],
  );

  const selectedClass = selectedClassId ? classMap.get(selectedClassId) ?? null : null;
  const selectedCourse = selectedCourseId
    ? courses.find((course) => course.id === selectedCourseId) ?? null
    : null;

  const selectedTeacher = selectedTeacherId
    ? users.find((user) => user.id === selectedTeacherId) ?? null
    : null;

  const allTeacherOptions = useMemo(() => {
    return users
      .filter(
        (user) =>
          user.userType === 'TEACHER' &&
          user.status === 'ACTIVE' &&
          user.approvalStatus === 'APPROVED',
      )
      .map((user) => ({
        label: `${user.displayName || user.username || user.email} (${user.email})`,
        value: user.id,
      }));
  }, [users]);

  const filteredAssignments = useMemo(
    () =>
      assignments.filter((assignment) => {
        if (courseFilter && assignment.course.id !== courseFilter) return false;
        if (classFilter && assignment.class.id !== classFilter) return false;
        if (teacherFilter && assignment.teacher.id !== teacherFilter) return false;
        if (statusFilter && assignment.status !== statusFilter) return false;
        return true;
      }),
    [assignments, classFilter, courseFilter, statusFilter, teacherFilter],
  );

  const scheduledClassIds = new Set(assignments.map((assignment) => assignment.class.id));
  const scheduledCourseIds = new Set(assignments.map((assignment) => assignment.course.id));
  const activeAssignments = assignments.filter((assignment) => assignment.status === 'ACTIVE');
  const classStudentCount = selectedClass?.members.filter((member) => member.role === 'STUDENT').length ?? 0;

  const resetFilters = () => {
    setCourseFilter(undefined);
    setClassFilter(undefined);
    setTeacherFilter(undefined);
    setStatusFilter(undefined);
  };

  const assignmentColumns: ColumnsType<PortalAssignment> = [
    {
      title: '任务',
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Text strong>{record.title}</Text>
          <Text type="secondary">{record.course.title}</Text>
          {record.instructions && <Text type="secondary">{record.instructions}</Text>}
        </Space>
      ),
    },
    {
      title: '班级',
      render: (_, record) => {
        const classItem = classMap.get(record.class.id);
        const studentCount = classItem?.members.filter((member) => member.role === 'STUDENT').length ?? 0;
        return (
          <Space direction="vertical" size={2}>
            <Text>{record.class.organization.name} / {record.class.name}</Text>
            <Text type="secondary">{record.class.code || '未设置班级编码'} · 学生 {studentCount}</Text>
          </Space>
        );
      },
    },
    {
      title: '负责老师',
      render: (_, record) => record.teacher.displayName || record.teacher.email,
    },
    {
      title: '课件',
      render: (_, record) => `${record.course.coursewares?.length ?? 0} 个`,
    },
    {
      title: '课堂状态',
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <TeachingStatusTag status={record.teachingStatus} />
          {record.openedAt && <Text type="secondary">开始：{formatDateTime(record.openedAt)}</Text>}
          {record.closedAt && <Text type="secondary">结束：{formatDateTime(record.closedAt)}</Text>}
        </Space>
      ),
    },
    {
      title: '状态/记录',
      width: 130,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Tag color={record.status === 'ACTIVE' ? 'green' : 'default'}>{record.status}</Tag>
          <Text type="secondary">记录 {record.recordsCount}</Text>
        </Space>
      ),
    },
  ];

  return (
    <section>
      {contextHolder}
      <PageHeader
        title="排课管理"
        description="管理员完成课程、班级和负责老师的基础排课；课堂开始和结束由负责老师在教师后台控制。"
        extra={
          <Button icon={<ReloadOutlined />} onClick={reload} loading={loading}>
            刷新
          </Button>
        }
      />

      <div className="metrics-grid">
        <div className="metric">
          <Statistic title="可排课程" value={assignableCourses.length} prefix={<BookOutlined />} />
        </div>
        <div className="metric">
          <Statistic title="班级" value={classes.length} prefix={<BankOutlined />} />
        </div>
        <div className="metric">
          <Statistic title="活跃任务" value={activeAssignments.length} prefix={<FileDoneOutlined />} />
        </div>
        <div className="metric">
          <Statistic title="已排班级" value={scheduledClassIds.size} prefix={<TeamOutlined />} />
        </div>
      </div>

      <Alert
        className="content-alert"
        type="info"
        showIcon
        message="排课前置条件"
        description="课程必须已发布且至少选择 1 个已发布课件；班级只需要先加入学生。教师不隶属于班级，排课时选择任意已审核启用教师即可授权其上课。"
      />

      <div className="portal-panel">
        <PageHeader
          title="快速排课"
          description="选择课程、班级和负责老师后，一次性生成学生任务。"
        />
        <Form
          form={form}
          layout="vertical"
          onFinish={async (values) => {
            setSaving(true);
            try {
              await api.createCourseAssignment({
                courseId: values.courseId,
                classId: values.classId,
                teacherId: values.teacherId,
                title: values.title.trim(),
                instructions: values.instructions?.trim() || undefined,
                startAt: values.startAt.toISOString(),
                dueAt: values.dueAt ? values.dueAt.toISOString() : undefined,
              });
              messageApi.success('课程已布置给班级');
              form.resetFields();
              await reload();
            } catch (error) {
              messageApi.error(error instanceof Error ? error.message : '排课失败');
            } finally {
              setSaving(false);
            }
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 16,
            }}
          >
            <Form.Item
              name="courseId"
              label="课程"
              rules={[{ required: true, message: '请选择课程' }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="选择已发布课程"
                onChange={(courseId) => {
                  const course = courses.find((item) => item.id === courseId);
                  if (course) {
                    form.setFieldValue('title', `${course.title} 学习任务`);
                  }
                }}
                options={assignableCourses.map((course) => ({
                  label: `${course.title}（${course.coursewares?.length ?? 0} 个课件）`,
                  value: course.id,
                }))}
              />
            </Form.Item>
            <Form.Item
              name="classId"
              label="班级"
              rules={[{ required: true, message: '请选择班级' }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="选择班级"
                options={classes.map((classItem) => ({
                  label: `${classItem.organization.name} / ${classItem.name}（学生 ${
                    classItem.members.filter((member) => member.role === 'STUDENT').length
                  }）`,
                  value: classItem.id,
                }))}
              />
            </Form.Item>
            <Form.Item
              name="teacherId"
              label="负责老师"
              rules={[{ required: true, message: '请选择负责老师' }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="选择已审核启用教师"
                options={allTeacherOptions}
              />
            </Form.Item>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 16,
            }}
          >
            <Form.Item
              name="title"
              label="任务标题"
              rules={[{ required: true, message: '请输入任务标题' }]}
            >
              <Input placeholder="第一课学习任务" />
            </Form.Item>
            <Form.Item
              name="startAt"
              label="计划上课时间"
              rules={[{ required: true, message: '请选择计划上课时间' }]}
            >
              <DatePicker
                showTime
                format="YYYY-MM-DD HH:mm"
                placeholder="选择上课时间"
                style={{ width: '100%' }}
              />
            </Form.Item>
            <Form.Item
              name="dueAt"
              label="计划结束时间（可选）"
              rules={[
                {
                  validator: (_, value) => {
                    const startAt = form.getFieldValue('startAt');
                    if (value && startAt && !value.isAfter(startAt)) {
                      return Promise.reject(new Error('计划结束时间必须晚于上课时间'));
                    }
                    return Promise.resolve();
                  },
                },
              ]}
            >
              <DatePicker
                showTime
                format="YYYY-MM-DD HH:mm"
                placeholder="不填则仅显示上课时间"
                style={{ width: '100%' }}
              />
            </Form.Item>
          </div>

          <Form.Item name="instructions" label="任务说明">
            <Input.TextArea rows={3} placeholder="给学生看的学习要求，可不填" />
          </Form.Item>

          <Descriptions bordered size="small" column={3} className="content-alert">
            <Descriptions.Item label="课程课件">
              {selectedCourse ? `${selectedCourse.coursewares?.length ?? 0} 个课件` : '未选择课程'}
            </Descriptions.Item>
            <Descriptions.Item label="班级成员">
              {selectedClass ? `学生 ${classStudentCount}` : '未选择班级'}
            </Descriptions.Item>
            <Descriptions.Item label="负责老师">
              {selectedTeacher ? selectedTeacher.displayName || selectedTeacher.email : '未选择老师'}
            </Descriptions.Item>
          </Descriptions>

          <Space>
            <Button type="primary" htmlType="submit" loading={saving}>
              完成排课
            </Button>
            <Button onClick={() => form.resetFields()}>
              清空
            </Button>
          </Space>
        </Form>
      </div>

      <div className="portal-panel">
        <PageHeader
          title="排课记录"
          description={`当前共 ${assignments.length} 条排课记录，涉及 ${scheduledCourseIds.size} 门课程。`}
          extra={
            <Space wrap>
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="筛选课程"
                value={courseFilter}
                style={{ width: 220 }}
                onChange={setCourseFilter}
                options={courses.map((course) => ({
                  label: course.title,
                  value: course.id,
                }))}
              />
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="筛选班级"
                value={classFilter}
                style={{ width: 240 }}
                onChange={setClassFilter}
                options={classes.map((classItem) => ({
                  label: `${classItem.organization.name} / ${classItem.name}`,
                  value: classItem.id,
                }))}
              />
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="筛选老师"
                value={teacherFilter}
                style={{ width: 220 }}
                onChange={setTeacherFilter}
                options={allTeacherOptions}
              />
              <Select
                allowClear
                placeholder="状态"
                value={statusFilter}
                style={{ width: 120 }}
                onChange={setStatusFilter}
                options={[
                  { label: '进行中', value: 'ACTIVE' },
                  { label: '已归档', value: 'ARCHIVED' },
                ]}
              />
              <Button onClick={resetFilters}>重置筛选</Button>
            </Space>
          }
        />
        <Table
          rowKey="id"
          size="small"
          columns={assignmentColumns}
          dataSource={filteredAssignments}
          loading={loading}
          pagination={{ pageSize: 8 }}
        />
      </div>
    </section>
  );
}

function AdminWorkItemsPanel({
  items,
  loading,
  onOpen,
  onComplete,
}: {
  items: WorkItem[];
  loading: boolean;
  onOpen: (item: WorkItem) => void;
  onComplete: (item: WorkItem) => void | Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="work-item-panel admin-work-items">
      <div className="work-item-panel-head">
        <div>
          <Title level={3}>待处理工作</Title>
          <Text type="secondary">
            注册、学生提交和课件异常会在这里集中提醒，需手动标记已处理。
          </Text>
        </div>
        <Space>
          <Badge count={items.length} showZero color="#1677ff" />
          <Button
            className="work-item-toggle"
            size="small"
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? '收起' : '展开'}
          </Button>
        </Space>
      </div>
      {expanded && (
        items.length ? (
          <div className="work-item-list" aria-busy={loading}>
            {items.map((item) => (
              <WorkItemCard
                key={item.id}
                item={item}
                onOpen={onOpen}
                onComplete={onComplete}
                compact
              />
            ))}
          </div>
        ) : (
          <div className="work-item-empty">
            <CheckCircleOutlined />
            <Text>暂无待处理事项</Text>
          </div>
        )
      )}
    </div>
  );
}

function WorkItemCard({
  item,
  onOpen,
  onComplete,
  compact = false,
}: {
  item: WorkItem;
  onOpen: (item: WorkItem) => void;
  onComplete: (item: WorkItem) => void | Promise<void>;
  compact?: boolean;
}) {
  return (
    <div className={`work-item-card${compact ? ' work-item-card-row' : ''}`}>
      <div className="work-item-card-main">
        <Space className="work-item-tags" size={8} wrap>
          {workItemTypeTag(item)}
          {item.learningRecord?.score !== null && item.learningRecord?.score !== undefined && (
            <Tag color="blue">分数 {item.learningRecord.score}</Tag>
          )}
        </Space>
        <Text strong className="work-item-title">
          {item.title}
        </Text>
        {item.description && (
          <Text type="secondary" className="work-item-description">
            {item.description}
          </Text>
        )}
        <Text type="secondary" className="work-item-time">
          {formatDateTime(item.createdAt)}
        </Text>
      </div>
      <Space wrap>
        <Button size="small" icon={<EyeOutlined />} onClick={() => onOpen(item)}>
          {item.actionLabel || '查看'}
        </Button>
        <Button size="small" onClick={() => void onComplete(item)}>
          标记已处理
        </Button>
      </Space>
    </div>
  );
}

function adminWorkItemTarget(item: WorkItem): ViewKey {
  if (
    item.type === 'STUDENT_REGISTERED' ||
    item.type === 'TEACHER_PENDING_APPROVAL'
  ) {
    return 'users';
  }

  if (item.type === 'COURSEWARE_DEPLOYMENT_FAILED') {
    return 'courses';
  }

  if (item.type === 'LEARNING_RECORD_COMPLETED') {
    return 'scheduling';
  }

  return 'dashboard';
}

function workItemTypeTag(item: WorkItem) {
  if (item.type === 'STUDENT_REGISTERED') {
    return <Tag color="green">新学生</Tag>;
  }

  if (item.type === 'TEACHER_PENDING_APPROVAL') {
    return <Tag color="orange">教师待审核</Tag>;
  }

  if (item.type === 'LEARNING_RECORD_COMPLETED') {
    return <Tag color="blue">学生提交</Tag>;
  }

  if (item.type === 'COURSEWARE_DEPLOYMENT_FAILED') {
    return <Tag color="red">课件异常</Tag>;
  }

  return <Tag>{item.type}</Tag>;
}

function AccessLink({ label, url }: { label: string; url: string }) {
  const [messageApi, contextHolder] = message.useMessage();

  return (
    <div className="access-link">
      {contextHolder}
      <div>
        <Text strong>{label}</Text>
        <Typography.Paragraph copyable={{ text: url }} className="access-url">
          {url}
        </Typography.Paragraph>
      </div>
      <Space>
        <Button href={url} target="_blank">
          打开
        </Button>
        <Button
          icon={<CopyOutlined />}
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            messageApi.success('地址已复制');
          }}
        >
          复制
        </Button>
      </Space>
    </div>
  );
}

type StudentImportPreviewRow = ImportStudentInputRow & {
  key: string;
  rowNumber: number;
  displayName: string;
  email: string;
  ageBand?: string;
  validationStatus: 'READY' | 'INVALID';
  validationReason: string | null;
  result?: ImportStudentRowResult;
};

function StudentImportModal({
  api,
  open,
  organizationDetails,
  initialClassId,
  onCancel,
  onImported,
}: {
  api: ApiClient;
  open: boolean;
  organizationDetails: OrganizationDetail[];
  initialClassId?: string | null;
  onCancel: () => void;
  onImported: () => Promise<void> | void;
}) {
  const [form] = Form.useForm();
  const selectedOrganizationId = Form.useWatch<string>('organizationId', form);
  const [messageApi, contextHolder] = message.useMessage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewRows, setPreviewRows] = useState<StudentImportPreviewRow[]>([]);
  const [importResult, setImportResult] = useState<ImportStudentsResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [parsing, setParsing] = useState(false);

  const organizationOptions = useMemo(
    () =>
      organizationDetails.map((organization) => ({
        label: `${organization.name}${organization.code ? ` (${organization.code})` : ''}`,
        value: organization.id,
      })),
    [organizationDetails],
  );

  const classOptions = useMemo(() => {
    const source = selectedOrganizationId
      ? organizationDetails.filter((organization) => organization.id === selectedOrganizationId)
      : organizationDetails;

    return source.flatMap((organization) =>
      organization.classes.map((classItem) => ({
        label: `${organization.name} / ${classItem.name}`,
        value: classItem.id,
      })),
    );
  }, [organizationDetails, selectedOrganizationId]);

  useEffect(() => {
    if (!open) return;

    form.resetFields();
    setPreviewRows([]);
    setImportResult(null);

    const initialClass = findImportClassOption(organizationDetails, initialClassId);
    if (initialClass) {
      form.setFieldsValue({
        organizationId: initialClass.organizationId,
        classId: initialClass.classId,
      });
    }
  }, [form, initialClassId, open, organizationDetails]);

  const handleTemplateDownload = () => {
    const worksheet = XLSX.utils.json_to_sheet([
      {
        学生姓名: '张同学',
        邮箱: 'student@example.com',
        年龄段: '6-12岁',
      },
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '学生导入模板');
    XLSX.writeFile(workbook, '学生导入模板.xlsx');
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;

    setParsing(true);
    setImportResult(null);
    try {
      const workbook = await readStudentImportWorkbook(file);
      const firstSheetName = workbook.SheetNames[0];

      if (!firstSheetName) {
        throw new Error('文件里没有可读取的工作表');
      }

      const worksheet = workbook.Sheets[firstSheetName];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
        defval: '',
        raw: false,
      });
      const rows = normalizeStudentImportRows(rawRows);

      if (!rows.length) {
        messageApi.warning('没有读取到学生数据，请检查表格内容');
      } else {
        messageApi.success(`已读取 ${rows.length} 行学生数据`);
      }

      setPreviewRows(rows);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '文件解析失败');
      setPreviewRows([]);
    } finally {
      setParsing(false);
    }
  };

  const submitImport = async (values: { classId: string; defaultPassword: string }) => {
    if (!previewRows.length) {
      messageApi.warning('请先上传并预览学生表格');
      return;
    }

    setSubmitting(true);
    try {
      const result = await api.importStudents({
        classId: values.classId,
        defaultPassword: values.defaultPassword,
        students: previewRows.map((row) => ({
          rowNumber: row.rowNumber,
          displayName: row.displayName,
          email: row.email,
          ageBand: row.ageBand,
        })),
      });
      const resultByRow = new Map(result.results.map((row) => [row.rowNumber, row]));
      setPreviewRows((rows) =>
        rows.map((row) => ({
          ...row,
          result: resultByRow.get(row.rowNumber),
        })),
      );
      setImportResult(result);
      messageApi.success(
        `导入完成：新建 ${result.createdCount} 人，已存在加入 ${result.existingAddedCount} 人，失败 ${result.failedCount} 行`,
      );
      await Promise.resolve(onImported());
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '导入失败');
    } finally {
      setSubmitting(false);
    }
  };

  const copyFailedRows = async () => {
    if (!importResult) return;

    const failedRows = importResult.results
      .filter((row) => row.status === 'FAILED')
      .map((row) => `第 ${row.rowNumber} 行，${row.email || '未填写邮箱'}：${row.reason || '失败'}`)
      .join('\n');

    if (!failedRows) {
      messageApi.info('没有失败行');
      return;
    }

    await navigator.clipboard.writeText(failedRows);
    messageApi.success('失败行说明已复制');
  };

  const previewColumns: ColumnsType<StudentImportPreviewRow> = [
    { title: '行号', dataIndex: 'rowNumber', width: 72 },
    { title: '学生姓名', dataIndex: 'displayName' },
    { title: '邮箱', dataIndex: 'email' },
    {
      title: '年龄段',
      dataIndex: 'ageBand',
      render: (value?: string) => value || <Text type="secondary">未填写</Text>,
    },
    {
      title: '状态',
      width: 136,
      render: (_, row) => <StudentImportRowStatusTag row={row} />,
    },
    {
      title: '说明',
      render: (_, row) =>
        row.result?.reason ||
        row.validationReason ||
        (row.result?.status === 'CREATED' ? '账号已创建并加入班级' : '等待确认导入'),
    },
  ];

  return (
    <Modal
      title="批量导入学生"
      open={open}
      onCancel={onCancel}
      width={980}
      okText="确认导入"
      confirmLoading={submitting}
      onOk={() => form.submit()}
      destroyOnClose
    >
      {contextHolder}
      <Alert
        className="content-alert"
        type="info"
        showIcon
        message="按班级批量导入学生"
        description="整张表会加入同一个班级。新学生会创建账号；已存在学生不覆盖资料和密码，只补充加入所选班级。"
      />
      <Form
        form={form}
        layout="vertical"
        preserve={false}
        onFinish={submitImport}
      >
        <Space className="content-alert" wrap>
          <Button icon={<DownloadOutlined />} onClick={handleTemplateDownload}>
            下载模板
          </Button>
          <Button
            icon={<UploadOutlined />}
            loading={parsing}
            onClick={() => fileInputRef.current?.click()}
          >
            上传 Excel/CSV
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            style={{ display: 'none' }}
            onChange={(event) => {
              void handleFileChange(event);
            }}
          />
          {importResult && (
            <Button icon={<CopyOutlined />} onClick={copyFailedRows}>
              复制失败行
            </Button>
          )}
        </Space>
        <Form.Item
          name="organizationId"
          label="学校/机构"
          rules={[{ required: true, message: '请选择学校或机构' }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            placeholder="选择学校或机构"
            options={organizationOptions}
            onChange={() => form.setFieldValue('classId', undefined)}
          />
        </Form.Item>
        <Form.Item
          name="classId"
          label="导入到班级"
          rules={[{ required: true, message: '请选择班级' }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            placeholder={classOptions.length ? '选择班级' : '请先创建班级'}
            options={classOptions}
          />
        </Form.Item>
        <Form.Item
          name="defaultPassword"
          label="统一初始密码"
          rules={[{ required: true, min: 8, message: '至少 8 位密码' }]}
          extra="只用于新创建的学生；已存在学生不会覆盖原密码。"
        >
          <Input.Password placeholder="例如 Student2026!" autoComplete="new-password" />
        </Form.Item>
      </Form>
      {importResult && (
        <Alert
          className="content-alert"
          type={importResult.failedCount > 0 ? 'warning' : 'success'}
          showIcon
          message={`导入完成：${importResult.class.organization.name} / ${importResult.class.name}`}
          description={`新建 ${importResult.createdCount} 人，已存在并加入 ${importResult.existingAddedCount} 人，失败 ${importResult.failedCount} 行。`}
        />
      )}
      <Table
        className="content-table"
        rowKey="key"
        size="small"
        columns={previewColumns}
        dataSource={previewRows}
        locale={{ emptyText: '请先下载模板，填写后上传 Excel 或 CSV' }}
        pagination={{ pageSize: 8 }}
      />
    </Modal>
  );
}

function StudentImportRowStatusTag({ row }: { row: StudentImportPreviewRow }) {
  if (row.result?.status === 'CREATED') {
    return <Tag color="success">已创建</Tag>;
  }

  if (row.result?.status === 'EXISTING_ADDED') {
    return <Tag color="processing">已加入班级</Tag>;
  }

  if (row.result?.status === 'FAILED') {
    return <Tag color="error">失败</Tag>;
  }

  if (row.validationStatus === 'INVALID') {
    return <Tag color="error">本地校验失败</Tag>;
  }

  return <Tag color="blue">待导入</Tag>;
}

async function readStudentImportWorkbook(file: File) {
  if (file.name.toLowerCase().endsWith('.csv')) {
    const text = await file.text();
    return XLSX.read(text, { type: 'string' });
  }

  const data = await file.arrayBuffer();
  return XLSX.read(data, { type: 'array' });
}

function normalizeStudentImportRows(
  rawRows: Array<Record<string, unknown>>,
): StudentImportPreviewRow[] {
  const seenEmails = new Set<string>();
  const rows: StudentImportPreviewRow[] = [];

  rawRows.forEach((rawRow, index) => {
    const displayName = readStudentImportCell(rawRow, ['学生姓名', '姓名', 'displayName']);
    const email = readStudentImportCell(rawRow, ['邮箱', 'email']).toLowerCase();
    const ageBand = readStudentImportCell(rawRow, ['年龄段', 'ageBand']);

    if (!displayName && !email && !ageBand) {
      return;
    }

    let validationReason: string | null = null;
    if (!displayName) {
      validationReason = '学生姓名不能为空';
    } else if (!email || !isImportEmailValid(email)) {
      validationReason = '邮箱格式不正确';
    } else if (seenEmails.has(email)) {
      validationReason = '表格内重复邮箱';
    }

    if (email && isImportEmailValid(email)) {
      seenEmails.add(email);
    }

    rows.push({
      key: `${index + 2}-${email || displayName || 'empty'}`,
      rowNumber: index + 2,
      displayName,
      email,
      ageBand,
      validationStatus: validationReason ? 'INVALID' : 'READY',
      validationReason,
    });
  });

  return rows;
}

function readStudentImportCell(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }

  return '';
}

function isImportEmailValid(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function findImportClassOption(
  organizationDetails: OrganizationDetail[],
  classId?: string | null,
) {
  if (!classId) return null;

  for (const organization of organizationDetails) {
    const classItem = organization.classes.find((item) => item.id === classId);
    if (classItem) {
      return {
        organizationId: organization.id,
        classId: classItem.id,
      };
    }
  }

  return null;
}

function UsersPage({ api }: { api: ApiClient }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [organizationDetails, setOrganizationDetails] = useState<OrganizationDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [studentImportOpen, setStudentImportOpen] = useState(false);
  const [assigningUser, setAssigningUser] = useState<AdminUser | null>(null);
  const [passwordResetUser, setPasswordResetUser] = useState<AdminUser | null>(null);
  const [userTypeFilter, setUserTypeFilter] = useState<'ALL' | UserType>('ALL');
  const [form] = Form.useForm();
  const [assignForm] = Form.useForm();
  const [passwordForm] = Form.useForm();
  const [messageApi, contextHolder] = message.useMessage();
  const selectedOrganizationId = Form.useWatch('organizationId', assignForm);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [nextUsers, nextOrganizations] = await Promise.all([
        api.listUsers(),
        api.listOrganizations(),
      ]);
      const nextOrganizationDetails = await Promise.all(
        nextOrganizations.map((organization) => api.getOrganization(organization.id)),
      );
      setUsers(nextUsers);
      setOrganizations(nextOrganizations);
      setOrganizationDetails(nextOrganizationDetails);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const filteredUsers = useMemo(
    () =>
      userTypeFilter === 'ALL'
        ? users
        : users.filter((user) => user.userType === userTypeFilter),
    [users, userTypeFilter],
  );

  const classOptions = useMemo(() => {
    const source = selectedOrganizationId
      ? organizationDetails.filter((organization) => organization.id === selectedOrganizationId)
      : organizationDetails;

    return source.flatMap((organization) =>
      organization.classes.map((classItem) => ({
        label: `${organization.name} / ${classItem.name}`,
        value: classItem.id,
      })),
    );
  }, [organizationDetails, selectedOrganizationId]);

  const openAssignment = (user: AdminUser) => {
    if (user.userType !== 'STUDENT') {
      messageApi.info('教师不隶属于学校或班级，请在排课时选择为负责老师');
      return;
    }

    const firstOrganization = user.organizations?.[0];
    const firstClass = user.classes?.[0];

    setAssigningUser(user);
    assignForm.setFieldsValue({
      organizationId: firstOrganization?.id,
      classId: firstClass?.id,
    });
  };

  const columns: ColumnsType<AdminUser> = [
    {
      title: '用户',
      dataIndex: 'username',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{record.displayName || record.username || record.email}</Text>
          <Text type="secondary">{record.email}</Text>
        </Space>
      ),
    },
    {
      title: '用户名',
      dataIndex: 'username',
      render: (value: string | null) => value || <Text type="secondary">未设置</Text>,
    },
    {
      title: '身份',
      dataIndex: 'userType',
      render: (value: UserType, record) => (
        <Space direction="vertical" size={2}>
          <Tag color={userTypeColor(value)}>{userTypeLabel(value)}</Tag>
          {record.isPlatformAdmin && <Tag color="blue">平台管理员</Tag>}
        </Space>
      ),
    },
    {
      title: '年龄段',
      dataIndex: 'ageBand',
      render: (value: string | null) => value || <Text type="secondary">未设置</Text>,
    },
    {
      title: '学校 / 班级',
      render: (_, record) => {
        if (record.userType !== 'STUDENT') {
          return <Text type="secondary">教师不隶属学校/班级</Text>;
        }

        return (
          <Space direction="vertical" size={4}>
            {record.organizations && record.organizations.length > 0 ? (
              <Space wrap size={4}>
                {record.organizations.map((organization) => (
                  <Tag key={organization.id} color="blue">
                    {organization.name}
                  </Tag>
                ))}
              </Space>
            ) : (
              <Text type="secondary">未分配学校</Text>
            )}
            {record.classes && record.classes.length > 0 ? (
              <Space wrap size={4}>
                {record.classes.map((classItem) => (
                  <Tag key={classItem.id} color="geekblue">
                    {classItem.organization.name} / {classItem.name}
                  </Tag>
                ))}
              </Space>
            ) : (
              <Text type="secondary">未分配班级</Text>
            )}
          </Space>
        );
      },
    },
    {
      title: '审核',
      dataIndex: 'approvalStatus',
      render: (status: UserApprovalStatus) => <ApprovalTag status={status} />,
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (status: UserStatus) => <StatusTag status={status} />,
    },
    {
      title: '操作',
      align: 'right',
      render: (_, record) => (
        <Space>
          {record.userType === 'STUDENT' && (
            <Button size="small" onClick={() => openAssignment(record)}>
              分配学校/班级
            </Button>
          )}
          {!record.isPlatformAdmin && record.userType !== 'ADMIN' && (
            <Button
              size="small"
              icon={<LockOutlined />}
              onClick={() => {
                setPasswordResetUser(record);
                passwordForm.resetFields();
              }}
            >
              重置密码
            </Button>
          )}
          <Select
            size="small"
            value={record.approvalStatus}
            style={{ width: 96 }}
            options={[
              { label: '通过', value: 'APPROVED' },
              { label: '待审核', value: 'PENDING' },
              { label: '拒绝', value: 'REJECTED' },
            ]}
            onChange={async (value) => {
              await api.updateUserApproval(record.id, value);
              messageApi.success('用户审核状态已更新');
              await reload();
            }}
          />
          <Switch
            checked={record.status === 'ACTIVE'}
            checkedChildren="启用"
            unCheckedChildren="禁用"
            onChange={async (checked) => {
              await api.updateUserStatus(
                record.id,
                checked ? 'ACTIVE' : 'DISABLED',
              );
              messageApi.success('用户状态已更新');
              await reload();
            }}
          />
          {!record.isPlatformAdmin && record.userType !== 'ADMIN' && (
            <Popconfirm
              title="移入回收站"
              description="该用户将无法登录，之后可在回收站恢复或永久删除。"
              okText="删除"
              cancelText="取消"
              onConfirm={async () => {
                await api.deleteUser(record.id);
                messageApi.success('用户已移入回收站');
                await reload();
              }}
            >
              <Button danger size="small" icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <section>
      {contextHolder}
      <PageHeader
        title="用户管理"
        description="创建用户、分配管理员身份，并启用或禁用账号。"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={reload}>
              刷新
            </Button>
            <Button icon={<FileExcelOutlined />} onClick={() => setStudentImportOpen(true)}>
              批量导入学生
            </Button>
            <Button type="primary" icon={<UserAddOutlined />} onClick={() => setOpen(true)}>
              新建用户
            </Button>
          </Space>
        }
      />
      <Space className="content-alert" direction="vertical" size={8}>
        <Text type="secondary">按身份快速筛选</Text>
        <Segmented
          value={userTypeFilter}
          options={[
            { label: `全部 ${users.length}`, value: 'ALL' },
            {
              label: `老师 ${users.filter((user) => user.userType === 'TEACHER').length}`,
              value: 'TEACHER',
            },
            {
              label: `学生 ${users.filter((user) => user.userType === 'STUDENT').length}`,
              value: 'STUDENT',
            },
            {
              label: `管理员 ${users.filter((user) => user.userType === 'ADMIN').length}`,
              value: 'ADMIN',
            },
          ]}
          onChange={(value) => setUserTypeFilter(value as 'ALL' | UserType)}
        />
      </Space>
      <Table
        rowKey="id"
        columns={columns}
        dataSource={filteredUsers}
        loading={loading}
        pagination={{ pageSize: 10 }}
      />
      <StudentImportModal
        api={api}
        open={studentImportOpen}
        organizationDetails={organizationDetails}
        onCancel={() => setStudentImportOpen(false)}
        onImported={reload}
      />
      <Modal
        title="分配学生学校/班级"
        open={Boolean(assigningUser)}
        onCancel={() => setAssigningUser(null)}
        okText="保存"
        onOk={() => assignForm.submit()}
        destroyOnClose
      >
        <Form
          form={assignForm}
          layout="vertical"
          preserve={false}
          onFinish={async (values: {
            organizationId?: string;
            classId?: string;
            role?: ClassMemberRole;
          }) => {
            if (!assigningUser || !values.organizationId) return;

            await api.addOrganizationMember(values.organizationId, {
              userId: assigningUser.id,
            });

            if (values.classId) {
              await api.addClassMember(values.classId, {
                userId: assigningUser.id,
                role: 'STUDENT',
              });
            }

            messageApi.success('学生学校/班级已分配');
            setAssigningUser(null);
            await reload();
          }}
        >
          {assigningUser && (
            <Alert
              className="content-alert"
              type="info"
              showIcon
              message={assigningUser.displayName || assigningUser.email}
              description={`${userTypeLabel(assigningUser.userType)} / ${assigningUser.email}`}
            />
          )}
          <Form.Item
            name="organizationId"
            label="学校/机构"
            rules={[{ required: true, message: '请选择学校或机构' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="选择学校或机构"
              options={organizations.map((organization) => ({
                label: `${organization.name}${organization.code ? ` (${organization.code})` : ''}`,
                value: organization.id,
              }))}
              onChange={() => assignForm.setFieldValue('classId', undefined)}
            />
          </Form.Item>
          <Form.Item name="classId" label="班级">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="可选，选择后会同步加入班级"
              options={classOptions}
            />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="重置老师/学生密码"
        open={Boolean(passwordResetUser)}
        onCancel={() => setPasswordResetUser(null)}
        okText="保存新密码"
        onOk={() => passwordForm.submit()}
        destroyOnClose
      >
        <Form
          form={passwordForm}
          layout="vertical"
          preserve={false}
          onFinish={async (values: { password: string }) => {
            if (!passwordResetUser) return;

            await api.resetUserPassword(passwordResetUser.id, values.password);
            messageApi.success('密码已重置，旧登录态已失效');
            setPasswordResetUser(null);
            await reload();
          }}
        >
          {passwordResetUser && (
            <Alert
              className="content-alert"
              type="warning"
              showIcon
              message={passwordResetUser.displayName || passwordResetUser.email}
              description={`仅支持重置老师/学生密码。${passwordResetUser.email}`}
            />
          )}
          <Form.Item
            name="password"
            label="新密码"
            rules={[{ required: true, min: 8, message: '至少 8 位密码' }]}
          >
            <Input.Password placeholder="NewPassword123!" autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="确认新密码"
            dependencies={['password']}
            rules={[
              { required: true, message: '请再次输入新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password placeholder="再次输入新密码" autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="新建用户"
        open={open}
        onCancel={() => setOpen(false)}
        okText="创建"
        onOk={() => form.submit()}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          preserve={false}
          initialValues={{
            userType: 'STUDENT',
            approvalStatus: 'APPROVED',
          }}
          onFinish={async (values) => {
            await api.createUser({
              ...values,
              username: values.username || undefined,
              ageBand: values.ageBand || undefined,
            });
            messageApi.success('用户已创建');
            setOpen(false);
            await reload();
          }}
        >
          <Form.Item
            name="username"
            label="用户名（可选）"
          >
            <Input placeholder="teacher001" />
          </Form.Item>
          <Form.Item
            name="email"
            label="邮箱"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '邮箱格式不正确' },
            ]}
          >
            <Input placeholder="teacher001@example.com" />
          </Form.Item>
          <Form.Item name="displayName" label="显示名称">
            <Input placeholder="张老师" />
          </Form.Item>
          <Form.Item name="userType" label="用户身份">
            <Select
              options={[
                { label: '学生', value: 'STUDENT' },
                { label: '教师', value: 'TEACHER' },
                { label: '管理员', value: 'ADMIN' },
              ]}
            />
          </Form.Item>
          <Form.Item name="approvalStatus" label="审核状态">
            <Select
              options={[
                { label: '已通过', value: 'APPROVED' },
                { label: '待审核', value: 'PENDING' },
                { label: '已拒绝', value: 'REJECTED' },
              ]}
            />
          </Form.Item>
          <Form.Item name="ageBand" label="学生年龄段（可选）">
            <Input placeholder="6-12岁" />
          </Form.Item>
          <Form.Item
            name="password"
            label="初始密码"
            rules={[{ required: true, min: 8, message: '至少 8 位密码' }]}
          >
            <Input.Password placeholder="ChangeMe123!" />
          </Form.Item>
          <Form.Item
            name="isPlatformAdmin"
            label="平台管理员"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </section>
  );
}

function RecycleBinPage({ api }: { api: ApiClient }) {
  const [items, setItems] = useState<RecycleBinResponse>({
    users: [],
    courses: [],
    coursewares: [],
  });
  const [loading, setLoading] = useState(true);
  const [messageApi, contextHolder] = message.useMessage();

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api.getRecycleBin());
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const restoreUser = async (id: string) => {
    await api.restoreUser(id);
    messageApi.success('用户已恢复');
    await reload();
  };

  const permanentlyDeleteUser = async (id: string) => {
    await api.permanentlyDeleteUser(id);
    messageApi.success('用户已永久删除');
    await reload();
  };

  const restoreCourse = async (id: string) => {
    await api.restoreCourse(id);
    messageApi.success('课程已恢复');
    await reload();
  };

  const permanentlyDeleteCourse = async (id: string) => {
    await api.permanentlyDeleteCourse(id);
    messageApi.success('课程已永久删除');
    await reload();
  };

  const restoreCourseware = async (id: string) => {
    try {
      await api.restoreCourseware(id);
      messageApi.success('课件已恢复');
      await reload();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '课件恢复失败');
    }
  };

  const permanentlyDeleteCourseware = async (id: string) => {
    await api.permanentlyDeleteCourseware(id);
    messageApi.success('课件已永久删除');
    await reload();
  };

  return (
    <section>
      {contextHolder}
      <PageHeader
        title="回收站"
        description="被删除的学生、教师、课程和课件会先进入回收站；在这里再次删除才会永久清理。"
        extra={
          <Button icon={<ReloadOutlined />} onClick={reload}>
            刷新
          </Button>
        }
      />
      <Alert
        className="content-alert"
        type="warning"
        showIcon
        message="永久删除不可恢复"
        description="回收站中的对象仍占用邮箱、课程访问短名或课件访问短名。需要重新使用同名信息时，请先恢复或永久删除。"
      />
      <Tabs
        items={[
          {
            key: 'users',
            label: `用户 ${items.users.length}`,
            children: (
              <Table
                rowKey="id"
                loading={loading}
                dataSource={items.users}
                pagination={{ pageSize: 8 }}
                columns={[
                  {
                    title: '用户',
                    render: (_, record) => (
                      <Space direction="vertical" size={0}>
                        <Text strong>{record.displayName || record.username || record.email}</Text>
                        <Text type="secondary">{record.email}</Text>
                      </Space>
                    ),
                  },
                  {
                    title: '身份',
                    dataIndex: 'userType',
                    render: (value: UserType) => (
                      <Tag color={userTypeColor(value)}>{userTypeLabel(value)}</Tag>
                    ),
                  },
                  {
                    title: '状态',
                    render: (_, record) => (
                      <Space direction="vertical" size={2}>
                        <ApprovalTag status={record.approvalStatus} />
                        {record.status && <StatusTag status={record.status} />}
                      </Space>
                    ),
                  },
                  {
                    title: '删除时间',
                    dataIndex: 'deletedAt',
                    render: (value: string | null) => formatDateTime(value),
                  },
                  {
                    title: '操作',
                    align: 'right',
                    render: (_, record) => (
                      <Space>
                        <Button
                          size="small"
                          icon={<UndoOutlined />}
                          onClick={() => restoreUser(record.id)}
                        >
                          恢复
                        </Button>
                        <Popconfirm
                          title="永久删除用户"
                          description="该操作会清理用户的班级关系、应用绑定和学习记录，不能恢复。"
                          okText="永久删除"
                          cancelText="取消"
                          onConfirm={() => permanentlyDeleteUser(record.id)}
                        >
                          <Button danger size="small" icon={<DeleteOutlined />}>
                            永久删除
                          </Button>
                        </Popconfirm>
                      </Space>
                    ),
                  },
                ]}
              />
            ),
          },
          {
            key: 'courses',
            label: `课程 ${items.courses.length}`,
            children: (
              <Table
                rowKey="id"
                loading={loading}
                dataSource={items.courses}
                pagination={{ pageSize: 8 }}
                columns={[
                  {
                    title: '课程',
                    render: (_, record) => (
                      <Space direction="vertical" size={0}>
                        <Text strong>{record.title}</Text>
                        <Text type="secondary">访问短名：{record.slug}</Text>
                      </Space>
                    ),
                  },
                  {
                    title: '状态',
                    dataIndex: 'status',
                    render: (value: CourseStatus) => <CourseStatusTag status={value} />,
                  },
                  {
                    title: '课件/任务/记录',
                    render: (_, record) => (
                      <Text>
                        {record._count?.coursewares ?? 0} / {record._count?.assignments ?? 0} / {record._count?.learningRecords ?? 0}
                      </Text>
                    ),
                  },
                  {
                    title: '删除时间',
                    dataIndex: 'deletedAt',
                    render: (value: string | null) => formatDateTime(value),
                  },
                  {
                    title: '操作',
                    align: 'right',
                    render: (_, record) => (
                      <Space>
                        <Button
                          size="small"
                          icon={<UndoOutlined />}
                          onClick={() => restoreCourse(record.id)}
                        >
                          恢复
                        </Button>
                        <Popconfirm
                          title="永久删除课程"
                          description="该操作会删除课程、其下课件、任务和学习记录，并清理课程运行目录。"
                          okText="永久删除"
                          cancelText="取消"
                          onConfirm={() => permanentlyDeleteCourse(record.id)}
                        >
                          <Button danger size="small" icon={<DeleteOutlined />}>
                            永久删除
                          </Button>
                        </Popconfirm>
                      </Space>
                    ),
                  },
                ]}
              />
            ),
          },
          {
            key: 'coursewares',
            label: `课件 ${items.coursewares.length}`,
            children: (
              <Table
                rowKey="id"
                loading={loading}
                dataSource={items.coursewares}
                pagination={{ pageSize: 8 }}
                columns={[
                  {
                    title: '课件',
                    render: (_, record) => (
                      <Space direction="vertical" size={0}>
                        <Text strong>{record.title}</Text>
                        <Text type="secondary">访问短名：{record.slug}</Text>
                      </Space>
                    ),
                  },
                  {
                    title: '所属课程',
                    render: (_, record) => record.course ? (
                      <Space direction="vertical" size={0}>
                        <Text>{record.course.title}</Text>
                        <Text type="secondary">访问短名：{record.course.slug}</Text>
                      </Space>
                    ) : (
                      <Text type="secondary">课程已不存在</Text>
                    ),
                  },
                  {
                    title: '状态',
                    render: (_, record) => (
                      <Space direction="vertical" size={2}>
                        <CourseStatusTag status={record.status} />
                        <CourseDeploymentStatusTag status={record.deploymentStatus} />
                      </Space>
                    ),
                  },
                  {
                    title: '记录',
                    render: (_, record) => record._count?.learningRecords ?? 0,
                  },
                  {
                    title: '删除时间',
                    dataIndex: 'deletedAt',
                    render: (value: string | null) => formatDateTime(value),
                  },
                  {
                    title: '操作',
                    align: 'right',
                    render: (_, record) => (
                      <Space>
                        <Button
                          size="small"
                          icon={<UndoOutlined />}
                          onClick={() => restoreCourseware(record.id)}
                        >
                          恢复
                        </Button>
                        <Popconfirm
                          title="永久删除课件"
                          description="该操作会删除课件、学习记录和课件运行目录，不能恢复。"
                          okText="永久删除"
                          cancelText="取消"
                          onConfirm={() => permanentlyDeleteCourseware(record.id)}
                        >
                          <Button danger size="small" icon={<DeleteOutlined />}>
                            永久删除
                          </Button>
                        </Popconfirm>
                      </Space>
                    ),
                  },
                ]}
              />
            ),
          },
        ]}
      />
    </section>
  );
}

function ApplicationsPage({ api }: { api: ApiClient }) {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<CreatedApplication | null>(null);
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null);
  const [applicationUsers, setApplicationUsers] = useState<ApplicationUsersResponse | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [selectedUserType, setSelectedUserType] = useState<UserType | undefined>();
  const [scopeApplication, setScopeApplication] = useState<Application | null>(null);
  const [accessScope, setAccessScope] = useState<ApplicationAccessScope | null>(null);
  const [scopeOrganizations, setScopeOrganizations] = useState<OrganizationSummary[]>([]);
  const [scopeOrganizationDetails, setScopeOrganizationDetails] = useState<OrganizationDetail[]>([]);
  const [scopeLoading, setScopeLoading] = useState(false);
  const [form] = Form.useForm();
  const [scopeForm] = Form.useForm();
  const [messageApi, contextHolder] = message.useMessage();

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setApplications(await api.listApplications());
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const loadApplicationUsers = useCallback(async (application: Application, userType?: UserType) => {
    setUsersLoading(true);
    try {
      setApplicationUsers(await api.listApplicationUsers(application.appId, userType));
    } finally {
      setUsersLoading(false);
    }
  }, [api]);

  const openAccessScope = useCallback(async (application: Application) => {
    setScopeApplication(application);
    setScopeLoading(true);
    try {
      const [nextScope, nextOrganizations] = await Promise.all([
        api.getApplicationAccessScope(application.appId),
        api.listOrganizations(),
      ]);
      const nextDetails = await Promise.all(
        nextOrganizations.map((organization) => api.getOrganization(organization.id)),
      );
      setAccessScope(nextScope);
      setScopeOrganizations(nextOrganizations);
      setScopeOrganizationDetails(nextDetails);
      scopeForm.setFieldsValue({
        organizationIds: nextScope.organizations.map((organization) => organization.id),
        classIds: nextScope.classes.map((classItem) => classItem.id),
      });
    } finally {
      setScopeLoading(false);
    }
  }, [api, scopeForm]);

  const columns: ColumnsType<Application> = [
    {
      title: '第三方课程',
      dataIndex: 'name',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{record.name}</Text>
          <Text type="secondary">{record.appId}</Text>
        </Space>
      ),
    },
    {
      title: '入口地址',
      dataIndex: 'homeUrl',
      render: (value: string) => <a href={value} target="_blank">{value}</a>,
    },
    {
      title: '允许域名',
      dataIndex: 'allowedOrigins',
      render: (origins: string[]) => (
        <Space direction="vertical" size={4}>
          {origins.length > 0
            ? origins.map((origin) => (
                <Text code key={origin}>
                  {origin}
                </Text>
              ))
            : <Text type="secondary">未配置</Text>}
        </Space>
      ),
    },
    {
      title: 'SSO 回调地址',
      dataIndex: 'redirectUris',
      render: (uris: string[]) => (
        <Space direction="vertical" size={4}>
          {uris.length > 0
            ? uris.map((uri) => (
                <Text code key={uri}>
                  {uri}
                </Text>
              ))
            : <Text type="secondary">未配置</Text>}
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (status: ApplicationStatus) => <StatusTag status={status} />,
    },
    {
      title: '操作',
      align: 'right',
      render: (_, record) => (
        <Space>
          <Button
            size="small"
            onClick={async () => {
              setSelectedApplication(record);
              setSelectedUserType(undefined);
              await loadApplicationUsers(record);
            }}
          >
            查看用户
          </Button>
          <Button size="small" onClick={() => openAccessScope(record)}>
            授权范围
          </Button>
          <Switch
            checked={record.status === 'ACTIVE'}
            checkedChildren="启用"
            unCheckedChildren="禁用"
            onChange={async (checked) => {
              await api.updateApplicationStatus(
                record.appId,
                checked ? 'ACTIVE' : 'DISABLED',
              );
              messageApi.success('第三方课程状态已更新');
              await reload();
            }}
          />
        </Space>
      ),
    },
  ];

  return (
    <section>
      {contextHolder}
      <PageHeader
        title="第三方课程"
        description="登记独立第三方课程，维护 appId、appSecret、SSO 回调地址和用户读取授权范围。"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={reload}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
              登记第三方课程
            </Button>
          </Space>
        }
      />
      <Table
        rowKey="id"
        columns={columns}
        dataSource={applications}
        loading={loading}
        pagination={{ pageSize: 8 }}
      />
      <Modal
        title="登记第三方课程"
        open={open}
        onCancel={() => setOpen(false)}
        okText="创建"
        onOk={() => form.submit()}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          preserve={false}
          initialValues={{
            allowedOrigins: ['http://localhost:3001'],
            redirectUris: ['http://localhost:3001/auth/callback'],
          }}
          onFinish={async (values) => {
            const result = await api.createApplication(values);
            setCreated(result);
            messageApi.success('第三方课程已登记');
            setOpen(false);
            await reload();
          }}
        >
          <Form.Item name="appId" label="appId">
            <Input placeholder="留空则自动生成" />
          </Form.Item>
          <Form.Item
            name="name"
            label="第三方课程名称"
            rules={[{ required: true, message: '请输入第三方课程名称' }]}
          >
            <Input placeholder="教学辅助演示课程" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item
            name="homeUrl"
            label="入口地址"
            rules={[{ required: true, message: '请输入入口地址' }]}
          >
            <Input placeholder="http://localhost:3001" />
          </Form.Item>
          <Form.Item
            name="redirectUris"
            label="SSO 回调地址"
          >
            <Select
              mode="tags"
              tokenSeparators={[',', '\n']}
              placeholder="http://localhost:3001/auth/callback"
            />
          </Form.Item>
          <Form.Item
            name="allowedOrigins"
            label="允许调用域名"
          >
            <Select
              mode="tags"
              tokenSeparators={[',', '\n']}
              placeholder="http://localhost:3001"
            />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="请保存 appSecret"
        open={Boolean(created)}
        onCancel={() => setCreated(null)}
        footer={
          <Button type="primary" onClick={() => setCreated(null)}>
            已保存
          </Button>
        }
      >
        <Alert
          type="warning"
          showIcon
          message="appSecret 只在创建时显示一次"
          className="content-alert"
        />
        {created && (
          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="appId">{created.appId}</Descriptions.Item>
            <Descriptions.Item label="appSecret">
              <Space>
                <Text code>{created.appSecret}</Text>
                <Button
                  icon={<CopyOutlined />}
                  onClick={() => navigator.clipboard.writeText(created.appSecret)}
                />
              </Space>
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
      <Drawer
        title={selectedApplication ? `${selectedApplication.name} 用户` : '第三方课程用户'}
        open={Boolean(selectedApplication)}
        onClose={() => {
          setSelectedApplication(null);
          setApplicationUsers(null);
          setSelectedUserType(undefined);
        }}
        width={980}
      >
        {selectedApplication && (
          <Space direction="vertical" size={16} className="full-width">
            <Space wrap>
              <Select
                allowClear
                value={selectedUserType}
                placeholder="筛选身份"
                style={{ width: 180 }}
                options={[
                  { label: '学生', value: 'STUDENT' },
                  { label: '教师', value: 'TEACHER' },
                  { label: '管理员', value: 'ADMIN' },
                ]}
                onChange={async (value) => {
                  const nextUserType = (value || undefined) as UserType | undefined;
                  setSelectedUserType(nextUserType);
                  await loadApplicationUsers(selectedApplication, nextUserType);
                }}
              />
              <Button
                icon={<ReloadOutlined />}
                onClick={() => loadApplicationUsers(selectedApplication, selectedUserType)}
              >
                刷新
              </Button>
            </Space>
            <Alert
              type="info"
              showIcon
              message="这里显示的是该应用授权范围内的底座平台用户。"
              description="第三方应用只能通过服务端凭证读取这些学校/班级范围内的已审核用户。"
            />
            <Table
              rowKey="id"
              size="small"
              loading={usersLoading}
              dataSource={applicationUsers?.users ?? []}
              pagination={{ pageSize: 10 }}
              columns={[
                {
                  title: '用户',
                  render: (_, record) => (
                    <Space direction="vertical" size={0}>
                      <Text strong>{record.displayName || record.username || record.email}</Text>
                      <Text type="secondary">{record.email}</Text>
                    </Space>
                  ),
                },
                {
                  title: '身份',
                  dataIndex: 'userType',
                  render: (value: UserType) => <Tag color={userTypeColor(value)}>{userTypeLabel(value)}</Tag>,
                },
                {
                  title: '年龄段',
                  dataIndex: 'ageBand',
                  render: (value) => value || <Text type="secondary">未设置</Text>,
                },
                {
                  title: '学校/机构',
                  render: (_, record) => (
                    <Space direction="vertical" size={2}>
                      {record.organizations.length > 0
                        ? record.organizations.map((organization) => (
                            <Tag key={organization.id}>{organization.name}</Tag>
                          ))
                        : <Text type="secondary">未分配</Text>}
                    </Space>
                  ),
                },
                {
                  title: '班级',
                  render: (_, record) => (
                    <Space direction="vertical" size={2}>
                      {record.classes.length > 0
                        ? record.classes.map((classItem) => (
                            <Tag key={classItem.id}>{classItem.organization.name} / {classItem.name}</Tag>
                          ))
                        : <Text type="secondary">未分配</Text>}
                    </Space>
                  ),
                },
                {
                  title: 'platformUserId',
                  dataIndex: 'platformUserId',
                  render: (value) => <Text code>{value}</Text>,
                },
                {
                  title: '创建时间',
                  dataIndex: 'createdAt',
                  render: (value) => new Date(value).toLocaleString(),
                },
              ]}
            />
          </Space>
        )}
      </Drawer>
      <Modal
        title={scopeApplication ? `${scopeApplication.name} 授权范围` : '授权范围'}
        open={Boolean(scopeApplication)}
        onCancel={() => {
          setScopeApplication(null);
          setAccessScope(null);
          scopeForm.resetFields();
        }}
        okText="保存"
        onOk={() => scopeForm.submit()}
        confirmLoading={scopeLoading}
        destroyOnClose
      >
        <Alert
          type="info"
          showIcon
          className="content-alert"
          message="授权范围决定第三方应用可读取哪些底座用户。"
          description="选择学校后，该学校下的班级成员会被纳入；也可以单独选择班级。"
        />
        <Form
          form={scopeForm}
          layout="vertical"
          preserve={false}
          disabled={scopeLoading}
          onFinish={async (values) => {
            if (!scopeApplication) return;
            const nextScope = await api.updateApplicationAccessScope(
              scopeApplication.appId,
              {
                organizationIds: values.organizationIds ?? [],
                classIds: values.classIds ?? [],
              },
            );
            setAccessScope(nextScope);
            messageApi.success('应用授权范围已更新');
            setScopeApplication(null);
            scopeForm.resetFields();
            if (selectedApplication?.appId === scopeApplication.appId) {
              await loadApplicationUsers(selectedApplication, selectedUserType);
            }
          }}
        >
          <Form.Item name="organizationIds" label="可读取学校/机构">
            <Select
              mode="multiple"
              optionFilterProp="label"
              placeholder="选择学校或机构"
              options={scopeOrganizations.map((organization) => ({
                label: `${organization.name}${organization.code ? ` (${organization.code})` : ''}`,
                value: organization.id,
              }))}
            />
          </Form.Item>
          <Form.Item name="classIds" label="可读取班级">
            <Select
              mode="multiple"
              optionFilterProp="label"
              placeholder="选择班级"
              options={scopeOrganizationDetails.flatMap((organization) =>
                organization.classes.map((classItem) => ({
                  label: `${organization.name} / ${classItem.name}${classItem.code ? ` (${classItem.code})` : ''}`,
                  value: classItem.id,
                })),
              )}
            />
          </Form.Item>
        </Form>
        {accessScope && (
          <Text type="secondary">
            当前已授权 {accessScope.organizations.length} 个学校/机构，{accessScope.classes.length} 个班级。
          </Text>
        )}
      </Modal>
    </section>
  );
}

function CoursesPage({ api }: { api: ApiClient }) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [coursewares, setCoursewares] = useState<Courseware[]>([]);
  const [allCoursewares, setAllCoursewares] = useState<Courseware[]>([]);
  const [loading, setLoading] = useState(true);
  const [coursewaresLoading, setCoursewaresLoading] = useState(false);
  const [courseSection, setCourseSection] = useState<'courses' | 'coursewares'>('courses');
  const [courseOpen, setCourseOpen] = useState(false);
  const [courseDetailOpen, setCourseDetailOpen] = useState(false);
  const [coursewareOpen, setCoursewareOpen] = useState(false);
  const [coursewareSelectorOpen, setCoursewareSelectorOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [editingCourseware, setEditingCourseware] = useState<Courseware | null>(null);
  const [selectedCoursewareIds, setSelectedCoursewareIds] = useState<string[]>([]);
  const [uploadCourseware, setUploadCourseware] = useState<Courseware | null>(null);
  const [uploadZipFile, setUploadZipFile] = useState<File | null>(null);
  const [uploadPublish, setUploadPublish] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [manifestDetail, setManifestDetail] = useState<CourseManifestResponse | null>(null);
  const [runtimeDetail, setRuntimeDetail] = useState<CourseRuntimeStatusResponse | null>(null);
  const [runtimeActionCoursewareId, setRuntimeActionCoursewareId] = useState<string | null>(null);
  const [savingCourse, setSavingCourse] = useState(false);
  const [savingCoursewareSelection, setSavingCoursewareSelection] = useState(false);
  const [courseForm] = Form.useForm();
  const [coursewareForm] = Form.useForm();
  const [messageApi, contextHolder] = message.useMessage();
  const selectedUploadBytes = uploadZipFile?.size ?? 0;
  const selectedCourseId = selectedCourse?.id;

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [nextCourses, nextCoursewares] = await Promise.all([
        api.listCourses(),
        api.listAllCoursewares(),
      ]);
      setCourses(nextCourses);
      setAllCoursewares(nextCoursewares);
      if (selectedCourseId && courseDetailOpen) {
        const updatedSelected = nextCourses.find((course) => course.id === selectedCourseId) ?? null;
        setSelectedCourse(updatedSelected);
      }
    } finally {
      setLoading(false);
    }
  }, [api, courseDetailOpen, selectedCourseId]);

  const loadCoursewares = useCallback(async (course: Course) => {
    setCoursewaresLoading(true);
    try {
      setCoursewares(await api.listCoursewares(course.id));
    } finally {
      setCoursewaresLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const openCourseEditor = (course?: Course) => {
    setEditingCourse(course ?? null);
    courseForm.setFieldsValue(
      course ?? {
        ownerType: 'ADMIN',
      },
    );
    setCourseOpen(true);
  };

  const openCourseDetail = async (course: Course) => {
    setSelectedCourse(course);
    setCourseDetailOpen(true);
    await loadCoursewares(course);
  };

  const openCoursewareSelector = () => {
    if (!selectedCourse) return;
    setSelectedCoursewareIds(coursewares.map((courseware) => courseware.id));
    setCoursewareSelectorOpen(true);
  };

  const openCoursewareEditor = (courseware?: Courseware) => {
    setEditingCourseware(courseware ?? null);
    coursewareForm.setFieldsValue(
      courseware ?? {
        courseId: selectedCourse?.id,
        sortOrder: (coursewares[coursewares.length - 1]?.sortOrder ?? 0) + 10,
      },
    );
    setCoursewareOpen(true);
  };

  const openUploader = (courseware: Courseware) => {
    setUploadCourseware(courseware);
    setUploadZipFile(null);
    setUploadPublish(courseware.status !== 'PUBLISHED');
    setUploadOpen(true);
  };

  const [uploadOpen, setUploadOpen] = useState(false);

  const refreshCoursewares = async () => {
    if (selectedCourse && courseDetailOpen) {
      await loadCoursewares(selectedCourse);
    }
    await reload();
  };

  const openManifestDetail = async (courseware: Courseware) => {
    const detail = await api.getCoursewareManifest(courseware.id);
    setRuntimeDetail(null);
    setManifestDetail(detail);
  };

  const openRuntimeDetail = async (courseware: Courseware) => {
    const detail = await api.getCoursewareRuntimeStatus(courseware.id);
    setRuntimeDetail(detail);
    setManifestDetail(detail);
  };

  const returnToCoursewareManagement = () => {
    setManifestDetail(null);
    setRuntimeDetail(null);
    setUploadOpen(false);
    setUploadCourseware(null);
    setCoursewareOpen(false);
    setEditingCourseware(null);
    setCourseDetailOpen(false);
    setSelectedCourse(null);
    setCourseSection('coursewares');
  };

  const runRuntimeAction = async (courseware: Courseware, action: 'deploy' | 'restart') => {
    setRuntimeActionCoursewareId(courseware.id);
    try {
      const result =
        action === 'deploy'
          ? await api.deployCoursewareRuntime(courseware.id)
          : await api.restartCoursewareRuntime(courseware.id);
      if (result.running) {
        await refreshCoursewares();
        returnToCoursewareManagement();
        messageApi.success(
          action === 'deploy'
            ? '部署成功，已返回课程课件管理页'
            : '重启成功，已返回课程课件管理页',
        );
      } else {
        setRuntimeDetail(result);
        setManifestDetail(result);
        messageApi.error(result.error ?? result.courseware?.deploymentMessage ?? 'Node 课件操作失败');
        await refreshCoursewares();
      }
    } finally {
      setRuntimeActionCoursewareId(null);
    }
  };

  const removeCoursewareFromCourse = async (courseware: Courseware) => {
    if (!selectedCourse) return;
    const nextIds = coursewares
      .filter((item) => item.id !== courseware.id)
      .map((item) => item.id);
    await api.selectCoursewares(selectedCourse.id, nextIds);
    messageApi.success('课件已从当前课程移出');
    await loadCoursewares(selectedCourse);
    await reload();
  };

  const courseColumns: ColumnsType<Course> = [
    {
      title: '课程',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Button type="link" className="table-link" onClick={() => openCourseDetail(record)}>
            {record.title}
          </Button>
          <Text type="secondary">访问短名：{record.slug}</Text>
        </Space>
      ),
    },
    {
      title: '课件数',
      render: (_, record) => record._count?.coursewares ?? record.coursewares?.length ?? 0,
    },
    {
      title: '任务/记录',
      render: (_, record) => (
        <Text>
          {record._count?.assignments ?? 0} / {record._count?.learningRecords ?? 0}
        </Text>
      ),
    },
    {
      title: '课程来源',
      dataIndex: 'ownerType',
      render: (value: CourseOwnerType) => <Tag>{courseOwnerLabel(value)}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (value: CourseStatus) => <CourseStatusTag status={value} />,
    },
    {
      title: '操作',
      align: 'right',
      render: (_, record) => (
        <Space>
          <Button size="small" onClick={() => openCourseDetail(record)}>
            管理课件
          </Button>
          <Button size="small" onClick={() => openCourseEditor(record)}>
            编辑
          </Button>
          <Popconfirm
            title="移入回收站"
            description="课程和其下课件会被归档并移入回收站，教师和学生将不可继续使用。"
            okText="删除"
            cancelText="取消"
            onConfirm={async () => {
              await api.deleteCourse(record.id);
              messageApi.success('课程已移入回收站');
              if (selectedCourse?.id === record.id) {
                setCourseDetailOpen(false);
                setSelectedCourse(null);
                setCoursewares([]);
              }
              await reload();
            }}
          >
            <Button danger size="small" icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
          <Select
            size="small"
            value={record.status}
            style={{ width: 112 }}
            options={[
              { label: '草稿', value: 'DRAFT' },
              { label: '发布', value: 'PUBLISHED' },
              { label: '归档', value: 'ARCHIVED' },
            ]}
            onChange={async (status: CourseStatus) => {
              await api.updateCourseStatus(record.id, status);
              messageApi.success('课程状态已更新');
              await reload();
            }}
          />
        </Space>
      ),
    },
  ];

  const coursewareColumns: ColumnsType<Courseware> = [
    {
      title: '课件',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{record.title}</Text>
          <Text type="secondary">访问短名：{record.slug}</Text>
          <a href={record.entryUrl} target="_blank">{record.entryUrl}</a>
        </Space>
      ),
    },
    {
      title: '来源课程',
      render: (_: unknown, record: Courseware) => {
        const course = record.course ?? courses.find((item) => item.id === record.courseId);
        return course ? (
          <Space direction="vertical" size={0}>
            <Button
              type="link"
              className="table-link"
              onClick={() => openCourseDetail(course)}
            >
              {course.title}
            </Button>
            <Text type="secondary">访问短名：{course.slug}</Text>
          </Space>
        ) : (
          <Text type="secondary">未找到课程</Text>
        );
      },
    },
    {
      title: '顺序',
      dataIndex: 'sortOrder',
      width: 84,
    },
    {
      title: '课件类型',
      dataIndex: 'runtimeType',
      render: (value: CourseRuntimeType) => <Tag>{courseRuntimeLabel(value)}</Tag>,
    },
    {
      title: '记录',
      render: (_, record) => record._count?.learningRecords ?? 0,
    },
    {
      title: '课件状态',
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <CourseStatusTag status={record.status} />
          <CourseDeploymentStatusTag status={record.deploymentStatus} />
          {record.manifestValid ? (
            <Tag color="success">manifest 通过</Tag>
          ) : record.manifestErrors?.length ? (
            <Tag color="error">manifest 异常</Tag>
          ) : (
            <Tag>未上传</Tag>
          )}
        </Space>
      ),
    },
    {
      title: '操作',
      align: 'right',
      render: (_, record) => (
        <Space wrap>
          <Button size="small" icon={<FileZipOutlined />} onClick={() => openUploader(record)}>
            上传 ZIP
          </Button>
          <Button size="small" icon={<EyeOutlined />} onClick={() => openManifestDetail(record)}>
            manifest
          </Button>
          {record.runtimeType !== 'STATIC' && (
            <Button
              size="small"
              type={record.deploymentStatus === 'RUNNING' ? 'default' : 'primary'}
              icon={record.deploymentStatus === 'RUNNING' ? <SyncOutlined /> : <RocketOutlined />}
              loading={runtimeActionCoursewareId === record.id}
              disabled={!record.manifestValid}
              onClick={() =>
                runRuntimeAction(
                  record,
                  record.deploymentStatus === 'RUNNING' ? 'restart' : 'deploy',
                )
              }
            >
              {record.deploymentStatus === 'RUNNING' ? '重启' : '部署'}
            </Button>
          )}
          <Button size="small" onClick={() => openCoursewareEditor(record)}>
            编辑
          </Button>
          <Popconfirm
            title="移入回收站"
            description="该课件将被归档并从教师/学生课程页隐藏。"
            okText="删除"
            cancelText="取消"
            onConfirm={async () => {
              await api.deleteCourseware(record.id);
              messageApi.success('课件已移入回收站');
              await refreshCoursewares();
            }}
          >
            <Button danger size="small" icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
          <Button
            size="small"
            onClick={() => {
              const course = record.course ?? courses.find((item) => item.id === record.courseId);
              if (course) void openCourseDetail(course);
            }}
          >
            管理课程
          </Button>
          <Select
            size="small"
            value={record.status}
            style={{ width: 112 }}
            options={[
              { label: '草稿', value: 'DRAFT' },
              { label: '发布', value: 'PUBLISHED' },
              { label: '归档', value: 'ARCHIVED' },
            ]}
            onChange={async (status: CourseStatus) => {
              await api.updateCoursewareStatus(record.id, status);
              messageApi.success('课件状态已更新');
              await refreshCoursewares();
            }}
          />
        </Space>
      ),
    },
  ];

  const selectedCoursewareColumns: ColumnsType<Courseware> = [
    {
      title: '课件介绍',
      render: (_, record) => (
        <Space direction="vertical" size={4}>
          <Text strong>{record.title}</Text>
          <Text type="secondary">{record.description || '未填写课件简介'}</Text>
          <Text type="secondary">访问短名：{record.slug}</Text>
          <a href={record.entryUrl} target="_blank">{record.entryUrl}</a>
        </Space>
      ),
    },
    {
      title: '课件类型',
      width: 120,
      dataIndex: 'runtimeType',
      render: (value: CourseRuntimeType) => <Tag>{courseRuntimeLabel(value)}</Tag>,
    },
    {
      title: '学习记录',
      width: 100,
      render: (_, record) => record._count?.learningRecords ?? 0,
    },
    {
      title: '当前状态',
      width: 160,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <CourseStatusTag status={record.status} />
          <CourseDeploymentStatusTag status={record.deploymentStatus} />
          {record.manifestValid ? (
            <Tag color="success">manifest 通过</Tag>
          ) : record.manifestErrors?.length ? (
            <Tag color="error">manifest 异常</Tag>
          ) : (
            <Tag>未上传</Tag>
          )}
        </Space>
      ),
    },
    {
      title: '操作',
      width: 120,
      align: 'right',
      render: (_, record) => (
        <Popconfirm
          title="移出当前课程"
          description="课件仍保留在课件库，只是不再属于当前课程。"
          okText="移出"
          cancelText="取消"
          onConfirm={() => removeCoursewareFromCourse(record)}
        >
          <Button danger size="small" icon={<DeleteOutlined />}>
            移出课程
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <section>
      {contextHolder}
      <PageHeader
        title="课程课件"
        description="课程是教学主题容器；课件是课程下可上传、发布、部署和记录成绩的具体互动内容。"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={reload}>
              刷新
            </Button>
            {courseSection === 'courses' ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => openCourseEditor()}>
                新建课程
              </Button>
            ) : (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                disabled={courses.length === 0}
                onClick={() => openCoursewareEditor()}
              >
                新增课件
              </Button>
            )}
          </Space>
        }
      />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 16,
          marginBottom: 16,
        }}
      >
        <Card
          hoverable
          onClick={() => setCourseSection('courses')}
          style={{
            borderColor: courseSection === 'courses' ? '#1677ff' : undefined,
            boxShadow: courseSection === 'courses' ? '0 8px 24px rgba(22, 119, 255, 0.12)' : undefined,
          }}
        >
          <Space align="start" size="middle">
            <BookOutlined style={{ color: '#1677ff', fontSize: 28 }} />
            <Space direction="vertical" size={2}>
              <Text strong>课程管理</Text>
              <Text type="secondary">创建教学主题，发布后教师可给班级布置整门课程。</Text>
              <Text type="secondary">当前 {courses.length} 门课程</Text>
            </Space>
          </Space>
        </Card>
        <Card
          hoverable
          onClick={() => setCourseSection('coursewares')}
          style={{
            borderColor: courseSection === 'coursewares' ? '#1677ff' : undefined,
            boxShadow: courseSection === 'coursewares' ? '0 8px 24px rgba(22, 119, 255, 0.12)' : undefined,
          }}
        >
          <Space align="start" size="middle">
            <FileDoneOutlined style={{ color: '#1677ff', fontSize: 28 }} />
            <Space direction="vertical" size={2}>
              <Text strong>课件管理</Text>
              <Text type="secondary">课件库负责创建、上传 ZIP、校验 manifest、发布和部署。</Text>
              <Text type="secondary">当前 {allCoursewares.length} 个课件</Text>
            </Space>
          </Space>
        </Card>
      </div>
      <Alert
        className="content-alert"
        type="info"
        showIcon
        message={
          courseSection === 'courses'
            ? '课程是教学主题，教师布置的是整门课程。'
            : '课件是真正运行的互动内容，课程会从这里选择引用。'
        }
        description={
          courseSection === 'courses'
            ? '进入课程详情后从已有课件中选择最多 5 个课件；学生进入课程后选择课件学习。'
            : '每个课件独立 ZIP、manifest、部署状态和学习记录；创建并部署后，可被一门或多门课程选择使用。'
        }
      />
      {courseSection === 'courses' ? (
        <Table
          rowKey="id"
          columns={courseColumns}
          dataSource={courses}
          loading={loading}
          pagination={{ pageSize: 8 }}
        />
      ) : (
        <Table
          rowKey="id"
          columns={coursewareColumns}
          dataSource={allCoursewares}
          loading={loading}
          pagination={{ pageSize: 8 }}
        />
      )}

      <Modal
        title={editingCourse ? '编辑课程' : '新建课程'}
        open={courseOpen}
        onCancel={() => {
          setCourseOpen(false);
          setEditingCourse(null);
          courseForm.resetFields();
        }}
        okText="保存"
        confirmLoading={savingCourse}
        onOk={() => courseForm.submit()}
        destroyOnClose
      >
        <Form
          form={courseForm}
          layout="vertical"
          preserve={false}
          onFinish={async (values) => {
            const courseValues = {
              ...values,
              slug: values.slug || undefined,
              description: values.description || undefined,
            };
            setSavingCourse(true);
            try {
              if (editingCourse) {
                await api.updateCourse(editingCourse.id, courseValues);
                messageApi.success('课程已更新');
              } else {
                await api.createCourse(courseValues);
                messageApi.success('课程已创建');
              }
              setCourseOpen(false);
              setEditingCourse(null);
              courseForm.resetFields();
              await reload();
            } catch (error) {
              messageApi.error(error instanceof Error ? error.message : '课程保存失败');
            } finally {
              setSavingCourse(false);
            }
          }}
        >
          <Form.Item
            name="slug"
            label="课程访问短名（可选）"
            extra="用于生成课程网址，只能使用英文、数字、短横线或下划线；不填则系统自动生成。"
          >
            <Input placeholder="可不填，例如 ai-eco-island" />
          </Form.Item>
          <Form.Item
            name="title"
            label="课程名称"
            rules={[{ required: true, message: '请输入课程名称' }]}
          >
            <Input placeholder="AI 生态探险课" />
          </Form.Item>
          <Form.Item name="description" label="课程简介">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="ownerType" label="课程来源">
            <Select
              options={[
                { label: '管理员', value: 'ADMIN' },
                { label: '教师', value: 'TEACHER' },
                { label: '开发者', value: 'DEVELOPER' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={selectedCourse ? `课程课件：${selectedCourse.title}` : '课程课件'}
        width={1080}
        open={courseDetailOpen}
        onClose={() => {
          setCourseDetailOpen(false);
          setSelectedCourse(null);
          setCoursewares([]);
          setCoursewareOpen(false);
          setEditingCourseware(null);
          setCoursewareSelectorOpen(false);
          setSelectedCoursewareIds([]);
          coursewareForm.resetFields();
        }}
        extra={
          selectedCourse ? (
            <Space>
              <Button icon={<ReloadOutlined />} onClick={() => loadCoursewares(selectedCourse)}>
                刷新
              </Button>
              <Button type="primary" icon={<CheckCircleOutlined />} onClick={openCoursewareSelector}>
                选择已有课件
              </Button>
            </Space>
          ) : null
        }
      >
        {selectedCourse && (
          <Space direction="vertical" size="middle" className="full-width">
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="课程访问短名">{selectedCourse.slug}</Descriptions.Item>
              <Descriptions.Item label="课程状态">
                <CourseStatusTag status={selectedCourse.status} />
              </Descriptions.Item>
              <Descriptions.Item label="课程简介" span={2}>
                {selectedCourse.description || '未填写'}
              </Descriptions.Item>
            </Descriptions>
            <Alert
              type="info"
              showIcon
              message={`当前课程已选择 ${coursewares.length} / 5 个课件`}
              description="课程只负责选择课件；课件本身的创建、上传 ZIP、部署和发布在课件管理中完成。"
            />
            <Table
              rowKey="id"
              size="small"
              columns={selectedCoursewareColumns}
              dataSource={coursewares}
              loading={coursewaresLoading}
              pagination={false}
            />
          </Space>
        )}
      </Drawer>

      <Modal
        title={selectedCourse ? `选择课件：${selectedCourse.title}` : '选择课件'}
        open={coursewareSelectorOpen}
        okText="保存选择"
        confirmLoading={savingCoursewareSelection}
        onCancel={() => {
          setCoursewareSelectorOpen(false);
          setSelectedCoursewareIds([]);
        }}
        onOk={async () => {
          if (!selectedCourse) return;
          if (selectedCoursewareIds.length > 5) {
            messageApi.error('一门课程最多选择 5 个课件');
            return;
          }

          setSavingCoursewareSelection(true);
          try {
            const nextCoursewares = await api.selectCoursewares(
              selectedCourse.id,
              selectedCoursewareIds,
            );
            setCoursewares(nextCoursewares);
            setCoursewareSelectorOpen(false);
            setSelectedCoursewareIds([]);
            messageApi.success('课程课件选择已保存');
            await reload();
          } catch (error) {
            messageApi.error(error instanceof Error ? error.message : '保存课件选择失败');
          } finally {
            setSavingCoursewareSelection(false);
          }
        }}
        destroyOnClose
      >
        <Space direction="vertical" size="middle" className="full-width">
          <Alert
            type="info"
            showIcon
            message="从课件库选择已有课件"
            description="暂时每门课程最多选择 5 个课件；课件的上传、部署和发布仍在课件管理里完成。"
          />
          <Select
            mode="multiple"
            showSearch
            value={selectedCoursewareIds}
            placeholder="选择已有课件"
            optionFilterProp="label"
            className="full-width"
            onChange={(values) => {
              if (values.length > 5) {
                messageApi.warning('一门课程最多选择 5 个课件');
                setSelectedCoursewareIds(values.slice(0, 5));
                return;
              }
              setSelectedCoursewareIds(values);
            }}
            options={allCoursewares.map((courseware) => {
              const sourceCourse =
                courseware.course ?? courses.find((course) => course.id === courseware.courseId);
              const sourceLabel = sourceCourse ? ` / 来源：${sourceCourse.title}` : '';
              const statusLabel = courseware.status === 'PUBLISHED' ? '已发布' : '未发布';
              return {
                label: `${courseware.title}${sourceLabel} / ${statusLabel}`,
                value: courseware.id,
              };
            })}
          />
          <Text type="secondary">已选择 {selectedCoursewareIds.length} / 5 个课件</Text>
        </Space>
      </Modal>

      <Modal
        title={editingCourseware ? '编辑课件' : '新增课件'}
        open={coursewareOpen}
        onCancel={() => {
          setCoursewareOpen(false);
          setEditingCourseware(null);
          coursewareForm.resetFields();
        }}
        okText="保存"
        onOk={() => coursewareForm.submit()}
        destroyOnClose
      >
        <Form
          form={coursewareForm}
          layout="vertical"
          preserve={false}
          onFinish={async (values) => {
            if (!selectedCourse && !editingCourseware && !values.courseId) {
              messageApi.error('请选择课件所属课程');
              return;
            }
            const normalizedValues = {
              courseId: values.courseId,
              sortOrder:
                values.sortOrder === undefined || values.sortOrder === ''
                  ? undefined
                  : Number(values.sortOrder),
              title: values.title,
              description: values.description || undefined,
            };
            const { courseId, ...coursewareValues } = normalizedValues;
            if (editingCourseware) {
              await api.updateCourseware(editingCourseware.id, coursewareValues);
              messageApi.success('课件已更新');
            } else {
              await api.createCourseware(selectedCourse?.id ?? courseId, coursewareValues);
              messageApi.success('课件已创建');
            }
            setCoursewareOpen(false);
            setEditingCourseware(null);
            coursewareForm.resetFields();
            await refreshCoursewares();
          }}
        >
          {!editingCourseware && !selectedCourse && (
            <Form.Item
              name="courseId"
              label="所属课程"
              rules={[{ required: true, message: '请选择课件所属课程' }]}
            >
              <Select
                placeholder="选择课件要归属的课程"
                options={courses.map((course) => ({
                  label: `${course.title}（访问短名：${course.slug}）`,
                  value: course.id,
                }))}
              />
            </Form.Item>
          )}
          {editingCourseware?.course && (
            <Alert
              className="content-alert"
              type="info"
              showIcon
              message={`所属课程：${editingCourseware.course.title}`}
              description="已创建的课件暂不支持直接改换课程；如需调整，可在目标课程下重新创建课件。"
            />
          )}
          <Alert
            className="content-alert"
            type="info"
            showIcon
            message="课件地址和课件类型由系统自动处理"
            description="创建课件时无需填写访问短名、运行方式或入口地址；上传 ZIP 后，系统会按 manifest 自动识别是否需要部署。"
          />
          <Form.Item
            name="title"
            label="课件名称"
            rules={[{ required: true, message: '请输入课件名称' }]}
          >
            <Input placeholder="拯救小岛生态：互动体验" />
          </Form.Item>
          <Form.Item name="description" label="课件简介">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="sortOrder" label="排序值">
            <Input type="number" placeholder="10" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={uploadCourseware ? `上传课件：${uploadCourseware.title}` : '上传课件'}
        open={uploadOpen}
        okText="上传"
        confirmLoading={uploading}
        onCancel={() => {
          setUploadOpen(false);
          setUploadCourseware(null);
          setUploadZipFile(null);
        }}
        onOk={async () => {
          if (!uploadCourseware) return;
          if (!uploadZipFile) {
            messageApi.error('请选择课件 ZIP 文件');
            return;
          }

          setUploading(true);
          try {
            const result = await api.uploadCoursewareZip(uploadCourseware.id, {
              fileName: uploadZipFile.name,
              contentBase64: await fileToBase64(uploadZipFile),
              publish: uploadPublish,
            });
            if (result.manifestValid === false) {
              messageApi.warning('课件已上传，但 manifest 校验未通过');
            } else {
              messageApi.success(`已上传并校验 ${result.files.length} 个文件`);
            }
            setUploadOpen(false);
            setUploadCourseware(null);
            setUploadZipFile(null);
            await refreshCoursewares();
          } finally {
            setUploading(false);
          }
        }}
        destroyOnClose
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message="选择课件 ZIP 上传"
            description="ZIP 根目录建议包含 manifest.json，以及 static/ 或 server/。Node 课件上传后进入待部署状态，系统会自动分配内部端口。"
          />
          <input
            type="file"
            accept=".zip,application/zip"
            onChange={(event) => {
              setUploadZipFile(event.target.files?.[0] ?? null);
            }}
          />
          <Text type="secondary">
            {uploadZipFile
              ? `已选择 ${uploadZipFile.name}，约 ${formatBytes(selectedUploadBytes)}`
              : '未选择 ZIP 文件'}
          </Text>
          <Space>
            <Text>校验通过后发布课件</Text>
            <Switch checked={uploadPublish} onChange={setUploadPublish} />
          </Space>
        </Space>
      </Modal>

      <Drawer
        title={manifestDetail?.courseware ? `课件详情：${manifestDetail.courseware.title}` : '课件详情'}
        width={760}
        open={Boolean(manifestDetail)}
        onClose={() => {
          setManifestDetail(null);
          setRuntimeDetail(null);
        }}
        extra={
          manifestDetail?.courseware && manifestDetail.courseware.runtimeType !== 'STATIC' ? (
            <Space>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => manifestDetail.courseware && openRuntimeDetail(manifestDetail.courseware)}
              >
                刷新状态
              </Button>
              <Button
                type={manifestDetail.courseware.deploymentStatus === 'RUNNING' ? 'default' : 'primary'}
                icon={manifestDetail.courseware.deploymentStatus === 'RUNNING' ? <SyncOutlined /> : <RocketOutlined />}
                loading={runtimeActionCoursewareId === manifestDetail.courseware.id}
                disabled={!manifestDetail.courseware.manifestValid}
                onClick={() =>
                  manifestDetail.courseware &&
                  runRuntimeAction(
                    manifestDetail.courseware,
                    manifestDetail.courseware.deploymentStatus === 'RUNNING' ? 'restart' : 'deploy',
                  )
                }
              >
                {manifestDetail.courseware.deploymentStatus === 'RUNNING' ? '重启' : '部署'}
              </Button>
            </Space>
          ) : null
        }
      >
        {manifestDetail && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Descriptions bordered column={1} size="small">
              <Descriptions.Item label="课程">{manifestDetail.course.title}</Descriptions.Item>
              <Descriptions.Item label="课件访问短名">
                {manifestDetail.courseware?.slug ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label="服务器目录">
                {manifestDetail.coursewareRoot ?? manifestDetail.courseRoot}
              </Descriptions.Item>
              <Descriptions.Item label="课件入口">
                {manifestDetail.courseware ? (
                  <a href={manifestDetail.courseware.entryUrl} target="_blank">
                    {manifestDetail.courseware.entryUrl}
                  </a>
                ) : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="运行方式">
                {manifestDetail.courseware
                  ? courseRuntimeLabel(manifestDetail.courseware.runtimeType)
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="部署状态">
                <CourseDeploymentStatusTag status={manifestDetail.deploymentStatus} />
                {manifestDetail.deploymentMessage && (
                  <Text type="secondary" style={{ marginLeft: 8 }}>
                    {manifestDetail.deploymentMessage}
                  </Text>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="系统自动端口">
                {manifestDetail.nodePort ?? '静态课件不需要'}
              </Descriptions.Item>
              {runtimeDetail && (
                <Descriptions.Item label="守护服务">
                  {runtimeDetail.serviceName ?? '未登记'}
                  <Text type="secondary" style={{ marginLeft: 8 }}>
                    {runtimeDetail.systemdManaged
                      ? runtimeDetail.systemdActive
                        ? 'systemd active'
                        : 'systemd inactive'
                      : '未托管'}
                  </Text>
                </Descriptions.Item>
              )}
            </Descriptions>
            <Alert
              type={manifestDetail.manifestValid ? 'success' : 'error'}
              showIcon
              message={manifestDetail.manifestValid ? 'manifest 校验通过' : 'manifest 校验未通过'}
              description={
                manifestDetail.manifestErrors.length > 0
                  ? manifestDetail.manifestErrors.join('；')
                  : '课件结构符合当前底座规范。'
              }
            />
            <div>
              <Text strong>manifest.json</Text>
              <pre className="code-preview">
                {JSON.stringify(manifestDetail.manifest ?? {}, null, 2)}
              </pre>
            </div>
            {runtimeDetail?.logTail && (
              <div>
                <Text strong>部署日志</Text>
                <pre className="code-preview">{runtimeDetail.logTail}</pre>
              </div>
            )}
          </Space>
        )}
      </Drawer>
    </section>
  );
}

function LegacyCoursesPage({ api }: { api: ApiClient }) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadCourse, setUploadCourse] = useState<Course | null>(null);
  const [uploadZipFile, setUploadZipFile] = useState<File | null>(null);
  const [uploadPublish, setUploadPublish] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [manifestDetail, setManifestDetail] = useState<CourseManifestResponse | null>(null);
  const [runtimeDetail, setRuntimeDetail] = useState<CourseRuntimeStatusResponse | null>(null);
  const [manifestLoading, setManifestLoading] = useState(false);
  const [runtimeActionCourseId, setRuntimeActionCourseId] = useState<string | null>(null);
  const [savingCourse, setSavingCourse] = useState(false);
  const [form] = Form.useForm();
  const [messageApi, contextHolder] = message.useMessage();
  const selectedUploadBytes = uploadZipFile?.size ?? 0;

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setCourses(await api.listCourses());
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const openEditor = (course?: Course) => {
    setEditingCourse(course ?? null);
    form.setFieldsValue(
      course ?? {
        runtimeType: 'STATIC',
        ownerType: 'ADMIN',
        entryUrl: 'http://agent.docpine.online/',
      },
    );
    setOpen(true);
  };

  const openUploader = (course: Course) => {
    setUploadCourse(course);
    setUploadZipFile(null);
    setUploadPublish(course.status !== 'PUBLISHED');
    setUploadOpen(true);
  };

  const openManifestDetail = async (course: Course) => {
    setManifestLoading(true);
    setRuntimeDetail(null);
    try {
      setManifestDetail(await api.getCourseManifest(course.id));
    } finally {
      setManifestLoading(false);
    }
  };

  const openRuntimeDetail = async (course: Course) => {
    setManifestLoading(true);
    try {
      const detail = await api.getCourseRuntimeStatus(course.id);
      setRuntimeDetail(detail);
      setManifestDetail(detail);
    } finally {
      setManifestLoading(false);
    }
  };

  const runRuntimeAction = async (course: Course, action: 'deploy' | 'restart') => {
    setRuntimeActionCourseId(course.id);
    try {
      const result =
        action === 'deploy'
          ? await api.deployCourseRuntime(course.id)
          : await api.restartCourseRuntime(course.id);
      setRuntimeDetail(result);
      setManifestDetail(result);
      if (result.running) {
        messageApi.success(action === 'deploy' ? 'Node 课件已部署并运行' : 'Node 课件已重启');
      } else {
        messageApi.error(result.error ?? result.course.deploymentMessage ?? 'Node 课件操作失败');
      }
      await reload();
    } finally {
      setRuntimeActionCourseId(null);
    }
  };

  const columns: ColumnsType<Course> = [
    {
      title: '课程',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{record.title}</Text>
          <Text type="secondary">访问短名：{record.slug}</Text>
        </Space>
      ),
    },
    {
      title: '入口',
      dataIndex: 'entryUrl',
      render: (value: string) => <a href={value} target="_blank">{value}</a>,
    },
    {
      title: '运行方式',
      dataIndex: 'runtimeType',
      render: (value: CourseRuntimeType) => <Tag>{courseRuntimeLabel(value)}</Tag>,
    },
    {
      title: '归属',
      dataIndex: 'ownerType',
      render: (value: CourseOwnerType) => <Tag>{courseOwnerLabel(value)}</Tag>,
    },
    {
      title: '任务/记录',
      render: (_, record) => (
        <Text>
          {record._count?.assignments ?? 0} / {record._count?.learningRecords ?? 0}
        </Text>
      ),
    },
    {
      title: '课程状态',
      dataIndex: 'status',
      render: (value: CourseStatus) => <CourseStatusTag status={value} />,
    },
    {
      title: '课件状态',
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <CourseDeploymentStatusTag status={record.deploymentStatus} />
          {record.manifestValid ? (
            <Tag color="success">manifest 通过</Tag>
          ) : record.manifestErrors?.length ? (
            <Tag color="error">manifest 异常</Tag>
          ) : (
            <Tag>未上传</Tag>
          )}
        </Space>
      ),
    },
    {
      title: '操作',
      align: 'right',
      render: (_, record) => (
        <Space>
          <Button
            size="small"
            icon={<FileZipOutlined />}
            onClick={() => openUploader(record)}
          >
            上传 ZIP
          </Button>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => openManifestDetail(record)}
          >
            manifest
          </Button>
          {record.runtimeType !== 'STATIC' && (
            <Button
              size="small"
              type={record.deploymentStatus === 'RUNNING' ? 'default' : 'primary'}
              icon={record.deploymentStatus === 'RUNNING' ? <SyncOutlined /> : <RocketOutlined />}
              loading={runtimeActionCourseId === record.id}
              disabled={!record.manifestValid}
              onClick={() =>
                runRuntimeAction(
                  record,
                  record.deploymentStatus === 'RUNNING' ? 'restart' : 'deploy',
                )
              }
            >
              {record.deploymentStatus === 'RUNNING' ? '重启' : '部署'}
            </Button>
          )}
          <Button size="small" onClick={() => openEditor(record)}>
            编辑
          </Button>
          <Select
            size="small"
            value={record.status}
            style={{ width: 112 }}
            options={[
              { label: '草稿', value: 'DRAFT' },
              { label: '发布', value: 'PUBLISHED' },
              { label: '归档', value: 'ARCHIVED' },
            ]}
            onChange={async (status: CourseStatus) => {
              await api.updateCourseStatus(record.id, status);
              messageApi.success('课程状态已更新');
              await reload();
            }}
          />
        </Space>
      ),
    },
  ];

  return (
    <section>
      {contextHolder}
      <PageHeader
        title="课程课件"
        description="登记课程、课件运行入口和发布状态。学生与教师门户只展示已发布课程。"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={reload}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor()}>
              新建课程
            </Button>
          </Space>
        }
      />
      <Alert
        className="content-alert"
        type="info"
        showIcon
        message="课件 ZIP 上传后由底座校验 manifest"
        description="静态课件校验通过后可直接发布；Node 课件会显示部署状态，管理员可在后台一键部署或重启。"
      />
      <Table
        rowKey="id"
        columns={columns}
        dataSource={courses}
        loading={loading}
        pagination={{ pageSize: 8 }}
      />
      <Modal
        title={editingCourse ? '编辑课程' : '新建课程'}
        open={open}
        onCancel={() => {
          setOpen(false);
          setEditingCourse(null);
          form.resetFields();
        }}
        okText="保存"
        confirmLoading={savingCourse}
        onOk={() => form.submit()}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          preserve={false}
          onFinish={async (values) => {
            const courseValues = {
              ...values,
              slug: values.slug || undefined,
              description: values.description || undefined,
            };
            setSavingCourse(true);
            try {
              if (editingCourse) {
                await api.updateCourse(editingCourse.id, courseValues);
                messageApi.success('课程已更新');
              } else {
                await api.createCourse(courseValues);
                messageApi.success('课程已创建');
              }
              setOpen(false);
              setEditingCourse(null);
              form.resetFields();
              await reload();
            } catch (error) {
              messageApi.error(error instanceof Error ? error.message : '课程保存失败');
            } finally {
              setSavingCourse(false);
            }
          }}
        >
          <Form.Item
            name="slug"
            label="课程访问短名（可选）"
            extra="用于生成课程网址，只能使用英文、数字、短横线或下划线；不填则系统自动生成。"
          >
            <Input placeholder="可不填，例如 can-machines-learn" />
          </Form.Item>
          <Form.Item
            name="title"
            label="课程名称"
            rules={[{ required: true, message: '请输入课程名称' }]}
          >
            <Input placeholder="机器真的能学习吗？" />
          </Form.Item>
          <Form.Item name="description" label="课程简介">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item
            name="entryUrl"
            label="课程入口"
            rules={[{ required: true, message: '请输入课程入口' }]}
          >
            <Input placeholder="http://agent.docpine.online/can-machines-learn/" />
          </Form.Item>
          <Form.Item name="runtimeType" label="运行方式">
            <Select
              options={[
                { label: '静态前端', value: 'STATIC' },
                { label: 'Node 服务', value: 'NODE' },
                { label: '静态 + Node', value: 'BOTH' },
              ]}
            />
          </Form.Item>
          <Form.Item name="ownerType" label="课程来源">
            <Select
              options={[
                { label: '管理员', value: 'ADMIN' },
                { label: '教师', value: 'TEACHER' },
                { label: '开发者', value: 'DEVELOPER' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={uploadCourse ? `上传课件：${uploadCourse.title}` : '上传课件'}
        open={uploadOpen}
        okText="上传"
        confirmLoading={uploading}
        onCancel={() => {
          setUploadOpen(false);
          setUploadCourse(null);
          setUploadZipFile(null);
        }}
        onOk={async () => {
          if (!uploadCourse) return;
          if (!uploadZipFile) {
            messageApi.error('请选择课件 ZIP 文件');
            return;
          }

          setUploading(true);
          try {
            const result = await api.uploadCourseZip(uploadCourse.id, {
              fileName: uploadZipFile.name,
              contentBase64: await fileToBase64(uploadZipFile),
              publish: uploadPublish,
            });
            if (result.manifestValid === false) {
              messageApi.warning('课件已上传，但 manifest 校验未通过');
            } else {
              messageApi.success(`已上传并校验 ${result.files.length} 个文件`);
            }
            setUploadOpen(false);
            setUploadCourse(null);
            setUploadZipFile(null);
            await reload();
          } finally {
            setUploading(false);
          }
        }}
        destroyOnClose
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message="选择课件 ZIP 上传"
            description="ZIP 根目录建议包含 manifest.json，以及 static/ 或 server/。Node 课件上传后进入待部署状态，系统会自动分配内部端口。"
          />
          <input
            type="file"
            accept=".zip,application/zip"
            onChange={(event) => {
              setUploadZipFile(event.target.files?.[0] ?? null);
            }}
          />
          <Text type="secondary">
            {uploadZipFile
              ? `已选择 ${uploadZipFile.name}，约 ${formatBytes(selectedUploadBytes)}`
              : '未选择 ZIP 文件'}
          </Text>
          <Space>
            <Text>校验通过后发布课程</Text>
            <Switch checked={uploadPublish} onChange={setUploadPublish} />
          </Space>
        </Space>
      </Modal>
      <Drawer
        title={manifestDetail ? `课件详情：${manifestDetail.course.title}` : '课件详情'}
        width={760}
        open={Boolean(manifestDetail)}
        onClose={() => {
          setManifestDetail(null);
          setRuntimeDetail(null);
        }}
        extra={
          manifestDetail && manifestDetail.course.runtimeType !== 'STATIC' ? (
            <Space>
              <Button
                icon={<ReloadOutlined />}
                loading={manifestLoading}
                onClick={() => manifestDetail && openRuntimeDetail(manifestDetail.course)}
              >
                刷新状态
              </Button>
              <Button
                type={manifestDetail?.course.deploymentStatus === 'RUNNING' ? 'default' : 'primary'}
                icon={manifestDetail?.course.deploymentStatus === 'RUNNING' ? <SyncOutlined /> : <RocketOutlined />}
                loading={runtimeActionCourseId === manifestDetail?.course.id}
                disabled={!manifestDetail?.course.manifestValid}
                onClick={() =>
                  manifestDetail &&
                  runRuntimeAction(
                    manifestDetail.course,
                    manifestDetail.course.deploymentStatus === 'RUNNING' ? 'restart' : 'deploy',
                  )
                }
              >
                {manifestDetail?.course.deploymentStatus === 'RUNNING' ? '重启' : '部署'}
              </Button>
            </Space>
          ) : null
        }
      >
        {manifestDetail && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Descriptions bordered column={1} size="small">
              <Descriptions.Item label="课程访问短名">{manifestDetail.course.slug}</Descriptions.Item>
              <Descriptions.Item label="服务器目录">{manifestDetail.courseRoot}</Descriptions.Item>
              <Descriptions.Item label="课程入口">
                <a href={manifestDetail.course.entryUrl} target="_blank">
                  {manifestDetail.course.entryUrl}
                </a>
              </Descriptions.Item>
              <Descriptions.Item label="运行方式">
                {courseRuntimeLabel(manifestDetail.course.runtimeType)}
              </Descriptions.Item>
              <Descriptions.Item label="课程状态">
                <CourseStatusTag status={manifestDetail.course.status} />
              </Descriptions.Item>
              <Descriptions.Item label="部署状态">
                <CourseDeploymentStatusTag status={manifestDetail.course.deploymentStatus} />
                {manifestDetail.course.deploymentMessage && (
                  <Text type="secondary" style={{ marginLeft: 8 }}>
                    {manifestDetail.course.deploymentMessage}
                  </Text>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="系统自动端口">
                {manifestDetail.course.nodePort ?? '静态课件不需要'}
              </Descriptions.Item>
              {runtimeDetail && (
                <Descriptions.Item label="守护服务">
                  {runtimeDetail.serviceName ?? '未登记'}
                  <Text type="secondary" style={{ marginLeft: 8 }}>
                    {runtimeDetail.systemdManaged
                      ? runtimeDetail.systemdActive
                        ? 'systemd active'
                        : 'systemd inactive'
                      : '未托管'}
                  </Text>
                </Descriptions.Item>
              )}
              <Descriptions.Item label="上传时间">
                {manifestDetail.course.uploadedAt
                  ? new Date(manifestDetail.course.uploadedAt).toLocaleString()
                  : '未上传'}
              </Descriptions.Item>
              <Descriptions.Item label="部署时间">
                {manifestDetail.course.deployedAt
                  ? new Date(manifestDetail.course.deployedAt).toLocaleString()
                  : '未部署'}
              </Descriptions.Item>
            </Descriptions>
            <Alert
              type={manifestDetail.manifestValid ? 'success' : 'error'}
              showIcon
              message={manifestDetail.manifestValid ? 'manifest 校验通过' : 'manifest 校验未通过'}
              description={
                manifestDetail.manifestErrors.length > 0
                  ? manifestDetail.manifestErrors.join('；')
                  : '课件结构符合当前底座规范。'
              }
            />
            <div>
              <Text strong>manifest.json</Text>
              <pre className="code-preview">
                {JSON.stringify(manifestDetail.manifest ?? {}, null, 2)}
              </pre>
            </div>
            {runtimeDetail?.logTail && (
              <div>
                <Text strong>部署日志</Text>
                <pre className="code-preview">{runtimeDetail.logTail}</pre>
              </div>
            )}
          </Space>
        )}
      </Drawer>
    </section>
  );
}

function OrganizationsPage({ api }: { api: ApiClient }) {
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [detail, setDetail] = useState<OrganizationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [classOpen, setClassOpen] = useState(false);
  const [memberOpen, setMemberOpen] = useState(false);
  const [classMemberOpen, setClassMemberOpen] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [studentImportClassId, setStudentImportClassId] = useState<string | null>(null);
  const [form] = Form.useForm();
  const [classForm] = Form.useForm();
  const [memberForm] = Form.useForm();
  const [classMemberForm] = Form.useForm();
  const [messageApi, contextHolder] = message.useMessage();

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [nextOrganizations, nextUsers] = await Promise.all([
        api.listOrganizations(),
        api.listUsers(),
      ]);
      setOrganizations(nextOrganizations);
      setUsers(nextUsers);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const openDetail = async (id: string) => {
    setDetail(await api.getOrganization(id));
  };

  const closeDetail = () => {
    setDetail(null);
    setClassOpen(false);
    setMemberOpen(false);
    setClassMemberOpen(false);
    setSelectedClassId(null);
    setStudentImportClassId(null);
  };

  const selectedClass = useMemo(
    () => detail?.classes.find((classRecord) => classRecord.id === selectedClassId) ?? null,
    [detail, selectedClassId],
  );

  const classMemberOptions = useMemo(() => {
    const existedUserIds = new Set(selectedClass?.members.map((member) => member.user.id) ?? []);
    const allowedUsers = users.filter((user) => {
      if (user.status !== 'ACTIVE' || user.approvalStatus !== 'APPROVED') {
        return false;
      }

      return user.userType === 'STUDENT';
    });

    return allowedUsers
      .filter((user) => !existedUserIds.has(user.id))
      .map((user) => ({
        label: `${user.displayName || user.username || user.email} (${user.email})`,
        value: user.id,
      }));
  }, [selectedClass, users]);

  const removeSelectedClassMember = async (member: OrganizationClassMember) => {
    if (!detail || !selectedClassId) return;

    await api.removeClassMember(selectedClassId, member.user.id);
    messageApi.success('已从班级移除');
    setDetail(await api.getOrganization(detail.id));
  };

  const columns: ColumnsType<OrganizationSummary> = [
    {
      title: '机构/学校',
      dataIndex: 'name',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Button type="link" className="table-link" onClick={() => openDetail(record.id)}>
            {record.name}
          </Button>
          <Text type="secondary">{record.code || '未设置编码'}</Text>
        </Space>
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      render: (type: OrganizationType) => <Tag>{organizationTypeLabel(type)}</Tag>,
    },
    {
      title: '班级数',
      render: (_, record) => record._count?.classes ?? 0,
    },
    {
      title: '成员数',
      render: (_, record) => record._count?.members ?? 0,
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (status: string) => <StatusTag status={status} />,
    },
    {
      title: '操作',
      align: 'right',
      render: (_, record) => (
        <Button size="small" onClick={() => openDetail(record.id)}>
          管理班级/学生
        </Button>
      ),
    },
  ];

  return (
    <section>
      {contextHolder}
      <PageHeader
        title="机构与班级"
        description="维护学校/机构、班级，以及学生归属关系；教师不隶属于学校或班级，只在排课时选择。"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={reload}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              新建机构
            </Button>
          </Space>
        }
      />
      <Table
        rowKey="id"
        columns={columns}
        dataSource={organizations}
        loading={loading}
        pagination={{ pageSize: 8 }}
      />
      <Alert
        className="content-alert"
        type="info"
        showIcon
        message="班级在学校/机构详情里管理"
        description="点击机构名称或“管理班级/学生”，进入后可以新建班级，并为班级选择学生。"
      />

      <Modal
        title="新建机构/学校"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        okText="创建"
        onOk={() => form.submit()}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          preserve={false}
          initialValues={{ type: 'SCHOOL' }}
          onFinish={async (values) => {
            await api.createOrganization(values);
            messageApi.success('机构已创建');
            setCreateOpen(false);
            await reload();
          }}
        >
          <Form.Item
            name="name"
            label="名称"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input placeholder="示例学校" />
          </Form.Item>
          <Form.Item name="code" label="编码">
            <Input placeholder="demo-school" />
          </Form.Item>
          <Form.Item name="type" label="类型">
            <Select
              options={[
                { label: '学校', value: 'SCHOOL' },
                { label: '培训机构', value: 'INSTITUTION' },
                { label: '内部组织', value: 'INTERNAL' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={detail?.name}
        width={760}
        open={Boolean(detail)}
        onClose={closeDetail}
        extra={
          <Space>
            <Button icon={<UserAddOutlined />} onClick={() => setMemberOpen(true)}>
              添加学生
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setClassOpen(true)}>
              新建班级
            </Button>
          </Space>
        }
      >
        {detail && (
          <>
            <Alert
              className="content-alert"
              type="info"
              showIcon
              message="班级成员在班级行里选择"
              description="先新建班级，再点班级行右侧“选择学生”，可以一次选择多个学生。教师不加入班级，只在排课时作为负责老师选择。"
            />
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="编码">
                {detail.code || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="类型">
                {organizationTypeLabel(detail.type)}
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <StatusTag status={detail.status} />
              </Descriptions.Item>
              <Descriptions.Item label="成员数">
                {detail.members.length}
              </Descriptions.Item>
            </Descriptions>
            <Tabs
              className="detail-tabs"
              items={[
                {
                  key: 'classes',
                  label: '班级',
                  children: (
                    <Table
                      rowKey="id"
                      size="small"
                      dataSource={detail.classes}
                      pagination={false}
                      columns={[
                        { title: '班级', dataIndex: 'name' },
                        { title: '编码', dataIndex: 'code' },
                        {
                          title: '学生',
                          render: (_, record) => renderClassMembers(record.members, 'STUDENT'),
                        },
                        {
                          title: '状态',
                          dataIndex: 'status',
                          render: (status) => <StatusTag status={status} />,
                        },
                        {
                          title: '操作',
                          align: 'right',
                          render: (_, record) => (
                            <Space>
                              <Button
                                size="small"
                                icon={<FileExcelOutlined />}
                                onClick={() => setStudentImportClassId(record.id)}
                              >
                                导入学生
                              </Button>
                              <Button
                                size="small"
                                onClick={() => {
                                  setSelectedClassId(record.id);
                                  classMemberForm.resetFields();
                                  classMemberForm.setFieldsValue({ userIds: [] });
                                  setClassMemberOpen(true);
                                }}
                              >
                                选择学生
                              </Button>
                            </Space>
                          ),
                        },
                      ]}
                    />
                  ),
                },
                {
                  key: 'members',
                  label: '学生',
                  children: (
                    <Table
                      rowKey="id"
                      size="small"
                      dataSource={detail.members}
                      pagination={false}
                      columns={[
                        {
                          title: '用户',
                          render: (_, record) => (
                            <Space direction="vertical" size={0}>
                              <Text strong>
                                {record.user.displayName || record.user.username || record.user.email}
                              </Text>
                              <Text type="secondary">{record.user.email}</Text>
                            </Space>
                          ),
                        },
                        {
                          title: '机构角色',
                          render: (_, record) =>
                            record.role ? (
                              <Tag color="blue">{record.role.name}</Tag>
                            ) : (
                              <Tag>未设置</Tag>
                            ),
                        },
                      ]}
                    />
                  ),
                },
              ]}
            />
          </>
        )}
      </Drawer>

      <Modal
        title="新建班级"
        open={classOpen}
        onCancel={() => setClassOpen(false)}
        okText="创建"
        onOk={() => classForm.submit()}
        destroyOnClose
      >
        <Form
          form={classForm}
          layout="vertical"
          preserve={false}
          onFinish={async (values) => {
            if (!detail) return;
            await api.createClass(detail.id, values);
            messageApi.success('班级已创建');
            setClassOpen(false);
            setDetail(await api.getOrganization(detail.id));
            await reload();
          }}
        >
          <Form.Item
            name="name"
            label="班级名称"
            rules={[{ required: true, message: '请输入班级名称' }]}
          >
            <Input placeholder="一年级 1 班" />
          </Form.Item>
          <Form.Item name="code" label="班级编码">
            <Input placeholder="grade1-class1" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="添加学生"
        open={memberOpen}
        onCancel={() => setMemberOpen(false)}
        okText="添加"
        onOk={() => memberForm.submit()}
        destroyOnClose
      >
        <Form
          form={memberForm}
          layout="vertical"
          preserve={false}
          onFinish={async (values) => {
            if (!detail) return;
            await api.addOrganizationMember(detail.id, values);
            messageApi.success('学生已添加');
            setMemberOpen(false);
            setDetail(await api.getOrganization(detail.id));
            await reload();
          }}
        >
          <Form.Item
            name="userId"
            label="学生"
            rules={[{ required: true, message: '请选择学生' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={users
                .filter(
                  (user) =>
                    user.userType === 'STUDENT' &&
                    user.status === 'ACTIVE' &&
                    user.approvalStatus === 'APPROVED',
                )
                .map((user) => ({
                  label: `${user.displayName || user.username || user.email} (${user.email})`,
                  value: user.id,
                }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={selectedClass ? `选择学生：${selectedClass.name}` : '选择学生'}
        open={classMemberOpen}
        onCancel={() => {
          setClassMemberOpen(false);
          classMemberForm.resetFields();
        }}
        okText="添加"
        onOk={() => classMemberForm.submit()}
        destroyOnClose
      >
        <Form
          form={classMemberForm}
          layout="vertical"
          preserve={false}
          onFinish={async (values: { userIds: string[] }) => {
            if (!detail || !selectedClassId) return;
            await Promise.all(
              values.userIds.map((userId) =>
                api.addClassMember(selectedClassId, {
                  userId,
                  role: 'STUDENT',
                }),
              ),
            );
            messageApi.success(`已添加 ${values.userIds.length} 位学生`);
            setClassMemberOpen(false);
            classMemberForm.resetFields();
            setDetail(await api.getOrganization(detail.id));
          }}
        >
          {selectedClass && (
            <div className="class-member-preview">
              <Text type="secondary">当前班级成员（点击姓名右侧 x 可移出班级）</Text>
              <div className="class-member-preview-row">
                <Text strong>学生</Text>
                {renderClassMembers(selectedClass.members, 'STUDENT', removeSelectedClassMember)}
              </div>
            </div>
          )}
          <Form.Item
            name="userIds"
            label="学生"
            rules={[{ required: true, message: '请选择至少一位学生' }]}
          >
            <Select
              mode="multiple"
              showSearch
              optionFilterProp="label"
              placeholder={classMemberOptions.length ? '可一次选择多个学生' : '没有可添加的学生'}
              options={classMemberOptions}
            />
          </Form.Item>
        </Form>
      </Modal>
      <StudentImportModal
        api={api}
        open={Boolean(studentImportClassId)}
        organizationDetails={detail ? [detail] : []}
        initialClassId={studentImportClassId}
        onCancel={() => setStudentImportClassId(null)}
        onImported={async () => {
          if (detail) {
            setDetail(await api.getOrganization(detail.id));
          }
          await reload();
        }}
      />
    </section>
  );
}

function PageHeader({
  title,
  description,
  extra,
}: {
  title: string;
  description: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <Title level={2}>{title}</Title>
        <Text type="secondary">{description}</Text>
      </div>
      {extra && <div className="page-actions">{extra}</div>}
    </div>
  );
}

function StatusTag({ status }: { status: string }) {
  if (status === 'ACTIVE') {
    return (
      <Tag color="success" icon={<CheckCircleOutlined />}>
        启用
      </Tag>
    );
  }

  if (status === 'DISABLED') {
    return <Tag color="default">禁用</Tag>;
  }

  return <Tag>{status}</Tag>;
}

function formatDateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString() : '未记录';
}

function formatDurationSeconds(value?: number | null) {
  if (value === null || value === undefined) {
    return '未记录';
  }

  const minutes = Math.floor(value / 60);
  const seconds = value % 60;

  return minutes > 0 ? `${minutes} 分 ${seconds} 秒` : `${seconds} 秒`;
}

function formatFileSize(value?: number | null) {
  if (!value) {
    return '0 B';
  }

  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function getProjectionUrl(summary: unknown) {
  if (!isPlainObject(summary)) {
    return null;
  }

  const candidate = summary.projectorUrl ?? summary.screenUrl;
  return typeof candidate === 'string' && candidate.trim() ? candidate : null;
}

function renderClassMembers(
  members: OrganizationClassMember[],
  role: ClassMemberRole,
  onRemove?: (member: OrganizationClassMember) => void | Promise<void>,
) {
  const targets = members.filter((member) => member.role === role);

  if (!targets.length) {
    return <Text type="secondary">未设置</Text>;
  }

  return (
    <Space size={[6, 6]} wrap>
      {targets.map((member) => (
        <Tag
          key={member.id}
          color={role === 'TEACHER' ? 'purple' : 'green'}
          closable={Boolean(onRemove)}
          onClose={(event) => {
            event.preventDefault();
            void onRemove?.(member);
          }}
        >
          {member.user.displayName || member.user.username || member.user.email}
        </Tag>
      ))}
    </Space>
  );
}

function RolePortal({
  api,
  mode,
  currentUser,
  onLogout,
}: {
  api: ApiClient;
  mode: Exclude<PortalMode, 'admin'>;
  currentUser: AdminUser;
  onLogout: () => void;
}) {
  const [context, setContext] = useState<PortalContext | null>(null);
  const [classes, setClasses] = useState<PortalClass[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [assignments, setAssignments] = useState<PortalAssignment[]>([]);
  const [records, setRecords] = useState<LearningRecord[]>([]);
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [students, setStudents] = useState<AdminUser[]>([]);
  const [studentsClass, setStudentsClass] = useState<PortalClass | null>(null);
  const [coursewareAssignment, setCoursewareAssignment] = useState<PortalAssignment | null>(null);
  const [coursewareDataContext, setCoursewareDataContext] = useState<{
    assignment: PortalAssignment;
    courseware: Courseware;
  } | null>(null);
  const [coursewareDataRecords, setCoursewareDataRecords] = useState<LearningRecord[]>([]);
  const [coursewareDataLoading, setCoursewareDataLoading] = useState(false);
  const [coursewareDataSort, setCoursewareDataSort] = useState('score-desc');
  const [assignmentRecordsAssignment, setAssignmentRecordsAssignment] =
    useState<PortalAssignment | null>(null);
  const [assignmentRecords, setAssignmentRecords] = useState<LearningRecord[]>([]);
  const [assignmentRecordsLoading, setAssignmentRecordsLoading] = useState(false);
  const [recordDetail, setRecordDetail] = useState<LearningRecord | null>(null);
  const [selectedScheduleDate, setSelectedScheduleDate] = useState<Dayjs>(dayjs());
  const [scheduleAssignment, setScheduleAssignment] = useState<PortalAssignment | null>(null);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [scheduleForm] = Form.useForm();
  const [messageApi, contextHolder] = message.useMessage();

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const nextContext = await api.portalMe();
      setContext(nextContext);

      if (mode === 'teacher') {
        const [nextClasses, nextCourses, nextAssignments, nextRecords, nextWorkItems] =
          await Promise.all([
            api.listTeacherClasses(),
            api.listTeacherCourses(),
            api.listTeacherAssignments(),
            api.listTeacherLearningRecords(),
            api.listWorkItems(),
          ]);
        setClasses(nextClasses.classes);
        setCourses(nextCourses.courses);
        setAssignments(nextAssignments.assignments);
        setRecords(nextRecords.records);
        setWorkItems(nextWorkItems.items);
      } else {
        const [nextCourses, nextAssignments, nextRecords] = await Promise.all([
          api.listStudentCourses(),
          api.listStudentAssignments(),
          api.listStudentLearningRecords(),
        ]);
        setCourses(nextCourses.courses);
        setAssignments(nextAssignments.assignments);
        setRecords(nextRecords.records);
        setWorkItems([]);
      }
    } finally {
      setLoading(false);
    }
  }, [api, mode]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const openClassStudents = async (classItem: PortalClass) => {
    setStudentsClass(classItem);
    const result = await api.listTeacherClassStudents(classItem.id);
    setStudents(result.students);
  };

  const openAssignmentRecords = async (assignment: PortalAssignment) => {
    setAssignmentRecordsAssignment(assignment);
    setAssignmentRecords([]);
    setAssignmentRecordsLoading(true);

    try {
      const result = await api.listTeacherLearningRecords({ assignmentId: assignment.id });
      setAssignmentRecords(result.records);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '读取提交记录失败');
    } finally {
      setAssignmentRecordsLoading(false);
    }
  };

  const openRecordDetail = async (record: LearningRecord) => {
    if (mode !== 'teacher') {
      try {
        const latestRecord = await api.getStudentLearningRecord(record.id);
        setRecordDetail(latestRecord);
      } catch (error) {
        messageApi.error(error instanceof Error ? error.message : '读取学习记录失败');
      }
      return;
    }

    try {
      const latestRecord = await api.getTeacherLearningRecord(record.id);
      setRecordDetail(latestRecord);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '读取提交详情失败');
    }
  };

  const updateLocalAssignment = (updated: PortalAssignment) => {
    setAssignments((current) =>
      current.map((candidate) => candidate.id === updated.id ? updated : candidate),
    );
    setAssignmentRecordsAssignment((current) =>
      current?.id === updated.id ? updated : current,
    );
    setCoursewareAssignment((current) =>
      current?.id === updated.id ? updated : current,
    );
    setCoursewareDataContext((current) =>
      current?.assignment.id === updated.id
        ? { ...current, assignment: updated }
        : current,
    );
  };

  const updateAssignmentTeachingStatus = async (assignment: PortalAssignment) => {
    try {
      const updated = assignment.teachingStatus === 'OPEN'
        ? await api.closeTeacherAssignment(assignment.id)
        : await api.openTeacherAssignment(assignment.id);
      updateLocalAssignment(updated);
      messageApi.success(updated.teachingStatus === 'OPEN' ? '课程已开始' : '课程已结束');
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '课堂状态更新失败');
    }
  };

  const openScheduleEditor = (assignment: PortalAssignment) => {
    setScheduleAssignment(assignment);
    scheduleForm.setFieldsValue({
      startAt: assignment.startAt ? dayjs(assignment.startAt) : dayjs(),
      dueAt: assignment.dueAt ? dayjs(assignment.dueAt) : undefined,
    });
  };

  const saveAssignmentSchedule = async () => {
    if (!scheduleAssignment) {
      return;
    }

    try {
      const values = await scheduleForm.validateFields();
      setScheduleSaving(true);
      const updated = await api.updateTeacherAssignmentSchedule(scheduleAssignment.id, {
        startAt: values.startAt.toISOString(),
        dueAt: values.dueAt ? values.dueAt.toISOString() : null,
      });
      updateLocalAssignment(updated);
      setSelectedScheduleDate(dayjs(updated.startAt));
      setScheduleAssignment(null);
      scheduleForm.resetFields();
      messageApi.success('计划上课时间已更新');
    } catch (error) {
      if (error instanceof Error) {
        messageApi.error(error.message);
      }
    } finally {
      setScheduleSaving(false);
    }
  };

  const markTeacherWorkItemDone = async (item: WorkItem) => {
    try {
      await api.completeWorkItem(item.id);
      messageApi.success('已标记处理');
      setWorkItems((current) => current.filter((candidate) => candidate.id !== item.id));
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '标记处理失败');
    }
  };

  const getAssignmentCoursewareState = (
    assignment: PortalAssignment,
    coursewareId: string,
  ) => assignment.coursewareStates?.find((state) => state.coursewareId === coursewareId);

  const toggleAssignmentCourseware = async (
    assignment: PortalAssignment,
    courseware: Courseware,
  ) => {
    if (assignment.teachingStatus !== 'OPEN') {
      messageApi.warning('请先开始课程，再开放课件');
      return;
    }

    const state = getAssignmentCoursewareState(assignment, courseware.id);
    const isOpen = state?.status === 'OPEN';

    try {
      const updated = isOpen
        ? await api.closeTeacherAssignmentCourseware(assignment.id, courseware.id)
        : await api.openTeacherAssignmentCourseware(assignment.id, courseware.id);
      updateLocalAssignment(updated);
      messageApi.success(isOpen ? '课件已关闭' : '课件已开放');
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '课件状态更新失败');
    }
  };

  const openCoursewareData = async (
    assignment: PortalAssignment,
    courseware: Courseware,
    sort = coursewareDataSort,
  ) => {
    setCoursewareDataContext({ assignment, courseware });
    setCoursewareDataSort(sort);
    setCoursewareDataRecords([]);
    setCoursewareDataLoading(true);

    try {
      const result = await api.listTeacherAssignmentCoursewareRecords(
        assignment.id,
        courseware.id,
        sort,
      );
      setCoursewareDataRecords(result.records);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '读取课件数据失败');
    } finally {
      setCoursewareDataLoading(false);
    }
  };

  const startCourseware = async (assignment: PortalAssignment, courseware: Courseware) => {
    if (assignment.teachingStatus !== 'OPEN') {
      messageApi.warning(teachingStatusBlockedText(assignment.teachingStatus));
      return;
    }

    const state = getAssignmentCoursewareState(assignment, courseware.id);
    if (state?.status !== 'OPEN') {
      messageApi.warning('老师暂未开放这个课件');
      return;
    }

    try {
      const launch = await api.createCourseLaunch({
        courseId: assignment.course.id,
        coursewareId: courseware.id,
        assignmentId: assignment.id,
        classId: assignment.class.id,
      });
      messageApi.success('已生成课件启动凭证');
      window.location.href = launch.launchUrl;
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : '进入课件失败');
    }
  };

  const title = mode === 'teacher' ? '教师工作台' : '学生工作台';
  const subtitle = mode === 'teacher'
    ? '查看管理员分配给自己的班级、课程任务和学习记录。'
    : '查看自己的班级、课程任务和学习记录。';

  return (
    <Layout className={mode === 'student' ? 'app-shell student-shell' : 'app-shell'}>
      {contextHolder}
      {mode === 'teacher' && (
        <Sider className="app-sider" width={248}>
          <div className="brand">
            <div className="brand-mark">
              <ReadOutlined />
            </div>
            <div>
              <div className="brand-title">智美教育新生态业务底座</div>
              <div className="brand-subtitle">{title}</div>
            </div>
          </div>
          <Menu
            mode="inline"
            selectedKeys={['workspace']}
            items={[
              {
                key: 'workspace',
                icon: <ReadOutlined />,
                label: title,
              },
            ]}
          />
        </Sider>
      )}
      <Layout className={mode === 'student' ? 'student-main-layout' : undefined}>
        <Header className={mode === 'student' ? 'app-header student-app-header' : 'app-header'}>
          {mode === 'student' ? (
            <>
              <div className="student-app-brand">
                <div className="brand-mark student-brand-mark">
                  <BookOutlined />
                </div>
                <div>
                  <div className="brand-title">智美教育新生态业务底座</div>
                  <div className="brand-subtitle">学生工作台</div>
                </div>
              </div>
              <Space className="student-header-actions" size="middle">
                <div className="student-header-user">
                  <Text className="header-label">当前账号</Text>
                  <div className="header-user">
                    {currentUser.displayName || currentUser.username || currentUser.email}
                  </div>
                </div>
                <Button icon={<ReloadOutlined />} onClick={reload} loading={loading}>
                  刷新
                </Button>
                <Button icon={<LogoutOutlined />} onClick={onLogout}>
                  退出
                </Button>
              </Space>
            </>
          ) : (
            <>
              <div>
                <Text className="header-label">当前账号</Text>
                <div className="header-user">
                  {currentUser.displayName || currentUser.username || currentUser.email}
                </div>
              </div>
              <Button icon={<LogoutOutlined />} onClick={onLogout}>
                退出
              </Button>
            </>
          )}
        </Header>
        <Content className={mode === 'student' ? 'app-content student-app-content' : 'app-content'}>
          <PageHeader
            title={title}
            description={subtitle}
            extra={
              mode === 'teacher' ? (
                <Button icon={<ReloadOutlined />} onClick={reload} loading={loading}>
                  刷新
                </Button>
              ) : undefined
            }
          />

          {mode === 'student' ? (
            <StudentPortalDashboard
              context={context}
              assignments={assignments}
              courses={courses}
              records={records}
              loading={loading}
              onOpenAssignment={setCoursewareAssignment}
              onViewRecord={setRecordDetail}
            />
          ) : (
            <>
              <TeacherWorkItemsPanel
                items={workItems}
                loading={loading}
                onOpen={(item) => {
                  if (item.learningRecord) {
                    void openRecordDetail(item.learningRecord);
                  }
                }}
                onComplete={markTeacherWorkItemDone}
              />

              <TeacherScheduleCalendar
                assignments={assignments}
                loading={loading}
                selectedDate={selectedScheduleDate}
                onSelectedDateChange={setSelectedScheduleDate}
                onEditSchedule={openScheduleEditor}
                onOpenRecords={openAssignmentRecords}
                onOpenCoursewares={setCoursewareAssignment}
                onToggleTeachingStatus={updateAssignmentTeachingStatus}
              />

              <div className="metrics-grid">
                <div className="metric">
                  <Statistic
                    title="我的班级"
                    value={classes.length}
                    prefix={<TeamOutlined />}
                  />
                </div>
                <div className="metric">
                  <Statistic title="课程" value={courses.length} prefix={<BookOutlined />} />
                </div>
                <div className="metric">
                  <Statistic title="任务" value={assignments.length} prefix={<FileDoneOutlined />} />
                </div>
                <div className="metric">
                  <Statistic title="学习记录" value={records.length} prefix={<CheckCircleOutlined />} />
                </div>
              </div>

              <div className="portal-grid">
                <div className="portal-panel">
                  <Title level={3}>我的资料</Title>
                  <Descriptions bordered size="small" column={1}>
                    <Descriptions.Item label="姓名">
                      {context?.user.displayName || context?.user.email}
                    </Descriptions.Item>
                    <Descriptions.Item label="邮箱">{context?.user.email}</Descriptions.Item>
                    <Descriptions.Item label="身份">
                      {context?.user.userType && (
                        <Tag color={userTypeColor(context.user.userType)}>
                          {userTypeLabel(context.user.userType)}
                        </Tag>
                      )}
                    </Descriptions.Item>
                  </Descriptions>
                </div>

                <div className="portal-panel">
                  <Title level={3}>我的班级</Title>
                  <Table
                    rowKey="id"
                    size="small"
                    loading={loading}
                    dataSource={classes}
                    pagination={false}
                    columns={[
                      {
                        title: '班级',
                        render: (_, record) => (
                          <Space direction="vertical" size={0}>
                            <Text strong>{record.name}</Text>
                            <Text type="secondary">{record.organization.name}</Text>
                          </Space>
                        ),
                      },
                      {
                        title: '成员/任务',
                        render: (_, record) => `${record.membersCount} / ${record.assignmentsCount}`,
                      },
                      {
                        title: '操作',
                        align: 'right',
                        render: (_, record) => (
                          <Button size="small" onClick={() => openClassStudents(record)}>
                            学生名单
                          </Button>
                        ),
                      },
                    ]}
                  />
                </div>
              </div>

              <div className="portal-panel">
                <PageHeader
                  title="我的排课"
                  description="这里显示管理员分配给你的班级课程安排，可查看提交并控制课堂开始或结束。"
                />
                <Table
                  rowKey="id"
                  size="small"
                  dataSource={assignments}
                  loading={loading}
                  pagination={{ pageSize: 6 }}
                  columns={assignmentColumns({
                    onOpenRecords: openAssignmentRecords,
                    onOpenCoursewares: setCoursewareAssignment,
                    onToggleTeachingStatus: updateAssignmentTeachingStatus,
                  })}
                />
              </div>

              <div className="portal-panel">
                <Title level={3}>学习记录</Title>
                <Table
                  rowKey="id"
                  size="small"
                  dataSource={records}
                  loading={loading}
                  pagination={{ pageSize: 8 }}
                  columns={learningRecordColumns({ onViewDetail: openRecordDetail })}
                />
              </div>
            </>
          )}
        </Content>
      </Layout>

      <Modal
        title={scheduleAssignment ? `调整上课时间：${scheduleAssignment.course.title}` : '调整上课时间'}
        open={Boolean(scheduleAssignment)}
        okText="保存时间"
        confirmLoading={scheduleSaving}
        onCancel={() => {
          setScheduleAssignment(null);
          scheduleForm.resetFields();
        }}
        onOk={saveAssignmentSchedule}
      >
        {scheduleAssignment && (
          <Alert
            className="content-alert"
            type="info"
            showIcon
            message={`${scheduleAssignment.class.organization.name} / ${scheduleAssignment.class.name}`}
            description="这里只调整计划上课时间，不会改变课程、班级、负责老师，也不会自动开始课堂。"
          />
        )}
        <Form form={scheduleForm} layout="vertical">
          <Form.Item
            name="startAt"
            label="计划上课时间"
            rules={[{ required: true, message: '请选择计划上课时间' }]}
          >
            <DatePicker
              showTime
              format="YYYY-MM-DD HH:mm"
              placeholder="选择上课时间"
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item
            name="dueAt"
            label="计划结束时间（可选）"
            rules={[
              {
                validator: (_, value) => {
                  const startAt = scheduleForm.getFieldValue('startAt');
                  if (value && startAt && !value.isAfter(startAt)) {
                    return Promise.reject(new Error('计划结束时间必须晚于上课时间'));
                  }
                  return Promise.resolve();
                },
              },
            ]}
          >
            <DatePicker
              showTime
              format="YYYY-MM-DD HH:mm"
              placeholder="不填则仅显示上课时间"
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={studentsClass ? `${studentsClass.name} 学生名单` : '学生名单'}
        open={Boolean(studentsClass)}
        onClose={() => {
          setStudentsClass(null);
          setStudents([]);
        }}
        width={720}
      >
        <Table
          rowKey="id"
          size="small"
          dataSource={students}
          pagination={{ pageSize: 10 }}
          columns={[
            {
              title: '学生',
              render: (_, record) => (
                <Space direction="vertical" size={0}>
                  <Text strong>{record.displayName || record.email}</Text>
                  <Text type="secondary">{record.email}</Text>
                </Space>
              ),
            },
            {
              title: '年龄段',
              dataIndex: 'ageBand',
              render: (value) => value || <Text type="secondary">未设置</Text>,
            },
            {
              title: '状态',
              dataIndex: 'status',
              render: (value: UserStatus) => <StatusTag status={value} />,
            },
          ]}
        />
      </Drawer>

      <Drawer
        title={assignmentRecordsAssignment ? `提交记录：${assignmentRecordsAssignment.title}` : '提交记录'}
        open={Boolean(assignmentRecordsAssignment)}
        onClose={() => {
          setAssignmentRecordsAssignment(null);
          setAssignmentRecords([]);
        }}
        width={920}
      >
        {assignmentRecordsAssignment && (
          <Space direction="vertical" size="middle" className="full-width">
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="课程">
                {assignmentRecordsAssignment.course.title}
              </Descriptions.Item>
              <Descriptions.Item label="班级">
                {assignmentRecordsAssignment.class.organization.name} / {assignmentRecordsAssignment.class.name}
              </Descriptions.Item>
              <Descriptions.Item label="记录数">
                {assignmentRecords.length}
              </Descriptions.Item>
              <Descriptions.Item label="课堂状态">
                <TeachingStatusTag status={assignmentRecordsAssignment.teachingStatus} />
              </Descriptions.Item>
            </Descriptions>
            <Table
              rowKey="id"
              size="small"
              dataSource={assignmentRecords}
              loading={assignmentRecordsLoading}
              pagination={{ pageSize: 8 }}
              columns={learningRecordColumns({ onViewDetail: openRecordDetail })}
            />
          </Space>
        )}
      </Drawer>

      <Drawer
        title={recordDetail ? `学生提交详情：${recordDetail.student.displayName || recordDetail.student.email}` : '学生提交详情'}
        open={Boolean(recordDetail)}
        onClose={() => setRecordDetail(null)}
        width={760}
      >
        {recordDetail && <LearningRecordDetail record={recordDetail} />}
      </Drawer>

      <Drawer
        title={
          coursewareDataContext
            ? `课件数据：${coursewareDataContext.courseware.title}`
            : '课件数据'
        }
        open={Boolean(coursewareDataContext)}
        onClose={() => {
          setCoursewareDataContext(null);
          setCoursewareDataRecords([]);
        }}
        width={1040}
      >
        {coursewareDataContext && (
          <Space direction="vertical" size="middle" className="full-width">
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="课程">
                {coursewareDataContext.assignment.course.title}
              </Descriptions.Item>
              <Descriptions.Item label="课件">
                {coursewareDataContext.courseware.title}
              </Descriptions.Item>
              <Descriptions.Item label="班级">
                {coursewareDataContext.assignment.class.organization.name} / {coursewareDataContext.assignment.class.name}
              </Descriptions.Item>
              <Descriptions.Item label="记录数">
                {coursewareDataRecords.length}
              </Descriptions.Item>
            </Descriptions>
            <div className="toolbar-row">
              <Space>
                <Text strong>排序</Text>
                <Select
                  value={coursewareDataSort}
                  style={{ width: 160 }}
                  options={[
                    { label: '分数从高到低', value: 'score-desc' },
                    { label: '最近更新优先', value: 'updated-desc' },
                  ]}
                  onChange={(value) => {
                    void openCoursewareData(
                      coursewareDataContext.assignment,
                      coursewareDataContext.courseware,
                      value,
                    );
                  }}
                />
              </Space>
            </div>
            <Table
              rowKey="id"
              size="small"
              loading={coursewareDataLoading}
              dataSource={coursewareDataRecords}
              pagination={{ pageSize: 12 }}
              columns={[
                {
                  title: '学生',
                  render: (_, record) => (
                    <Space direction="vertical" size={0}>
                      <Text strong>{record.student.displayName || record.student.email}</Text>
                      <Text type="secondary">{record.student.email}</Text>
                    </Space>
                  ),
                },
                {
                  title: '状态',
                  dataIndex: 'status',
                  render: (value: LearningRecordStatus) => <LearningStatusTag status={value} />,
                },
                {
                  title: '分数',
                  dataIndex: 'score',
                  render: (value: number | null) => value ?? <Text type="secondary">未提交</Text>,
                },
                {
                  title: '耗时',
                  dataIndex: 'durationSeconds',
                  render: (value: number | null) => formatDurationSeconds(value),
                },
                {
                  title: '附件',
                  render: (_, record) => `${record.artifacts?.length ?? 0} 个`,
                },
                {
                  title: '完成时间',
                  dataIndex: 'completedAt',
                  render: (value: string | null) => formatDateTime(value),
                },
                {
                  title: '操作',
                  align: 'right',
                  render: (_, record) => {
                    const projectionUrl = getProjectionUrl(record.summary);
                    return (
                      <Space wrap>
                        <Button size="small" icon={<EyeOutlined />} onClick={() => openRecordDetail(record)}>
                          详情
                        </Button>
                        <Button
                          size="small"
                          disabled={!projectionUrl}
                          onClick={() => {
                            if (projectionUrl) {
                              window.open(projectionUrl, '_blank', 'noopener,noreferrer');
                            }
                          }}
                        >
                          投屏
                        </Button>
                      </Space>
                    );
                  },
                },
              ]}
            />
          </Space>
        )}
      </Drawer>

      <Drawer
        title={
          coursewareAssignment
            ? `${mode === 'teacher' ? '课件控制' : '选择课件'}：${coursewareAssignment.course.title}`
            : '选择课件'
        }
        open={Boolean(coursewareAssignment)}
        onClose={() => setCoursewareAssignment(null)}
        width={920}
      >
        {coursewareAssignment && (
          <Space direction="vertical" size="middle" className="full-width">
            <Alert
              type={coursewareAssignment.teachingStatus === 'OPEN' ? 'info' : 'warning'}
              showIcon
              message={
                coursewareAssignment.teachingStatus === 'OPEN'
                  ? mode === 'teacher'
                    ? '可按课堂节奏逐个开放课件'
                    : '请选择要学习的课件'
                  : teachingStatusBlockedText(coursewareAssignment.teachingStatus)
              }
              description={
                coursewareAssignment.teachingStatus === 'OPEN'
                  ? mode === 'teacher'
                    ? '未开放的课件学生可以看到，但不能进入；每个课件都有独立数据后台。'
                    : '只有老师开放后的课件才能进入学习。'
                  : '任务仍会保留在学生后台，等老师开始课程后再进入学习。'
              }
            />
            <Table
              rowKey={(record) => record.coursewareId}
              size="small"
              dataSource={assignmentCoursewareRows(coursewareAssignment)}
              pagination={false}
              columns={[
                {
                  title: '课件',
                  render: (_, record) => (
                    <Space direction="vertical" size={0}>
                      <Text strong>{record.courseware.title}</Text>
                      <Text type="secondary">访问短名：{record.courseware.slug}</Text>
                    </Space>
                  ),
                },
                {
                  title: '类型',
                  render: (_, record) => <Tag>{courseRuntimeLabel(record.courseware.runtimeType)}</Tag>,
                },
                {
                  title: '课件状态',
                  render: (_, record) => <CoursewareTeachingStatusTag status={record.status} />,
                },
                {
                  title: '操作',
                  align: 'right',
                  render: (_, record) => {
                    if (mode === 'teacher') {
                      const isOpen = record.status === 'OPEN';
                      return (
                        <Space wrap>
                          <Button
                            type={isOpen ? 'default' : 'primary'}
                            size="small"
                            disabled={coursewareAssignment.teachingStatus !== 'OPEN'}
                            onClick={() => toggleAssignmentCourseware(coursewareAssignment, record.courseware)}
                          >
                            {isOpen ? '关闭课件' : '开放课件'}
                          </Button>
                          <Button
                            size="small"
                            icon={<EyeOutlined />}
                            onClick={() => openCoursewareData(coursewareAssignment, record.courseware)}
                          >
                            查看数据
                          </Button>
                        </Space>
                      );
                    }

                    const canStart =
                      coursewareAssignment.teachingStatus === 'OPEN' && record.status === 'OPEN';
                    const label = coursewareAssignment.teachingStatus !== 'OPEN'
                      ? teachingStatusBlockedText(coursewareAssignment.teachingStatus)
                      : record.status !== 'OPEN'
                        ? '老师暂未开放'
                        : '开始学习';

                    return (
                      <Button
                        type="primary"
                        size="small"
                        disabled={!canStart}
                        onClick={() => startCourseware(coursewareAssignment, record.courseware)}
                      >
                        {label}
                      </Button>
                    );
                  },
                },
              ]}
            />
          </Space>
        )}
      </Drawer>
    </Layout>
  );
}

function TeacherWorkItemsPanel({
  items,
  loading,
  onOpen,
  onComplete,
}: {
  items: WorkItem[];
  loading: boolean;
  onOpen: (item: WorkItem) => void;
  onComplete: (item: WorkItem) => void | Promise<void>;
}) {
  return (
    <div className="work-item-panel teacher-work-items">
      <div className="work-item-panel-head">
        <div>
          <Title level={3}>待处理提交</Title>
          <Text type="secondary">
            学生完成课件后会出现在这里，查看确认后可标记为已处理。
          </Text>
        </div>
        <Badge count={items.length} showZero color="#13c2c2" />
      </div>
      {items.length ? (
        <div className="work-item-list" aria-busy={loading}>
          {items.map((item) => (
            <WorkItemCard
              key={item.id}
              item={item}
              onOpen={onOpen}
              onComplete={onComplete}
            />
          ))}
        </div>
      ) : (
        <div className="work-item-empty">
          <CheckCircleOutlined />
          <Text>暂无新的学生提交</Text>
        </div>
      )}
    </div>
  );
}

function StudentPortalDashboard({
  context,
  assignments,
  courses,
  records,
  loading,
  onOpenAssignment,
  onViewRecord,
}: {
  context: PortalContext | null;
  assignments: PortalAssignment[];
  courses: Course[];
  records: LearningRecord[];
  loading: boolean;
  onOpenAssignment: (assignment: PortalAssignment) => void;
  onViewRecord: (record: LearningRecord) => void;
}) {
  const primaryAssignment =
    assignments.find(
      (assignment) => assignment.status === 'ACTIVE' && assignment.teachingStatus === 'OPEN',
    ) ??
    assignments.find((assignment) => assignment.status === 'ACTIVE') ??
    assignments[0];
  const displayName =
    context?.user.displayName || context?.user.username || context?.user.email || '同学';
  const primaryClass = context?.classes[0] ?? primaryAssignment?.class;
  const classLabel = primaryClass
    ? `${primaryClass.organization.name} / ${primaryClass.name}`
    : '暂未分配班级';
  const completedCount = records.filter((record) => record.status === 'COMPLETED').length;
  const inProgressCount = records.filter((record) => record.status !== 'COMPLETED').length;
  const totalMinutes = Math.round(
    records.reduce((total, record) => total + (record.durationSeconds ?? 0), 0) / 60,
  );
  const visibleAssignments = assignments.slice(0, 3);
  const visibleCourses = courses.slice(0, 3);
  const visibleRecords = records.slice(0, 3);
  const canOpenPrimaryAssignment = primaryAssignment?.teachingStatus === 'OPEN';

  return (
    <div className="student-dashboard" aria-busy={loading}>
      <div className="student-topbar">
        <div className="student-class-pill">
          <BankOutlined />
          <span>{classLabel}</span>
        </div>
        <div className="student-user-pill">
          <span className="student-avatar">{displayName.slice(0, 1).toUpperCase()}</span>
          <span>{displayName}</span>
        </div>
      </div>

      <section className="student-hero-panel">
        <div className="student-hero-head">
          <div className="student-hero-icon">
            <FileDoneOutlined />
          </div>
          <div>
            <Title level={2}>我的任务</Title>
            <Text>今天有任务，快去完成吧！</Text>
          </div>
        </div>

        {primaryAssignment ? (
          <div className="student-primary-task">
            <div>
              <Tag color={primaryAssignment.status === 'ACTIVE' ? 'gold' : 'default'}>
                {studentAssignmentStatusLabel(primaryAssignment.status)}
              </Tag>
              <TeachingStatusTag status={primaryAssignment.teachingStatus} />
              <Title level={1}>{primaryAssignment.title}</Title>
              <Text>{primaryAssignment.course.title}</Text>
              <div className="student-task-meta">
                <Text>{teachingStatusBlockedText(primaryAssignment.teachingStatus)}</Text>
                <Text>{primaryAssignment.course.coursewares?.length ?? 0} 个课件</Text>
              </div>
            </div>
            <Button
              type="primary"
              size="large"
              className="student-start-button"
              icon={<RocketOutlined />}
              disabled={!canOpenPrimaryAssignment}
              onClick={() => onOpenAssignment(primaryAssignment)}
            >
              {canOpenPrimaryAssignment ? '开始学习' : teachingStatusBlockedText(primaryAssignment.teachingStatus)}
            </Button>
          </div>
        ) : (
          <div className="student-empty-task">
            <Title level={3}>今天还没有学习任务</Title>
            <Text>老师布置课程后，会在这里看到任务。</Text>
          </div>
        )}
      </section>

      <div className="student-block-grid">
        <section className="student-color-block student-course-block">
          <div className="student-block-icon">
            <BookOutlined />
          </div>
          <div>
            <Title level={2}>我的课程</Title>
            <Text>查看我加入的课程</Text>
          </div>
          <div className="student-mini-list">
            {visibleCourses.map((course) => (
              <div key={course.id} className="student-mini-row">
                <span>{course.title}</span>
                <Tag>{course.coursewares?.length ?? 0} 个课件</Tag>
              </div>
            ))}
            {!visibleCourses.length && <Text>暂未分配课程</Text>}
          </div>
        </section>

        <section className="student-color-block student-record-block">
          <div className="student-block-icon">
            <CheckCircleOutlined />
          </div>
          <div>
            <Title level={2}>学习记录</Title>
            <Text>回顾学习进度与成果</Text>
          </div>
          <div className="student-record-stats">
            <div>
              <strong>{completedCount}</strong>
              <span>已完成</span>
            </div>
            <div>
              <strong>{inProgressCount}</strong>
              <span>进行中</span>
            </div>
            <div>
              <strong>{totalMinutes}</strong>
              <span>分钟</span>
            </div>
          </div>
        </section>
      </div>

      <div className="student-summary-grid">
        <section className="student-soft-panel">
          <div className="student-section-head">
            <Title level={3}>最近任务</Title>
            <Text>{assignments.length} 个任务</Text>
          </div>
          <div className="student-row-list">
            {visibleAssignments.map((assignment) => (
              <button
                key={assignment.id}
                className="student-row-button"
                type="button"
                disabled={assignment.teachingStatus !== 'OPEN'}
                onClick={() => onOpenAssignment(assignment)}
              >
                <span>
                  <strong>{assignment.title}</strong>
                  <Text>
                    {assignment.class.organization.name} / {assignment.class.name} · {teachingStatusBlockedText(assignment.teachingStatus)}
                  </Text>
                </span>
                <TeachingStatusTag status={assignment.teachingStatus} />
              </button>
            ))}
            {!visibleAssignments.length && <Text type="secondary">暂无任务</Text>}
          </div>
        </section>

        <section className="student-soft-panel">
          <div className="student-section-head">
            <Title level={3}>最近记录</Title>
            <Text>{records.length} 条记录</Text>
          </div>
          <div className="student-row-list">
            {visibleRecords.map((record) => (
              <button
                key={record.id}
                className="student-row-button"
                type="button"
                onClick={() => onViewRecord(record)}
              >
                <span>
                  <strong>{record.courseware?.title ?? record.course.title}</strong>
                  <Text>{record.course.title}</Text>
                </span>
                <Tag color={record.status === 'COMPLETED' ? 'green' : 'blue'}>
                  {studentLearningStatusLabel(record.status)}
                </Tag>
              </button>
            ))}
            {!visibleRecords.length && <Text type="secondary">暂无学习记录</Text>}
          </div>
        </section>
      </div>
    </div>
  );
}

function TeacherScheduleCalendar({
  assignments,
  loading,
  selectedDate,
  onSelectedDateChange,
  onEditSchedule,
  onOpenRecords,
  onOpenCoursewares,
  onToggleTeachingStatus,
}: {
  assignments: PortalAssignment[];
  loading: boolean;
  selectedDate: Dayjs;
  onSelectedDateChange: (date: Dayjs) => void;
  onEditSchedule: (assignment: PortalAssignment) => void;
  onOpenRecords: (assignment: PortalAssignment) => void;
  onOpenCoursewares: (assignment: PortalAssignment) => void;
  onToggleTeachingStatus: (assignment: PortalAssignment) => void | Promise<void>;
}) {
  const scheduledAssignments = useMemo(
    () => assignments.filter((assignment) => assignment.startAt),
    [assignments],
  );
  const unscheduledAssignments = useMemo(
    () => assignments.filter((assignment) => !assignment.startAt),
    [assignments],
  );
  const teachingStatusCounts = useMemo(() => {
    const counts: Record<CourseTeachingStatus, number> = {
      READY: 0,
      OPEN: 0,
      ENDED: 0,
    };

    for (const assignment of assignments) {
      counts[assignment.teachingStatus] += 1;
    }

    return counts;
  }, [assignments]);
  const assignmentsByDate = useMemo(() => {
    const groups = new Map<string, PortalAssignment[]>();
    for (const assignment of scheduledAssignments) {
      const key = scheduleDateKey(assignment.startAt);
      groups.set(key, [...(groups.get(key) ?? []), assignment]);
    }

    for (const [key, value] of groups) {
      groups.set(key, [...value].sort(compareAssignmentsBySchedule));
    }

    return groups;
  }, [scheduledAssignments]);
  const selectedAssignments = assignmentsByDate.get(scheduleDateKey(selectedDate)) ?? [];

  return (
    <div className="portal-panel teacher-schedule-panel">
      <PageHeader
        title="日历排课"
        description="按月查看自己负责的课程安排；这里只调整计划时间，课堂开始和结束仍由老师手动控制。"
        extra={
          <div className="teacher-schedule-status-summary">
            {(['READY', 'OPEN', 'ENDED'] as CourseTeachingStatus[]).map((status) => (
              <div key={status} className={`teacher-schedule-status-card teacher-schedule-status-card-${status.toLowerCase()}`}>
                <span>{teachingStatusLabel(status)}</span>
                <strong>{teachingStatusCounts[status]}</strong>
              </div>
            ))}
            <div className="teacher-schedule-status-card teacher-schedule-status-card-unscheduled">
              <span>待安排</span>
              <strong>{unscheduledAssignments.length}</strong>
            </div>
          </div>
        }
      />
      <div className="teacher-schedule-layout" aria-busy={loading}>
        <div className="teacher-calendar-wrap">
          <Calendar
            value={selectedDate}
            onSelect={onSelectedDateChange}
            headerRender={({ value, type, onChange, onTypeChange }) => {
              const currentYear = value.year();
              const yearOptions = Array.from({ length: 11 }, (_, index) => currentYear - 5 + index);

              return (
                <div className="teacher-calendar-header">
                  <Space wrap>
                    <Select
                      value={currentYear}
                      options={yearOptions.map((year) => ({
                        label: `${year}年`,
                        value: year,
                      }))}
                      onChange={(nextYear) => onChange(value.clone().year(nextYear))}
                    />
                    <Select
                      value={value.month()}
                      options={chineseMonthLabels.map((label, index) => ({
                        label,
                        value: index,
                      }))}
                      onChange={(nextMonth) => onChange(value.clone().month(nextMonth))}
                    />
                    <Segmented
                      value={type}
                      options={[
                        { label: '月', value: 'month' },
                        { label: '年', value: 'year' },
                      ]}
                      onChange={(nextType) => onTypeChange(nextType as 'month' | 'year')}
                    />
                  </Space>
                </div>
              );
            }}
            cellRender={(current, info) => {
              if (info.type !== 'date') {
                return info.originNode;
              }

              const dayAssignments = assignmentsByDate.get(scheduleDateKey(current)) ?? [];
              if (!dayAssignments.length) {
                return info.originNode;
              }

              return (
                <div className="teacher-calendar-cell-events">
                  {dayAssignments.slice(0, 3).map((assignment) => (
                    <div
                      key={assignment.id}
                      className={`teacher-calendar-event teacher-calendar-event-${assignment.teachingStatus.toLowerCase()}`}
                      title={`${formatScheduleTimeRange(assignment)} ${assignment.course.title}`}
                    >
                      <span className="teacher-calendar-event-time">
                        {assignment.startAt ? dayjs(assignment.startAt).format('HH:mm') : '待定'}
                      </span>
                      <span className="teacher-calendar-event-title">{assignment.course.title}</span>
                    </div>
                  ))}
                  {dayAssignments.length > 3 && (
                    <Text type="secondary" className="teacher-calendar-more">
                      +{dayAssignments.length - 3} 个
                    </Text>
                  )}
                </div>
              );
            }}
          />
        </div>
        <div className="teacher-day-panel">
          <div className="teacher-day-head">
            <div className="teacher-day-date-badge">
              <strong>{selectedDate.format('DD')}</strong>
              <span>{weekdayLabel(selectedDate)}</span>
            </div>
            <div>
              <Text strong className="teacher-day-title">{selectedDate.format('YYYY年M月D日')}</Text>
              <div className="teacher-day-subtitle">
                <Badge count={selectedAssignments.length} color="#1677ff" />
                <Text type="secondary">个课程安排</Text>
              </div>
            </div>
          </div>
          <div className="teacher-schedule-list">
            {selectedAssignments.length ? (
              selectedAssignments.map((assignment) => (
                <TeacherScheduleAssignmentItem
                  key={assignment.id}
                  assignment={assignment}
                  onEditSchedule={onEditSchedule}
                  onOpenRecords={onOpenRecords}
                  onOpenCoursewares={onOpenCoursewares}
                  onToggleTeachingStatus={onToggleTeachingStatus}
                />
              ))
            ) : (
              <div className="teacher-schedule-empty">
                <CalendarOutlined />
                <Text>当天暂无课程安排</Text>
              </div>
            )}
          </div>
        </div>
      </div>

      {unscheduledAssignments.length > 0 && (
        <div className="teacher-unscheduled">
          <div className="teacher-unscheduled-title">
            <Space align="center">
              <ClockCircleOutlined />
              <Text strong>待安排时间</Text>
              <Tag color="blue">{unscheduledAssignments.length} 个任务</Tag>
            </Space>
            <Text type="secondary">还没有计划上课时间，可先集中设置。</Text>
          </div>
          <div className="teacher-schedule-list">
            {unscheduledAssignments.sort(compareAssignmentsBySchedule).map((assignment) => (
              <TeacherScheduleAssignmentItem
                key={assignment.id}
                assignment={assignment}
                onEditSchedule={onEditSchedule}
                onOpenRecords={onOpenRecords}
                onOpenCoursewares={onOpenCoursewares}
                onToggleTeachingStatus={onToggleTeachingStatus}
                compact
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TeacherScheduleAssignmentItem({
  assignment,
  onEditSchedule,
  onOpenRecords,
  onOpenCoursewares,
  onToggleTeachingStatus,
  compact = false,
}: {
  assignment: PortalAssignment;
  onEditSchedule: (assignment: PortalAssignment) => void;
  onOpenRecords: (assignment: PortalAssignment) => void;
  onOpenCoursewares: (assignment: PortalAssignment) => void;
  onToggleTeachingStatus: (assignment: PortalAssignment) => void | Promise<void>;
  compact?: boolean;
}) {
  return (
    <div
      className={`teacher-schedule-item teacher-schedule-item-${assignment.teachingStatus.toLowerCase()}${compact ? ' teacher-schedule-item-compact' : ''}`}
    >
      <div className="teacher-schedule-item-main">
        <Space size={8} wrap className="teacher-schedule-meta-row">
          <TeachingStatusTag status={assignment.teachingStatus} />
          <Tag color="blue">记录 {assignment.recordsCount}</Tag>
        </Space>
        <Text strong className="teacher-schedule-course">
          {assignment.course.title}
        </Text>
        <Text type="secondary">
          {assignment.class.organization.name} / {assignment.class.name}
        </Text>
        <Text className="teacher-schedule-time">
          {formatScheduleTimeRange(assignment)}
        </Text>
      </div>
      <Space wrap>
        <Button size="small" icon={<ClockCircleOutlined />} onClick={() => onEditSchedule(assignment)}>
          {assignment.startAt ? '调整时间' : '设置时间'}
        </Button>
        <Button size="small" icon={<EyeOutlined />} onClick={() => onOpenRecords(assignment)}>
          查看提交
        </Button>
        <Button size="small" icon={<BookOutlined />} onClick={() => onOpenCoursewares(assignment)}>
          课件控制
        </Button>
        <Button
          size="small"
          type={assignment.teachingStatus === 'OPEN' ? 'default' : 'primary'}
          onClick={() => void onToggleTeachingStatus(assignment)}
        >
          {teachingStatusActionLabel(assignment.teachingStatus)}
        </Button>
      </Space>
    </div>
  );
}

function scheduleDateKey(value: string | Dayjs | Date | null | undefined) {
  return value ? dayjs(value).format('YYYY-MM-DD') : 'unscheduled';
}

function weekdayLabel(date: Dayjs) {
  const labels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return labels[date.day()];
}

const chineseMonthLabels = [
  '一月',
  '二月',
  '三月',
  '四月',
  '五月',
  '六月',
  '七月',
  '八月',
  '九月',
  '十月',
  '十一月',
  '十二月',
];

function compareAssignmentsBySchedule(left: PortalAssignment, right: PortalAssignment) {
  const leftTime = left.startAt ? new Date(left.startAt).getTime() : Number.MAX_SAFE_INTEGER;
  const rightTime = right.startAt ? new Date(right.startAt).getTime() : Number.MAX_SAFE_INTEGER;
  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }

  return left.createdAt.localeCompare(right.createdAt);
}

function formatScheduleTimeRange(assignment: PortalAssignment) {
  if (!assignment.startAt) {
    return '未安排上课时间';
  }

  const startAt = dayjs(assignment.startAt);
  if (!assignment.dueAt) {
    return `上课 ${startAt.format('MM-DD HH:mm')}`;
  }

  const dueAt = dayjs(assignment.dueAt);
  const dueLabel = startAt.isSame(dueAt, 'day')
    ? dueAt.format('HH:mm')
    : dueAt.format('MM-DD HH:mm');
  return `${startAt.format('MM-DD HH:mm')} - ${dueLabel}`;
}

function assignmentColumns(options: {
  onOpenRecords?: (assignment: PortalAssignment) => void;
  onOpenCoursewares?: (assignment: PortalAssignment) => void;
  onToggleTeachingStatus?: (assignment: PortalAssignment) => void | Promise<void>;
} = {}): ColumnsType<PortalAssignment> {
  const columns: ColumnsType<PortalAssignment> = [
    {
      title: '任务',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{record.title}</Text>
          <Text type="secondary">{record.course.title}</Text>
          <Text type="secondary">{record.course.coursewares?.length ?? 0} 个已发布课件</Text>
        </Space>
      ),
    },
    {
      title: '班级',
      render: (_, record) => `${record.class.organization.name} / ${record.class.name}`,
    },
    {
      title: '课堂状态',
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <TeachingStatusTag status={record.teachingStatus} />
          {record.openedAt && <Text type="secondary">开始：{formatDateTime(record.openedAt)}</Text>}
          {record.closedAt && <Text type="secondary">结束：{formatDateTime(record.closedAt)}</Text>}
        </Space>
      ),
    },
    {
      title: '记录数',
      dataIndex: 'recordsCount',
    },
    {
      title: '计划时间',
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          {record.startAt ? (
            <Text>{formatDateTime(record.startAt)}</Text>
          ) : (
            <Text type="secondary">未安排</Text>
          )}
          {record.dueAt && <Text type="secondary">结束：{formatDateTime(record.dueAt)}</Text>}
        </Space>
      ),
    },
  ];

  if (options.onOpenRecords) {
    columns.push({
      title: '操作',
      align: 'right',
      render: (_, record) => (
        <Space wrap>
          <Button size="small" icon={<EyeOutlined />} onClick={() => options.onOpenRecords?.(record)}>
            查看提交
          </Button>
          {options.onOpenCoursewares && (
            <Button size="small" icon={<BookOutlined />} onClick={() => options.onOpenCoursewares?.(record)}>
              课件控制
            </Button>
          )}
          {options.onToggleTeachingStatus && (
            <Button
              size="small"
              type={record.teachingStatus === 'OPEN' ? 'default' : 'primary'}
              onClick={() => void options.onToggleTeachingStatus?.(record)}
            >
              {teachingStatusActionLabel(record.teachingStatus)}
            </Button>
          )}
        </Space>
      ),
    });
  }

  return columns;
}

function studentAssignmentStatusLabel(status: CourseAssignmentStatus) {
  const labels: Record<CourseAssignmentStatus, string> = {
    ACTIVE: '已分配',
    ARCHIVED: '已归档',
  };

  return labels[status];
}

function teachingStatusLabel(status: CourseTeachingStatus) {
  const labels: Record<CourseTeachingStatus, string> = {
    READY: '未开始',
    OPEN: '进行中',
    ENDED: '已结束',
  };

  return labels[status];
}

function teachingStatusActionLabel(status: CourseTeachingStatus) {
  const labels: Record<CourseTeachingStatus, string> = {
    READY: '开始课程',
    OPEN: '结束课程',
    ENDED: '重新开始',
  };

  return labels[status];
}

function teachingStatusBlockedText(status: CourseTeachingStatus) {
  const labels: Record<CourseTeachingStatus, string> = {
    READY: '老师还未开始课程',
    OPEN: '可以进入课程',
    ENDED: '本次课程已结束',
  };

  return labels[status];
}

function assignmentCoursewareRows(assignment: PortalAssignment): PortalAssignmentCoursewareState[] {
  if (assignment.coursewareStates?.length) {
    return assignment.coursewareStates;
  }

  return (assignment.course.coursewares ?? []).map((courseware) => ({
    id: null,
    coursewareId: courseware.id,
    status: 'CLOSED',
    openedAt: null,
    closedAt: null,
    openedByUserId: null,
    closedByUserId: null,
    courseware,
  }));
}

function TeachingStatusTag({ status }: { status: CourseTeachingStatus }) {
  const colors: Record<CourseTeachingStatus, string> = {
    READY: 'default',
    OPEN: 'success',
    ENDED: 'warning',
  };

  return <Tag color={colors[status]}>{teachingStatusLabel(status)}</Tag>;
}

function CoursewareTeachingStatusTag({ status }: { status: 'CLOSED' | 'OPEN' }) {
  return status === 'OPEN'
    ? <Tag color="green">已开放</Tag>
    : <Tag color="default">未开放</Tag>;
}

function studentLearningStatusLabel(status: LearningRecordStatus) {
  const labels: Record<LearningRecordStatus, string> = {
    STARTED: '已开始',
    PROGRESS: '进行中',
    COMPLETED: '已完成',
  };

  return labels[status];
}

function learningRecordColumns(options: {
  onViewDetail?: (record: LearningRecord) => void;
} = {}): ColumnsType<LearningRecord> {
  const columns: ColumnsType<LearningRecord> = [
    {
      title: '课程',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{record.course.title}</Text>
          <Text type="secondary">
            {record.courseware?.title ?? '未记录课件'} / {record.assignment?.title ?? '自主学习'}
          </Text>
        </Space>
      ),
    },
    {
      title: '学生',
      render: (_, record) => record.student.displayName || record.student.email,
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (value: string) => <LearningStatusTag status={value as LearningRecord['status']} />,
    },
    {
      title: '分数',
      dataIndex: 'score',
      render: (value: number | null) => value ?? <Text type="secondary">未提交</Text>,
    },
    {
      title: '耗时',
      dataIndex: 'durationSeconds',
      render: (value: number | null) => value ? `${value} 秒` : <Text type="secondary">未记录</Text>,
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      render: (value: string) => new Date(value).toLocaleString(),
    },
  ];

  if (options.onViewDetail) {
    columns.push({
      title: '操作',
      align: 'right',
      render: (_, record) => (
        <Button size="small" icon={<EyeOutlined />} onClick={() => options.onViewDetail?.(record)}>
          详情
        </Button>
      ),
    });
  }

  return columns;
}

function LearningRecordDetail({ record }: { record: LearningRecord }) {
  return (
    <Space direction="vertical" size="middle" className="full-width">
      <Descriptions bordered size="small" column={2}>
        <Descriptions.Item label="学生">
          {record.student.displayName || record.student.email}
        </Descriptions.Item>
        <Descriptions.Item label="邮箱">{record.student.email}</Descriptions.Item>
        <Descriptions.Item label="班级">
          {record.class
            ? `${record.class.organization.name} / ${record.class.name}`
            : '未记录'}
        </Descriptions.Item>
        <Descriptions.Item label="年龄段">{record.student.ageBand || '未设置'}</Descriptions.Item>
        <Descriptions.Item label="课程">{record.course.title}</Descriptions.Item>
        <Descriptions.Item label="课件">{record.courseware.title}</Descriptions.Item>
        <Descriptions.Item label="任务">{record.assignment?.title ?? '自主学习'}</Descriptions.Item>
        <Descriptions.Item label="状态">
          <LearningStatusTag status={record.status} />
        </Descriptions.Item>
        <Descriptions.Item label="分数">
          {record.score ?? <Text type="secondary">未提交</Text>}
        </Descriptions.Item>
        <Descriptions.Item label="耗时">
          {formatDurationSeconds(record.durationSeconds)}
        </Descriptions.Item>
        <Descriptions.Item label="开始时间">{formatDateTime(record.startedAt)}</Descriptions.Item>
        <Descriptions.Item label="完成时间">{formatDateTime(record.completedAt)}</Descriptions.Item>
        <Descriptions.Item label="更新时间">{formatDateTime(record.updatedAt)}</Descriptions.Item>
      </Descriptions>
      <LearningRecordArtifacts artifacts={record.artifacts ?? []} />
      <LearningRecordSummary summary={record.summary} />
    </Space>
  );
}

function LearningRecordArtifacts({ artifacts }: { artifacts: LearningRecordArtifact[] }) {
  if (!artifacts.length) {
    return (
      <Alert
        type="info"
        showIcon
        message="暂无附件"
        description="课件还没有上传图片、录音、视频或作品文件。"
      />
    );
  }

  return (
    <div className="record-artifacts">
      <Text strong>课件附件</Text>
      <div className="record-artifact-grid">
        {artifacts.map((artifact) => (
          <div key={artifact.id} className="record-artifact-card">
            <div className="record-artifact-preview">
              {renderArtifactPreview(artifact)}
            </div>
            <Space direction="vertical" size={2}>
              <Text strong>{artifact.originalFileName}</Text>
              <Text type="secondary">
                {artifact.kind} · {artifact.mimeType} · {formatFileSize(artifact.sizeBytes)}
              </Text>
              <a href={artifact.url} target="_blank" rel="noreferrer">
                打开文件
              </a>
            </Space>
          </div>
        ))}
      </div>
    </div>
  );
}

function renderArtifactPreview(artifact: LearningRecordArtifact) {
  if (artifact.mimeType.startsWith('image/')) {
    return <img src={artifact.url} alt={artifact.originalFileName} />;
  }

  if (artifact.mimeType.startsWith('audio/')) {
    return <audio src={artifact.url} controls />;
  }

  if (artifact.mimeType.startsWith('video/')) {
    return <video src={artifact.url} controls />;
  }

  return <FileDoneOutlined />;
}

function LearningRecordSummary({ summary }: { summary: unknown }) {
  if (isEmptySummary(summary)) {
    return (
      <Alert
        type="info"
        showIcon
        message="暂无详细数据"
        description="课件还没有上报作品、答题过程或投屏链接等 summary 数据。"
      />
    );
  }

  const summaryObject = isPlainObject(summary) ? summary : null;
  const structuredEntries = summaryObject
    ? SUMMARY_FIELD_KEYS
        .filter((key) => Object.prototype.hasOwnProperty.call(summaryObject, key))
        .map((key) => [key, summaryObject[key]] as const)
    : [];

  return (
    <Space direction="vertical" size="middle" className="full-width">
      {structuredEntries.length > 0 && (
        <Descriptions bordered size="small" column={1}>
          {structuredEntries.map(([key, value]) => (
            <Descriptions.Item key={key} label={SUMMARY_FIELD_LABELS[key]}>
              {renderSummaryValue(key, value)}
            </Descriptions.Item>
          ))}
        </Descriptions>
      )}
      <div>
        <Text strong>完整原始数据</Text>
        <pre className="code-preview">{safeJsonStringify(summary)}</pre>
      </div>
    </Space>
  );
}

const SUMMARY_FIELD_LABELS = {
  workId: '作品编号',
  artifactUrl: '作品链接',
  projectorUrl: '投屏链接',
  imageUrl: '图片链接',
  drawingUrl: '画作链接',
  canvasImageUrl: '画布图片',
  audioUrl: '录音链接',
  recordingUrl: '录音文件',
  screenUrl: '投屏页面',
  brief: '摘要',
  savedArtifacts: '保存文件',
  answers: '答题数据',
  results: '结果数据',
  processData: '过程数据',
  steps: '操作步骤',
  events: '事件记录',
} as const;

const SUMMARY_FIELD_KEYS = Object.keys(SUMMARY_FIELD_LABELS) as Array<
  keyof typeof SUMMARY_FIELD_LABELS
>;

function renderSummaryValue(key: string, value: unknown) {
  if (value === null || value === undefined || value === '') {
    return <Text type="secondary">未记录</Text>;
  }

  if (typeof value === 'string') {
    if (isUrlSummaryField(key) || isHttpUrl(value)) {
      return (
        <a href={value} target="_blank" rel="noreferrer">
          {value}
        </a>
      );
    }

    return <Text>{value}</Text>;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return <Text>{String(value)}</Text>;
  }

  return <pre className="code-preview">{safeJsonStringify(value)}</pre>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEmptySummary(summary: unknown) {
  if (summary === null || summary === undefined) {
    return true;
  }

  if (typeof summary === 'string') {
    return summary.trim().length === 0;
  }

  if (Array.isArray(summary)) {
    return summary.length === 0;
  }

  if (isPlainObject(summary)) {
    return Object.keys(summary).length === 0;
  }

  return false;
}

function isUrlSummaryField(key: string) {
  return [
    'artifactUrl',
    'projectorUrl',
    'imageUrl',
    'drawingUrl',
    'canvasImageUrl',
    'audioUrl',
    'recordingUrl',
    'screenUrl',
  ].includes(key);
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function safeJsonStringify(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function ApprovalTag({ status }: { status: UserApprovalStatus }) {
  if (status === 'APPROVED') {
    return <Tag color="success">已通过</Tag>;
  }

  if (status === 'PENDING') {
    return <Tag color="warning">待审核</Tag>;
  }

  return <Tag color="error">已拒绝</Tag>;
}

function userTypeLabel(type: UserType) {
  const labels: Record<UserType, string> = {
    STUDENT: '学生',
    TEACHER: '教师',
    ADMIN: '管理员',
  };

  return labels[type];
}

function userTypeColor(type: UserType) {
  const colors: Record<UserType, string> = {
    STUDENT: 'green',
    TEACHER: 'purple',
    ADMIN: 'blue',
  };

  return colors[type];
}

function organizationTypeLabel(type: OrganizationType) {
  const labels: Record<OrganizationType, string> = {
    SCHOOL: '学校',
    INSTITUTION: '培训机构',
    INTERNAL: '内部组织',
  };

  return labels[type];
}

function resolvePortalMode(): PortalMode {
  const queryPortal = new URLSearchParams(window.location.search).get('portal');
  if (queryPortal === 'teacher' || queryPortal === 'student') {
    return queryPortal;
  }

  const host = window.location.hostname.toLowerCase();

  if (host.startsWith('teacher.')) {
    return 'teacher';
  }

  if (host.startsWith('student.')) {
    return 'student';
  }

  return 'admin';
}

function portalStorageKeys(mode: PortalMode): PortalStorageKeys {
  if (mode === 'admin') {
    return {
      token: TOKEN_KEY,
      refreshToken: REFRESH_TOKEN_KEY,
      user: USER_KEY,
    };
  }

  return {
    token: `jiaoxue_${mode}_access_token`,
    refreshToken: `jiaoxue_${mode}_refresh_token`,
    user: `jiaoxue_${mode}_user`,
  };
}

function siblingPortalOrigin(subdomain: 'teacher' | 'student' | 'agent') {
  const { protocol, hostname, port } = window.location;

  if (hostname.endsWith('docpine.online')) {
    return `${protocol}//${subdomain}.docpine.online`;
  }

  const localOrigin = `${protocol}//${hostname}${port ? `:${port}` : ''}`;

  if (subdomain === 'teacher') {
    return `${localOrigin}/?portal=teacher`;
  }

  if (subdomain === 'student') {
    return `${localOrigin}/?portal=student`;
  }

  return localOrigin;
}

function ssoForgotPasswordUrl() {
  const { protocol, hostname } = window.location;

  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `${protocol}//${hostname}:3000/sso/forgot-password`;
  }

  return '/sso/forgot-password';
}

function registrationRedirectFromLocation() {
  const { protocol, hostname, pathname, search } = window.location;
  const registrationMap: Record<
    string,
    { path: string; title: string; description: string }
  > = {
    '/register/student': {
      path: '/register/student',
      title: '智美教育学生注册',
      description: '正在进入学生注册页面',
    },
    '/register/teacher': {
      path: '/register/teacher',
      title: '智美教育教师注册',
      description: '正在进入教师注册页面',
    },
  };
  const registration = registrationMap[pathname];

  if (!registration) {
    return null;
  }

  const apiOrigin =
    hostname === 'localhost' || hostname === '127.0.0.1'
      ? `${protocol}//${hostname}:3000`
      : '';

  return {
    url: `${apiOrigin}${registration.path}${search}`,
    title: registration.title,
    description: registration.description,
  };
}

function canAccessPortal(user: AdminUser, mode: PortalMode) {
  if (mode === 'admin') {
    return user.isPlatformAdmin;
  }

  if (mode === 'teacher') {
    return user.userType === 'TEACHER' && user.approvalStatus === 'APPROVED';
  }

  return user.userType === 'STUDENT' && user.approvalStatus === 'APPROVED';
}

function portalAccessError(mode: PortalMode) {
  const messages: Record<PortalMode, string> = {
    admin: '当前账号没有平台管理员权限',
    teacher: '当前账号不是已审核教师，不能进入教师后台',
    student: '当前账号不是学生，不能进入学生后台',
  };

  return messages[mode];
}

function portalTitle(mode: PortalMode) {
  const labels: Record<PortalMode, string> = {
    admin: '平台管理员后台',
    teacher: '智美教育教师登录',
    student: '智美教育学生登录',
  };

  return labels[mode];
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function courseRuntimeLabel(type: CourseRuntimeType) {
  const labels: Record<CourseRuntimeType, string> = {
    STATIC: '网页课件',
    NODE: '服务课件',
    BOTH: '网页+服务课件',
  };

  return labels[type];
}

function courseOwnerLabel(type: CourseOwnerType) {
  const labels: Record<CourseOwnerType, string> = {
    ADMIN: '管理员',
    TEACHER: '教师',
    DEVELOPER: '开发者',
  };

  return labels[type];
}

function CourseStatusTag({ status }: { status: CourseStatus }) {
  const colors: Record<CourseStatus, string> = {
    DRAFT: 'default',
    PUBLISHED: 'success',
    ARCHIVED: 'warning',
  };
  const labels: Record<CourseStatus, string> = {
    DRAFT: '草稿',
    PUBLISHED: '已发布',
    ARCHIVED: '已归档',
  };

  return <Tag color={colors[status]}>{labels[status]}</Tag>;
}

function CourseDeploymentStatusTag({ status }: { status: CourseDeploymentStatus }) {
  const colors: Record<CourseDeploymentStatus, string> = {
    NOT_UPLOADED: 'default',
    UPLOADED: 'blue',
    READY: 'processing',
    STATIC_PUBLISHED: 'success',
    DEPLOYING: 'processing',
    RUNNING: 'success',
    FAILED: 'error',
    STOPPED: 'warning',
  };
  const labels: Record<CourseDeploymentStatus, string> = {
    NOT_UPLOADED: '未上传',
    UPLOADED: '已上传',
    READY: '待部署',
    STATIC_PUBLISHED: '静态已发布',
    DEPLOYING: '部署中',
    RUNNING: '运行中',
    FAILED: '失败',
    STOPPED: '已停止',
  };

  return <Tag color={colors[status] ?? 'default'}>{labels[status] ?? status}</Tag>;
}

function LearningStatusTag({ status }: { status: LearningRecordStatus }) {
  const colors: Record<LearningRecordStatus, string> = {
    STARTED: 'processing',
    PROGRESS: 'warning',
    COMPLETED: 'success',
  };
  const labels: Record<LearningRecordStatus, string> = {
    STARTED: '已开始',
    PROGRESS: '学习中',
    COMPLETED: '已完成',
  };

  return <Tag color={colors[status]}>{labels[status]}</Tag>;
}

export default App;
