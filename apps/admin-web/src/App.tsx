import {
  ApartmentOutlined,
  AppstoreOutlined,
  BankOutlined,
  BookOutlined,
  CheckCircleOutlined,
  CopyOutlined,
  EyeOutlined,
  FileZipOutlined,
  FileDoneOutlined,
  LogoutOutlined,
  PlusOutlined,
  ReloadOutlined,
  RocketOutlined,
  ReadOutlined,
  SyncOutlined,
  TeamOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Descriptions,
  Drawer,
  Form,
  Input,
  Layout,
  Menu,
  Modal,
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
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ApiClient,
  Application,
  ApplicationStatus,
  ApplicationUsersResponse,
  CreatedApplication,
  OrganizationDetail,
  OrganizationSummary,
  OrganizationType,
  UserStatus,
  UserType,
  UserApprovalStatus,
  AdminUser,
  ClassMemberRole,
  ApplicationAccessScope,
  Course,
  CourseDeploymentStatus,
  CourseManifestResponse,
  CourseOwnerType,
  CourseRuntimeType,
  CourseStatus,
  CourseRuntimeStatusResponse,
  LearningRecord,
  LearningRecordStatus,
  PortalAssignment,
  PortalClass,
  PortalContext,
} from './api';

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;

const TOKEN_KEY = 'jiaoxue_admin_access_token';
const USER_KEY = 'jiaoxue_admin_user';

type ViewKey = 'dashboard' | 'users' | 'applications' | 'organizations' | 'courses';
type PortalMode = 'admin' | 'teacher' | 'student';
type OrganizationClassMember = OrganizationDetail['classes'][number]['members'][number];

function App() {
  const portalMode = resolvePortalMode();
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(() => {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AdminUser) : null;
  });
  const [view, setView] = useState<ViewKey>('dashboard');
  const [loadingSession, setLoadingSession] = useState(Boolean(token));
  const [messageApi, contextHolder] = message.useMessage();

  const api = useMemo(() => new ApiClient(() => token), [token]);

  const saveSession = useCallback((nextToken: string, user: AdminUser) => {
    localStorage.setItem(TOKEN_KEY, nextToken);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    setToken(nextToken);
    setCurrentUser(user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setCurrentUser(null);
    setView('dashboard');
  }, []);

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
        localStorage.setItem(USER_KEY, JSON.stringify(result.user));
      })
      .catch(() => {
        logout();
      })
      .finally(() => {
        setLoadingSession(false);
      });
  }, [api, logout, messageApi, portalMode, token]);

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
            saveSession(result.accessToken, result.user);
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
                label: '概览',
              },
              {
                key: 'users',
                icon: <TeamOutlined />,
                label: '用户管理',
              },
              {
                key: 'applications',
                icon: <ApartmentOutlined />,
                label: '业务应用',
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
            {view === 'dashboard' && <Dashboard api={api} />}
            {view === 'users' && <UsersPage api={api} />}
            {view === 'applications' && <ApplicationsPage api={api} />}
            {view === 'courses' && <CoursesPage api={api} />}
            {view === 'organizations' && <OrganizationsPage api={api} />}
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
            rules={[{ required: true, message: '请输入密码' }]}
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
        </Form>
      </div>
    </div>
  );
}

