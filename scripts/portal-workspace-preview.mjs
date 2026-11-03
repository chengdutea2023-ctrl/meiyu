// Local-only fixture API for UI acceptance; never connects to the production platform.
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createServer as createViteServer } from "vite";
const root = resolve(fileURLToPath(new URL("..", import.meta.url))),
  now = new Date(),
  date = now.toISOString();
const user = (role) => ({
  id: `fixture-${role}`,
  username: role,
  displayName: role === "teacher" ? "曾老师" : "孙朵朵",
  email: `${role}@example.test`,
  userType: role === "teacher" ? "TEACHER" : "STUDENT",
  status: "ACTIVE",
  approvalStatus: "APPROVED",
  createdAt: date,
  updatedAt: date,
});
const classItem = {
  id: "fixture-class",
  name: "一年级1班",
  organization: { id: "fixture-school", name: "课堂验收学校" },
  membersCount: 30,
  assignmentsCount: 5,
  status: "ACTIVE",
  code: "TEST",
};
const titles = ["邛窑AI烧窑挑战", "邛窑AI看到了什么", "邛窑AI修复挑战"];
const wares = titles.map((title, i) => ({
  id: `ware-${i}`,
  courseId: "course-1",
  title,
  slug: `fixture-${i}`,
  runtimeType: i ? "BOTH" : "STATIC",
  status: "PUBLISHED",
  deploymentStatus: "RUNNING",
  sortOrder: i,
  createdAt: date,
  updatedAt: date,
}));
const course = {
  id: "course-1",
  slug: "fixture-qiong",
  title: "邛窑AI探究",
  coursewares: wares,
  status: "PUBLISHED",
  runtimeType: "STATIC",
  description: "隔离界面验收课程",
  createdAt: date,
  updatedAt: date,
};
const assignments = Array.from({ length: 5 }, (_, i) => ({
  id: `assignment-${i}`,
  title: i === 0 ? "邛窑三课件测试" : `教学任务 ${i + 1}`,
  course,
  class: classItem,
  teacher: user("teacher"),
  status: "ACTIVE",
  teachingStatus: i === 4 ? "ENDED" : i === 3 ? "READY" : "OPEN",
  startAt: new Date(new Date().setHours(10 + i, 0, 0, 0)).toISOString(),
  dueAt: new Date(new Date().setHours(10 + i, 40, 0, 0)).toISOString(),
  createdAt: date,
  recordsCount: 3,
  coursewareStates: wares.map((c) => ({
    id: `state-${i}-${c.id}`,
    coursewareId: c.id,
    courseware: c,
    status: i === 3 ? "CLOSED" : "OPEN",
  })),
}));
const records = Array.from({ length: 6 }, (_, i) => ({
  id: `record-${i}`,
  student: user("student"),
  class: classItem,
  course,
  courseware: wares[i % 3],
  assignment: assignments[i % 5],
  status: i === 5 ? "STARTED" : "COMPLETED",
  score: i % 3 === 2 ? null : 80 + i,
  durationSeconds: 320,
  summary: {
    brief: "隔离验收作品",
    resultItems: [{ label: "完成情况", value: "已完成" }],
  },
  artifacts: [],
  createdAt: date,
  updatedAt: date,
  completedAt: date,
  startedAt: date,
}));
let items = Array.from({ length: 13 }, (_, i) => ({
  id: `item-${i}`,
  audience: "TEACHER",
  type: "LEARNING_RECORD_SUBMITTED",
  status: "PENDING",
  title: `孙朵朵 提交了 ${wares[i % 3].title}`,
  description: "一年级1班 · 邛窑AI探究",
  actionLabel: "查看提交",
  createdAt: date,
  learningRecord: records[i % 6],
}));
const api = createServer(async (req, res) => {
  try {
    const u = new URL(req.url, "http://localhost"),
      p = u.pathname.replace(/^\/api\/v1/, "");
    let input = {};
    if (req.method !== "GET") {
      let raw = "";
      for await (const c of req) raw += c;
      input = raw ? JSON.parse(raw) : {};
    }
    const role = String(req.headers.authorization).includes("student")
      ? "student"
      : "teacher";
    let result;
    if (p === "/auth/login") {
      const r = input.usernameOrEmail === "student" ? "student" : "teacher";
      result = {
        accessToken: `fixture-${r}`,
        refreshToken: `fixture-refresh-${r}`,
        user: user(r),
      };
    } else if (p === "/auth/me")
      result = { user: user(role), organizations: [], classes: [classItem] };
    else if (p === "/portal/me")
      result = {
        user: user(role),
        classes: [classItem],
        organizations: [classItem.organization],
      };
    else if (p === "/work-items/summary")
      result = { pendingCount: items.length };
    else if (p === "/work-items") result = { items };
    else if (p === "/course-runtime/preparation/pending-reviews") result = {
      items: [{ id: "preparation-fixture", assignmentId: assignments[0].id, assignmentTitle: assignments[0].title,
        coursewareId: wares[2].id, coursewareTitle: wares[2].title,
        studentId: user("student").id, studentName: "孙朵朵", className: classItem.name, assetCount: 3, submittedAt: date }],
      unavailableCount: 0,
    };
    else if (p === "/course-runtime/preparation/launch") result = {
      launchUrl: `http://127.0.0.1:5177/?fixtureReview=1&assignmentId=${encodeURIComponent(input.assignmentId)}&coursewareId=${encodeURIComponent(input.coursewareId)}`,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    else if (p.startsWith("/work-items/") && p.endsWith("/complete")) {
      const id = p.split("/")[2];
      result = items.find((i) => i.id === id);
      items = items.filter((i) => i.id !== id);
    } else if (p === "/portal/teacher/classes")
      result = { classes: [classItem] };
    else if (p.endsWith("/students")) result = { students: [user("student")] };
    else if (p.endsWith("/courses")) result = { courses: [course] };
    else if (/\/assignments$/.test(p)) result = { assignments };
    else if (/\/assignments\/[^/]+\/schedule$/.test(p)) {
      result = assignments.find((a) => a.id === p.split("/")[4]);
      Object.assign(result, input);
    } else if (/\/assignments\/[^/]+\/(open|close)$/.test(p)) {
      result = assignments.find((a) => a.id === p.split("/")[4]);
      result.teachingStatus = p.endsWith("/open") ? "OPEN" : "ENDED";
    } else if (/\/coursewares\/[^/]+\/(open|close)$/.test(p)) {
      result = assignments.find((a) => a.id === p.split("/")[4]);
      result.coursewareStates.find(
        (c) => c.coursewareId === p.split("/")[6],
      ).status = p.endsWith("/open") ? "OPEN" : "CLOSED";
    } else if (/\/coursewares\/[^/]+\/records$/.test(p)) result = { records };
    else if (p.endsWith("/learning-records")) result = { records };
    else if (p.includes("/learning-records/"))
      result = records.find((r) => r.id === p.split("/").at(-1));
    else if (p.includes("/preparation/options"))
      result = {
        coursewares: [{ coursewareId: wares[2].id, available: true }],
      };
    else if (p.endsWith("/coursewares"))
      result = {
        coursewares:
          assignments.find((a) => p.includes(a.id))?.coursewareStates ?? [],
      };
    else {
      res.statusCode = 404;
      result = { message: "Fixture route not provided" };
      console.log(req.method + " " + p);
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(result));
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ message: e.message }));
  }
});
await new Promise((resolve, reject) => {
  api.once("error", reject);
  api.listen(3389, "127.0.0.1", resolve);
});
const vite = await createViteServer({
  configFile: resolve(root, "apps/admin-web/vite.config.ts"),
  root: resolve(root, "apps/admin-web"),
  server: {
    host: "127.0.0.1",
    port: 5177,
    strictPort: true,
    proxy: { "/api": { target: "http://127.0.0.1:3389" } },
  },
});
await vite.listen();
console.log(
  "Isolated UI preview: http://127.0.0.1:5177/?portal=teacher (teacher / preview123); student role: student / preview123",
);
async function close() {
  await vite.close();
  api.close();
  process.exit(0);
}
process.on("SIGINT", close);
process.on("SIGTERM", close);
