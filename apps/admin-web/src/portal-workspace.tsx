import {
  BookOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  FileDoneOutlined,
  LogoutOutlined,
  ReadOutlined,
  ReloadOutlined,
  TeamOutlined,
  UserOutlined,
} from "@ant-design/icons";
import {
  Button,
  ConfigProvider,
  Empty,
  Select,
  Space,
  Switch,
  Typography,
} from "antd";
import dayjs from "dayjs";
import { useState, type ReactNode } from "react";
import type { AdminUser, Courseware, PortalAssignment } from "./api";
import kilnImage from "../../../coursewares/qiong-kiln-challenge/static/assets/workshop-warm.png";
import "./portal-workspace.css";

export type WorkspaceSection =
  | "home"
  | "records"
  | "schedule"
  | "classes"
  | "profile";
export function ModuleHeading({
  title,
  detail,
  extra,
}: {
  title: string;
  detail?: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <div className="workspace-module-heading">
      <div>
        <h2>{title}</h2>
        {detail && <div className="workspace-module-detail">{detail}</div>}
      </div>
      {extra}
    </div>
  );
}

export function WorkspaceShell({
  mode,
  user,
  section,
  onSection,
  loading,
  onReload,
  onLogout,
  children,
}: {
  mode: "teacher" | "student";
  user: AdminUser;
  section: WorkspaceSection;
  onSection: (section: WorkspaceSection) => void;
  loading: boolean;
  onReload: () => void;
  onLogout: () => void;
  children: ReactNode;
}) {
  const teacher = mode === "teacher";
  const navigation: {
    key: WorkspaceSection;
    label: string;
    icon: ReactNode;
  }[] = [
    {
      key: "home",
      label: teacher ? "今日课堂" : "我的学习",
      icon: <ReadOutlined />,
    },
    {
      key: "records",
      label: teacher ? "学生作品" : "学习记录",
      icon: <FileDoneOutlined />,
    },
    {
      key: "schedule",
      label: teacher ? "我的课表" : "全部任务",
      icon: <CalendarOutlined />,
    },
    {
      key: "classes",
      label: teacher ? "班级与课程" : "我的课程",
      icon: <TeamOutlined />,
    },
    { key: "profile", label: "我的资料", icon: <UserOutlined /> },
  ];
  const active = navigation.find((item) => item.key === section)!;
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#187344",
          colorLink: "#187344",
          borderRadius: 6,
        },
        components: { Button: { primaryShadow: "none" } },
      }}
    >
      <div className={`workspace-shell workspace-${mode}`}>
        <aside className="workspace-sidebar">
          <div className="workspace-brand">
            <BookOutlined />
            <strong>智课</strong>
            <span>{teacher ? "教师工作台" : "学生工作台"}</span>
          </div>
          <div className="workspace-account">
            <UserOutlined />
            <span>{user.displayName || user.username || user.email}</span>
          </div>
          <nav aria-label={teacher ? "教师工作台导航" : "学生工作台导航"}>
            {navigation.map((item) => (
              <button
                key={item.key}
                type="button"
                aria-current={section === item.key ? "page" : undefined}
                onClick={() => onSection(item.key)}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
          <div className="workspace-sidebar-foot">
            <span>智美教育新生态业务底座</span>
            <Button icon={<LogoutOutlined />} onClick={onLogout}>
              退出登录
            </Button>
          </div>
        </aside>
        <main className="workspace-main">
          <header className="workspace-header">
            <div>
              <h1>{active.label}</h1>
              <time>
                {dayjs().format("M月D日")} ·{" "}
                {
                  ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][
                    dayjs().day()
                  ]
                }
              </time>
            </div>
            <Space>
              <Button
                aria-label="刷新工作台"
                title="刷新工作台"
                icon={<ReloadOutlined />}
                loading={loading}
                onClick={onReload}
              />
              <Button
                className="workspace-mobile-logout"
                aria-label="退出登录"
                title="退出登录"
                icon={<LogoutOutlined />}
                onClick={onLogout}
              />
            </Space>
          </header>
          <div className="workspace-content" aria-busy={loading}>
            {children}
          </div>
        </main>
      </div>
    </ConfigProvider>
  );
}

export function preferredAssignment(assignments: PortalAssignment[]) {
  return (
    assignments.find(
      (a) => a.status === "ACTIVE" && a.teachingStatus === "OPEN",
    ) ??
    assignments.find(
      (a) => a.status === "ACTIVE" && a.teachingStatus === "READY",
    ) ??
    assignments.find((a) => a.status === "ACTIVE") ??
    assignments[0]
  );
}

export function CourseVisual({ title }: { title: string }) {
  return /邛窑/.test(title) ? (
    <img
      className="workspace-course-image"
      src={kilnImage}
      alt="邛窑虚拟窑场"
    />
  ) : (
    <div className="workspace-course-icon">
      <BookOutlined />
    </div>
  );
}

