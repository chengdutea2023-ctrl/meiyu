import {
  ApartmentOutlined,
  AppstoreOutlined,
  BankOutlined,
  CheckCircleOutlined,
  CopyOutlined,
  LogoutOutlined,
  PlusOutlined,
  ReloadOutlined,
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
  CreatedApplication,
  OrganizationDetail,
  OrganizationSummary,
  OrganizationType,
  UserStatus,
  AdminUser,
  ClassMemberRole,
} from './api';

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;

const TOKEN_KEY = 'jiaoxue_admin_access_token';
const USER_KEY = 'jiaoxue_admin_user';

type ViewKey = 'dashboard' | 'users' | 'applications' | 'organizations';

function App() {
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
        if (!result.user.isPlatformAdmin) {
          messageApi.error('当前账号没有平台管理员权限');
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
  }, [api, logout, messageApi, token]);

  if (!token || !currentUser) {
    return (
      <>
        {contextHolder}
        <LoginPage
          loading={loadingSession}
          onLogin={async (usernameOrEmail, password) => {
            const result = await api.login(usernameOrEmail, password);
            if (!result.user.isPlatformAdmin) {
              throw new Error('当前账号不是平台管理员');
            }
            saveSession(result.accessToken, result.user);
            messageApi.success('登录成功');
          }}
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
                {currentUser.displayName || currentUser.username}
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
            {view === 'organizations' && <OrganizationsPage api={api} />}
          </Content>
        </Layout>
      </Layout>
    </>
  );
}

function LoginPage({
  loading,
  onLogin,
}: {
  loading: boolean;
  onLogin: (usernameOrEmail: string, password: string) => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="login-page">
      <div className="login-panel">
        <Title level={1}>智美教育新生态业务底座</Title>
        <Text className="login-subtitle">平台管理员后台</Text>
        {error && <Alert type="error" message={error} showIcon />}
        <Form
          layout="vertical"
          initialValues={{
            usernameOrEmail: 'admin@example.com',
            password: 'ChangeMe123!',
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
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [nextUsers, nextApplications, nextOrganizations] =
        await Promise.all([
          api.listUsers(),
          api.listApplications(),
          api.listOrganizations(),
        ]);
      setUsers(nextUsers);
      setApplications(nextApplications);
      setOrganizations(nextOrganizations);
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
            title="班级"
            value={classCount}
            prefix={<AppstoreOutlined />}
          />
        </div>
      </div>
      <Alert
        className="content-alert"
        type="info"
        showIcon
        message="当前第一阶段已跑通统一登录和独立业务应用接入。"
        description="支付中心、复杂插件市场和第三方登录还不在当前阶段范围内。"
      />
    </section>
  );
}

function UsersPage({ api }: { api: ApiClient }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const [messageApi, contextHolder] = message.useMessage();

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await api.listUsers());
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const columns: ColumnsType<AdminUser> = [
    {
      title: '用户',
      dataIndex: 'username',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{record.displayName || record.username}</Text>
          <Text type="secondary">{record.email}</Text>
        </Space>
      ),
    },
    {
      title: '用户名',
      dataIndex: 'username',
    },
    {
      title: '角色',
      dataIndex: 'isPlatformAdmin',
      render: (value: boolean) =>
        value ? <Tag color="blue">平台管理员</Tag> : <Tag>普通用户</Tag>,
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
      <Table
        rowKey="id"
        columns={columns}
        dataSource={users}
        loading={loading}
        pagination={{ pageSize: 10 }}
      />
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
          onFinish={async (values) => {
            await api.createUser(values);
            messageApi.success('用户已创建');
            setOpen(false);
            await reload();
          }}
        >
          <Form.Item
            name="username"
            label="用户名"
            rules={[{ required: true, message: '请输入用户名' }]}
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
  const [form] = Form.useForm();
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
      title: '回调地址',
      dataIndex: 'redirectUris',
      render: (uris: string[]) => (
        <Space direction="vertical" size={4}>
          {uris.map((uri) => (
            <Text code key={uri}>
              {uri}
            </Text>
          ))}
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
      ),
    },
  ];

  return (
    <section>
      {contextHolder}
      <PageHeader
        title="业务应用"
        description="登记独立业务应用，维护 appId、appSecret 和回调地址。"
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
            label="回调地址"
            rules={[{ required: true, message: '请输入至少一个回调地址' }]}
          >
            <Select
              mode="tags"
              tokenSeparators={[',', '\n']}
              placeholder="http://localhost:3001/auth/callback"
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

      if (detail) {
        setDetail(await api.getOrganization(detail.id));
      }
    } finally {
      setLoading(false);
    }
  }, [api, detail]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const openDetail = async (id: string) => {
    setDetail(await api.getOrganization(id));
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
        onClose={() => setDetail(null)}
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
                                {record.user.displayName || record.user.username}
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
                label: `${user.displayName || user.username} (${user.email})`,
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
          onFinish={async (values) => {
            if (!detail || !selectedClassId) return;
            await api.addClassMember(selectedClassId, values);
            messageApi.success('班级成员已添加');
            setClassMemberOpen(false);
            setDetail(await api.getOrganization(detail.id));
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
                label: `${user.displayName || user.username} (${user.email})`,
                value: user.id,
              }))}
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

function organizationTypeLabel(type: OrganizationType) {
  const labels: Record<OrganizationType, string> = {
    SCHOOL: '学校',
    INSTITUTION: '培训机构',
    INTERNAL: '内部组织',
  };

  return labels[type];
}

export default App;