function Dashboard({ api }: { api: ApiClient }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
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
      const [nextUsers, nextApplications, nextOrganizations, nextCourses] =
        await Promise.all([
          api.listUsers(),
          api.listApplications(),
          api.listOrganizations(),
          api.listCourses(),
        ]);
      setUsers(nextUsers);
      setApplications(nextApplications);
      setOrganizations(nextOrganizations);
      setCourses(nextCourses);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const classCount = organizations.reduce(
    (total, item) => total + (item._count?.classes ?? 0),
    0,
  );

  return (
    <section>
      <PageHeader
        title="概览"
        description="统一账号、业务应用、机构班级的当前状态。"
        extra={
          <Button icon={<ReloadOutlined />} onClick={reload} loading={loading}>
            刷新
          </Button>
        }
      />
      <div className="metrics-grid">
        <div className="metric">
          <Statistic title="用户" value={users.length} prefix={<TeamOutlined />} />
        </div>
        <div className="metric">
          <Statistic
            title="业务应用"
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

function UsersPage({ api }: { api: ApiClient }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [organizationDetails, setOrganizationDetails] = useState<OrganizationDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [assigningUser, setAssigningUser] = useState<AdminUser | null>(null);
  const [userTypeFilter, setUserTypeFilter] = useState<'ALL' | UserType>('ALL');
  const [form] = Form.useForm();
  const [assignForm] = Form.useForm();
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
    const firstOrganization = user.organizations?.[0];
    const firstClass = user.classes?.[0];

    setAssigningUser(user);
    assignForm.setFieldsValue({
      organizationId: firstOrganization?.id,
      classId: firstClass?.id,
      role: user.userType === 'TEACHER' ? 'TEACHER' : 'STUDENT',
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
      render: (_, record) => (
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
      ),
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
          <Button size="small" onClick={() => openAssignment(record)}>
            分配学校/班级
          </Button>
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
      <Modal
        title="分配学校/班级"
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
                role:
                  values.role ??
                  (assigningUser.userType === 'TEACHER' ? 'TEACHER' : 'STUDENT'),
              });
            }

            messageApi.success('学校/班级已分配');
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
          <Form.Item name="role" label="班级身份">
            <Select
              options={[
                { label: '老师', value: 'TEACHER' },
                { label: '学生', value: 'STUDENT' },
                { label: '助教', value: 'ASSISTANT' },
              ]}
            />
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
      title: '应用',
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
              messageApi.success('应用状态已更新');
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
        title="业务应用"
        description="登记独立业务应用，维护 appId、appSecret、SSO 回调地址和用户读取授权范围。"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={reload}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
              登记应用
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
        title="登记业务应用"
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
            messageApi.success('业务应用已登记');
            setOpen(false);
            await reload();
          }}
        >
          <Form.Item name="appId" label="appId">
            <Input placeholder="留空则自动生成" />
          </Form.Item>
          <Form.Item
            name="name"
            label="应用名称"
            rules={[{ required: true, message: '请输入应用名称' }]}
          >
            <Input placeholder="教学辅助演示应用" />
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
        title={selectedApplication ? `${selectedApplication.name} 用户` : '业务应用用户'}
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
          <Text type="secondary">{record.slug}</Text>
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
      render: (value: CourseRuntimeType, record) => (
        <Space direction="vertical" size={2}>
          <Tag>{courseRuntimeLabel(value)}</Tag>
          {record.nodePort && <Text type="secondary">端口 {record.nodePort}</Text>}
        </Space>
      ),
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
        onOk={() => form.submit()}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          preserve={false}
          onFinish={async (values) => {
            if (editingCourse) {
              await api.updateCourse(editingCourse.id, values);
              messageApi.success('课程已更新');
            } else {
              await api.createCourse(values);
              messageApi.success('课程已创建');
            }
            setOpen(false);
            setEditingCourse(null);
            form.resetFields();
            await reload();
          }}
        >
          <Form.Item
            name="slug"
            label="课程 slug"
            rules={[{ required: true, message: '请输入课程 slug' }]}
          >
            <Input placeholder="can-machines-learn" />
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
            description="ZIP 根目录建议包含 manifest.json，以及 static/ 或 server/。Node 课件需要 manifest.nodePort，并会在上传后进入待部署状态。"
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
              <Descriptions.Item label="课程 slug">{manifestDetail.course.slug}</Descriptions.Item>
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
              <Descriptions.Item label="Node 端口">
                {manifestDetail.course.nodePort ?? '不需要'}
              </Descriptions.Item>
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
  const [form] = Form.useForm();
  const [classForm] = Form.useForm();
  const [memberForm] = Form.useForm();
  const [classMemberForm] = Form.useForm();
  const selectedClassMemberRole = Form.useWatch<ClassMemberRole>('role', classMemberForm);
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
  };

  const selectedClass = useMemo(
    () => detail?.classes.find((classRecord) => classRecord.id === selectedClassId) ?? null,
    [detail, selectedClassId],
  );

  const classMemberOptions = useMemo(() => {
    const role = selectedClassMemberRole ?? 'STUDENT';
    const existedUserIds = new Set(selectedClass?.members.map((member) => member.user.id) ?? []);
    const allowedUsers = users.filter((user) => {
      if (role === 'STUDENT') {
        return user.userType === 'STUDENT';
      }

      if (role === 'TEACHER') {
        return user.userType === 'TEACHER';
      }

      return user.userType !== 'STUDENT';
    });

    return allowedUsers
      .filter((user) => !existedUserIds.has(user.id))
      .map((user) => ({
        label: `${user.displayName || user.username || user.email} (${user.email})`,
        value: user.id,
      }));
  }, [selectedClass, selectedClassMemberRole, users]);

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
  ];

  return (
    <section>
      {contextHolder}
      <PageHeader
        title="机构与班级"
        description="维护学校/机构、班级，以及用户归属关系。"
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
              添加成员
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setClassOpen(true)}>
              新建班级
            </Button>
          </Space>
        }
      >
        {detail && (
          <>
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
                          title: '教师',
                          render: (_, record) => renderClassMembers(record.members, 'TEACHER'),
                        },
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
                            <Button
                              size="small"
                              onClick={() => {
                                setSelectedClassId(record.id);
                                setClassMemberOpen(true);
                              }}
                            >
                              添加学生/老师
                            </Button>
                          ),
                        },
                      ]}
                    />
                  ),
                },
                {
                  key: 'members',
                  label: '成员',
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
        title="添加机构成员"
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
            messageApi.success('成员已添加');
            setMemberOpen(false);
            setDetail(await api.getOrganization(detail.id));
            await reload();
          }}
        >
          <Form.Item
            name="userId"
            label="用户"
            rules={[{ required: true, message: '请选择用户' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={users.map((user) => ({
                label: `${user.displayName || user.username || user.email} (${user.email})`,
                value: user.id,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="添加班级成员"
        open={classMemberOpen}
        onCancel={() => setClassMemberOpen(false)}
        okText="添加"
        onOk={() => classMemberForm.submit()}
        destroyOnClose
      >
        <Form
          form={classMemberForm}
          layout="vertical"
          preserve={false}
          initialValues={{ role: 'STUDENT' }}
          onFinish={async (values: { userIds: string[]; role: ClassMemberRole }) => {
            if (!detail || !selectedClassId) return;
            await Promise.all(
              values.userIds.map((userId) =>
                api.addClassMember(selectedClassId, {
                  userId,
                  role: values.role,
                }),
              ),
            );
            messageApi.success(`已添加 ${values.userIds.length} 位班级成员`);
            setClassMemberOpen(false);
            setDetail(await api.getOrganization(detail.id));
          }}
        >
          {selectedClass && (
            <div className="class-member-preview">
              <Text type="secondary">当前班级成员</Text>
              <div className="class-member-preview-row">
                <Text strong>教师</Text>
                {renderClassMembers(selectedClass.members, 'TEACHER')}
              </div>
              <div className="class-member-preview-row">
                <Text strong>学生</Text>
                {renderClassMembers(selectedClass.members, 'STUDENT')}
              </div>
            </div>
          )}
          <Form.Item name="role" label="班级身份">
            <Select
              options={[
                { label: '老师', value: 'TEACHER' },
                { label: '学生', value: 'STUDENT' },
                { label: '助教', value: 'ASSISTANT' },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="userIds"
            label="用户"
            rules={[{ required: true, message: '请选择至少一位用户' }]}
          >
            <Select
              mode="multiple"
              showSearch
              optionFilterProp="label"
              placeholder={classMemberOptions.length ? '可一次选择多个成员' : '没有可添加的用户'}
              options={classMemberOptions}
            />
          </Form.Item>
        </Form>
      </Modal>
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

function renderClassMembers(
  members: OrganizationClassMember[],
  role: ClassMemberRole,
) {
  const targets = members.filter((member) => member.role === role);

  if (!targets.length) {
    return <Text type="secondary">未设置</Text>;
  }

  return (
    <Space size={[6, 6]} wrap>
      {targets.map((member) => (
        <Tag key={member.id} color={role === 'TEACHER' ? 'purple' : 'green'}>
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
  const [students, setStudents] = useState<AdminUser[]>([]);
  const [studentsClass, setStudentsClass] = useState<PortalClass | null>(null);
  const [loading, setLoading] = useState(true);
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [assignmentForm] = Form.useForm();
  const [messageApi, contextHolder] = message.useMessage();

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const nextContext = await api.portalMe();
      setContext(nextContext);

      if (mode === 'teacher') {
        const [nextClasses, nextCourses, nextAssignments, nextRecords] =
          await Promise.all([
            api.listTeacherClasses(),
            api.listTeacherCourses(),
            api.listTeacherAssignments(),
            api.listTeacherLearningRecords(),
          ]);
        setClasses(nextClasses.classes);
        setCourses(nextCourses.courses);
        setAssignments(nextAssignments.assignments);
        setRecords(nextRecords.records);
      } else {
        const [nextCourses, nextAssignments, nextRecords] = await Promise.all([
          api.listStudentCourses(),
          api.listStudentAssignments(),
          api.listStudentLearningRecords(),
        ]);
        setCourses(nextCourses.courses);
        setAssignments(nextAssignments.assignments);
        setRecords(nextRecords.records);
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

  const startAssignment = async (assignment: PortalAssignment) => {
    const launch = await api.createCourseLaunch({
      courseId: assignment.course.id,
      assignmentId: assignment.id,
      classId: assignment.class.id,
    });
    messageApi.success('已生成课件启动凭证');
    window.location.href = launch.launchUrl;
  };

  const title = mode === 'teacher' ? '教师工作台' : '学生工作台';
  const subtitle = mode === 'teacher'
    ? '管理自己的班级、课程任务和学习记录。'
    : '查看自己的班级、课程任务和学习记录。';

  return (
    <Layout className="app-shell">
      {contextHolder}
      <Sider className="app-sider" width={248}>
        <div className="brand">
          <div className="brand-mark">
            {mode === 'teacher' ? <ReadOutlined /> : <BookOutlined />}
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
              icon: mode === 'teacher' ? <ReadOutlined /> : <BookOutlined />,
              label: title,
            },
          ]}
        />
      </Sider>
      <Layout>
        <Header className="app-header">
          <div>
            <Text className="header-label">当前账号</Text>
            <div className="header-user">
              {currentUser.displayName || currentUser.username || currentUser.email}
            </div>
          </div>
          <Button icon={<LogoutOutlined />} onClick={onLogout}>
            退出
          </Button>
        </Header>
        <Content className="app-content">
          <PageHeader
            title={title}
            description={subtitle}
            extra={
              <Button icon={<ReloadOutlined />} onClick={reload} loading={loading}>
                刷新
              </Button>
            }
          />

          <div className="metrics-grid">
            <div className="metric">
              <Statistic
                title={mode === 'teacher' ? '我的班级' : '我的班级'}
                value={mode === 'teacher' ? classes.length : context?.classes.length ?? 0}
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
                {mode === 'student' && (
                  <Descriptions.Item label="年龄段">
                    {context?.user.ageBand || '未设置'}
                  </Descriptions.Item>
                )}
              </Descriptions>
            </div>

            <div className="portal-panel">
              <Title level={3}>{mode === 'teacher' ? '我的班级' : '所在班级'}</Title>
              {mode === 'teacher' ? (
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
              ) : (
                <Space wrap>
                  {(context?.classes ?? []).map((classItem) => (
                    <Tag key={classItem.id} color="blue">
                      {classItem.organization.name} / {classItem.name}
                    </Tag>
                  ))}
                  {context?.classes.length === 0 && <Text type="secondary">暂未分配班级</Text>}
                </Space>
              )}
            </div>
          </div>

          {mode === 'teacher' && (
            <div className="portal-panel">
              <PageHeader
                title="课程任务"
                description="教师只能给自己管理的班级布置已发布课程。"
                extra={
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => setAssignmentOpen(true)}
                  >
                    布置任务
                  </Button>
                }
              />
              <Table
                rowKey="id"
                size="small"
                dataSource={assignments}
                loading={loading}
                pagination={{ pageSize: 6 }}
                columns={assignmentColumns()}
              />
            </div>
          )}

          {mode === 'student' && (
            <div className="portal-panel">
              <Title level={3}>我的任务</Title>
              <Table
                rowKey="id"
                size="small"
                dataSource={assignments}
                loading={loading}
                pagination={{ pageSize: 6 }}
                columns={[
                  ...assignmentColumns().filter((column) => column.title !== '记录数'),
                  {
                    title: '操作',
                    align: 'right',
                    render: (_, record) => (
                      <Button type="primary" size="small" onClick={() => startAssignment(record)}>
                        进入课件
                      </Button>
                    ),
                  },
                ]}
              />
            </div>
          )}

          <div className="portal-panel">
            <Title level={3}>可用课程</Title>
            <Table
              rowKey="id"
              size="small"
              dataSource={courses}
              loading={loading}
              pagination={{ pageSize: 6 }}
              columns={[
                {
                  title: '课程',
                  render: (_, record) => (
                    <Space direction="vertical" size={0}>
                      <Text strong>{record.title}</Text>
                      <Text type="secondary">{record.slug}</Text>
                    </Space>
                  ),
                },
                {
                  title: '运行方式',
                  dataIndex: 'runtimeType',
                  render: (value: CourseRuntimeType) => <Tag>{courseRuntimeLabel(value)}</Tag>,
                },
                {
                  title: '入口',
                  align: 'right',
                  render: (_, record) => (
                    mode === 'student' ? (
                      <Text type="secondary">从任务进入</Text>
                    ) : (
                      <Button href={record.entryUrl} target="_blank" size="small">
                        打开
                      </Button>
                    )
                  ),
                },
              ]}
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
              columns={learningRecordColumns()}
            />
          </div>
        </Content>
      </Layout>

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

      <Modal
        title="布置课程任务"
        open={assignmentOpen}
        onCancel={() => {
          setAssignmentOpen(false);
          assignmentForm.resetFields();
        }}
        okText="布置"
        onOk={() => assignmentForm.submit()}
        destroyOnClose
      >
        <Form
          form={assignmentForm}
          layout="vertical"
          preserve={false}
          onFinish={async (values) => {
            await api.createTeacherAssignment(values);
            messageApi.success('课程任务已布置');
            setAssignmentOpen(false);
            assignmentForm.resetFields();
            await reload();
          }}
        >
          <Form.Item
            name="courseId"
            label="课程"
            rules={[{ required: true, message: '请选择课程' }]}
          >
            <Select
              optionFilterProp="label"
              options={courses
                .filter((course) => course.status === 'PUBLISHED')
                .map((course) => ({ label: course.title, value: course.id }))}
            />
          </Form.Item>
          <Form.Item
            name="classId"
            label="班级"
            rules={[{ required: true, message: '请选择班级' }]}
          >
            <Select
              optionFilterProp="label"
              options={classes.map((classItem) => ({
                label: `${classItem.organization.name} / ${classItem.name}`,
                value: classItem.id,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="title"
            label="任务标题"
            rules={[{ required: true, message: '请输入任务标题' }]}
          >
            <Input placeholder="第一课：机器如何从例子中学习" />
          </Form.Item>
          <Form.Item name="instructions" label="任务说明">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="startAt" label="开始时间 ISO（可选）">
            <Input placeholder="2026-06-02T08:00:00.000Z" />
          </Form.Item>
          <Form.Item name="dueAt" label="截止时间 ISO（可选）">
            <Input placeholder="2026-06-09T23:59:59.000Z" />
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  );
}

function assignmentColumns(): ColumnsType<PortalAssignment> {
  return [
    {
      title: '任务',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{record.title}</Text>
          <Text type="secondary">{record.course.title}</Text>
        </Space>
      ),
    },
    {
      title: '班级',
      render: (_, record) => `${record.class.organization.name} / ${record.class.name}`,
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (value: string) => <Tag color={value === 'ACTIVE' ? 'green' : 'default'}>{value}</Tag>,
    },
    {
      title: '记录数',
      dataIndex: 'recordsCount',
    },
    {
      title: '截止时间',
      dataIndex: 'dueAt',
      render: (value: string | null) => value ? new Date(value).toLocaleString() : <Text type="secondary">未设置</Text>,
    },
  ];
}

function learningRecordColumns(): ColumnsType<LearningRecord> {
  return [
    {
      title: '课程',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{record.course.title}</Text>
          <Text type="secondary">{record.assignment?.title ?? '自主学习'}</Text>
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

function siblingPortalOrigin(subdomain: 'teacher' | 'student' | 'agent') {
  const { protocol, hostname, port } = window.location;

  if (hostname.endsWith('docpine.online')) {
    return `${protocol}//${subdomain}.docpine.online`;
  }

  return `${protocol}//${hostname}${port ? `:${port}` : ''}`;
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
    teacher: '教师后台',
    student: '学生后台',
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
    STATIC: '静态前端',
    NODE: 'Node 服务',
    BOTH: '静态 + Node',
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