export function TeacherClassroomOverview({
  assignments,
  onOpen,
  onToggle,
  onToggleCourseware,
  onRecords,
  onSchedule,
  children,
}: {
  assignments: PortalAssignment[];
  onOpen: (assignment: PortalAssignment) => void;
  onToggle: (assignment: PortalAssignment) => Promise<void>;
  onToggleCourseware: (
    assignment: PortalAssignment,
    courseware: Courseware,
  ) => Promise<void>;
  onRecords: (assignment: PortalAssignment) => void;
  onSchedule: () => void;
  children?: ReactNode;
}) {
  const [selectedId, setSelectedId] = useState(""),
    [busy, setBusy] = useState("");
  const current =
    assignments.find((a) => a.id === selectedId) ??
    preferredAssignment(assignments);
  const today = assignments
    .filter((a) => a.startAt && dayjs(a.startAt).isSame(dayjs(), "day"))
    .sort((a, b) => dayjs(a.startAt).valueOf() - dayjs(b.startAt).valueOf());
  const operate = async (key: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy("");
    }
  };
  return (
    <div className="workspace-classroom-layout">
      <section className="workspace-classroom">
        <ModuleHeading
          title="当前课堂"
          extra={
            assignments.length > 1 ? (
              <Select
                aria-label="切换课堂"
                className="workspace-assignment-select"
                value={current?.id}
                onChange={setSelectedId}
                options={assignments.map((a) => ({
                  value: a.id,
                  label: `${a.title} · ${a.class.name}`,
                }))}
              />
            ) : null
          }
        />
        {current ? (
          <>
            <div className="workspace-current-course">
              <CourseVisual title={current.course.title} />
              <div>
                <h2>{current.course.title}</h2>
                <p>{current.class.name}</p>
                <Typography.Text type="secondary">
                  {current.title}
                </Typography.Text>
                <div className="workspace-course-actions">
                  <Button
                    type="primary"
                    size="large"
                    icon={<ReadOutlined />}
                    onClick={() => onOpen(current)}
                  >
                    进入课堂
                  </Button>
                  <Button
                    type="link"
                    icon={<EyeOutlined />}
                    onClick={() => onRecords(current)}
                  >
                    查看提交
                  </Button>
                </div>
              </div>
            </div>
            <div className="workspace-class-status">
              <span>
                <span
                  className={`workspace-status-dot ${current.teachingStatus === "OPEN" ? "is-open" : ""}`}
                />
                {current.teachingStatus === "OPEN"
                  ? "课堂进行中"
                  : current.teachingStatus === "ENDED"
                    ? "课堂已结束"
                    : "课堂尚未开始"}
              </span>
              <Button
                loading={busy === "class"}
                disabled={Boolean(busy) && busy !== "class"}
                onClick={() => void operate("class", () => onToggle(current))}
              >
                {current.teachingStatus === "OPEN"
                  ? "结束课程"
                  : current.teachingStatus === "ENDED"
                    ? "重新开始"
                    : "开始课程"}
              </Button>
            </div>
            <ModuleHeading
              title="本课课件"
              detail={`${current.course.coursewares?.length ?? 0} 个课件`}
              extra={
                <Button type="link" onClick={() => onOpen(current)}>
                  课前资料与课件管理
                </Button>
              }
            />
            <div className="workspace-courseware-list">
              {(current.course.coursewares ?? []).map((c) => {
                const opened =
                  current.coursewareStates?.find((s) => s.coursewareId === c.id)
                    ?.status === "OPEN";
                return (
                  <div className="workspace-courseware-row" key={c.id}>
                    <BookOutlined />
                    <strong>{c.title}</strong>
                    <Switch
                      aria-label={`${c.title}开放状态`}
                      checked={opened}
                      loading={busy === c.id}
                      disabled={
                        current.teachingStatus !== "OPEN" ||
                        (Boolean(busy) && busy !== c.id)
                      }
                      onChange={() =>
                        void operate(c.id, () => onToggleCourseware(current, c))
                      }
                    />
                    <span>{opened ? "开放" : "关闭"}</span>
                  </div>
                );
              })}
              {!current.course.coursewares?.length && (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="本课程暂无课件"
                />
              )}
            </div>
          </>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无分配的课堂"
          />
        )}
        {children}
      </section>
      <aside className="workspace-agenda">
        <ModuleHeading
          title="今日安排"
          extra={
            <Button type="link" onClick={onSchedule}>
              全部课表
            </Button>
          }
        />
        {today.length ? (
          today.map((a) => (
            <button
              type="button"
              className={`workspace-agenda-row ${a.id === current?.id ? "selected" : ""}`}
              key={a.id}
              onClick={() => setSelectedId(a.id)}
            >
              <time>
                <ClockCircleOutlined /> {dayjs(a.startAt).format("HH:mm")}
                {a.dueAt ? `—${dayjs(a.dueAt).format("HH:mm")}` : ""}
              </time>
              <strong>{a.course.title}</strong>
              <span>{a.class.name}</span>
            </button>
          ))
        ) : (
          <p className="workspace-empty-inline">今日暂无计划安排</p>
        )}
      </aside>
    </div>
  );
}
