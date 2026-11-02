import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const antd = require("antd");
const icons = require("@ant-design/icons");
const dayjs = require("dayjs");
const source = await readFile(
  new URL("../apps/admin-web/src/App.tsx", import.meta.url),
  "utf8",
);
const workspaceSource = await readFile(
  new URL("../apps/admin-web/src/portal-workspace.tsx", import.meta.url),
  "utf8",
);
const transpile = (code) =>
  ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
const workspace = { exports: {} };
let states = [],
  cursor = 0;
vm.runInNewContext(transpile(workspaceSource), {
  module: workspace,
  exports: workspace.exports,
  require: (name) =>
    name.endsWith(".css")
      ? {}
      : name.endsWith(".png")
        ? "fixture-kiln.png"
        : name === "react"
          ? {
              ...React,
              useState(initial) {
                const index = cursor++;
                if (!(index in states)) states[index] = initial;
                return [
                  states[index],
                  (value) => {
                    states[index] =
                      typeof value === "function"
                        ? value(states[index])
                        : value;
                  },
                ];
              },
            }
          : require(name),
});
const tree = ts.createSourceFile(
  "App.tsx",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const functions = new Map(
  tree.statements
    .filter(ts.isFunctionDeclaration)
    .filter((n) => n.name)
    .map((n) => [n.name.text, n]),
);
function dependencies(name, selected = new Set()) {
  const node = functions.get(name);
  if (!node || selected.has(node)) return selected;
  selected.add(node);
  const visit = (child) => {
    if (ts.isIdentifier(child) && functions.has(child.text))
      dependencies(child.text, selected);
    ts.forEachChild(child, visit);
  };
  ts.forEachChild(node, visit);
  return selected;
}
const studentModule = { exports: {} };
const studentCode = [...dependencies("StudentPortalDashboard")]
  .map((n) => n.getText(tree))
  .join("\n");
vm.runInNewContext(
  transpile(studentCode + "\nmodule.exports = StudentPortalDashboard;"),
  {
    module: studentModule,
    exports: studentModule.exports,
    require,
    ...antd,
    ...icons,
    ...workspace.exports,
    Title: antd.Typography.Title,
    Text: antd.Typography.Text,
    dayjs,
    useMemo: React.useMemo,
    useState: React.useState,
  },
);
const klass = {
  id: "class",
  name: "测试班",
  organization: { id: "school", name: "测试学校" },
};
const course = {
  id: "course",
  title: "邛窑AI探究",
  coursewares: [
    { id: "kiln", title: "烧窑" },
    { id: "restoration", title: "修复" },
  ],
};
const assignment = (id, teachingStatus = "OPEN") => ({
  id,
  title: `任务${id}`,
  status: "ACTIVE",
  teachingStatus,
  class: klass,
  course,
  coursewareStates: [{ coursewareId: "kiln", status: "OPEN" }],
});
const assignments = [
  assignment("1"),
  assignment("2", "READY"),
  assignment("3", "ENDED"),
  assignment("4"),
  assignment("5"),
];
const records = Array.from({ length: 8 }, (_, i) => ({
  id: `record-${i}`,
  course,
  courseware: { title: `作品${i}` },
  assignment: assignments[0],
  status: "COMPLETED",
  score: i === 0 ? null : 80,
  durationSeconds: 60,
  createdAt: "2026-11-03T00:00:00Z",
}));
const studentProps = {
  context: {
    user: { displayName: "测试学生", email: "student@example.test" },
    classes: [klass],
  },
  assignments,
  courses: Array.from({ length: 5 }, (_, i) => ({
    ...course,
    id: `course-${i}`,
    title: `课程${i}`,
  })),
  records,
  loading: false,
  onOpenAssignment() {},
  onViewRecord() {},
};
const html = (section) =>
  renderToStaticMarkup(
    React.createElement(studentModule.exports, { ...studentProps, section }),
  );
function descendants(element) {
  if (!element || typeof element !== "object") return [];
  return [
    element,
    ...React.Children.toArray(element.props?.children).flatMap(descendants),
    ...React.Children.toArray(element.props?.extra).flatMap(descendants),
  ];
}

test("both roles keep five named modules and refresh/logout controls", () => {
  for (const mode of ["teacher", "student"]) {
    const markup = renderToStaticMarkup(
      React.createElement(workspace.exports.WorkspaceShell, {
        mode,
        user: { displayName: "测试用户" },
        section: "home",
        onSection() {},
        onReload() {},
        onLogout() {},
        loading: false,
        children: "content",
      }),
    );
    assert.equal((markup.match(/aria-current="page"/g) ?? []).length, 1);
    assert.match(markup, /刷新工作台/);
    assert.match(markup, /退出登录/);
    for (const label of mode === "teacher"
      ? ["今日课堂", "学生作品", "我的课表", "班级与课程", "我的资料"]
      : ["我的学习", "学习记录", "全部任务", "我的课程", "我的资料"])
      assert.ok(markup.includes(label));
  }
});

test("current classroom prefers active/open, then ready, without changing assignment data", () => {
  const before = JSON.stringify(assignments);
  assert.equal(
    workspace.exports.preferredAssignment([assignments[1], assignments[0]]).id,
    "1",
  );
  assert.equal(
    workspace.exports.preferredAssignment([assignments[2], assignments[1]]).id,
    "2",
  );
  assert.equal(JSON.stringify(assignments), before);
  assert.equal(workspace.exports.preferredAssignment([]), undefined);
});

test("teacher overview routes existing controls to the selected assignment and blocks closed-class switches", async () => {
  states = [];
  cursor = 0;
  const calls = [];
  const props = {
    assignments,
    onOpen: (a) => calls.push(["open", a.id]),
    onRecords: (a) => calls.push(["records", a.id]),
    onToggle: async (a) => calls.push(["toggle", a.id]),
    onToggleCourseware: async (a, c) => calls.push(["ware", a.id, c.id]),
    onSchedule: () => calls.push(["schedule"]),
  };
  const render = () => {
    cursor = 0;
    return descendants(workspace.exports.TeacherClassroomOverview(props));
  };
  let nodes = render();
  nodes.find((n) => n.type === antd.Select).props.onChange("2");
  nodes = render();
  assert.ok(
    nodes.filter((n) => n.type === antd.Switch).every((n) => n.props.disabled),
  );
  nodes
    .find((n) => n.type === antd.Button && n.props.children === "进入课堂")
    .props.onClick();
  nodes
    .find((n) => n.type === antd.Button && n.props.children === "查看提交")
    .props.onClick();
  nodes
    .find((n) => n.type === antd.Button && n.props.children === "开始课程")
    .props.onClick();
  assert.deepEqual(calls, [
    ["open", "2"],
    ["records", "2"],
    ["toggle", "2"],
  ]);
  await new Promise((resolve) => setImmediate(resolve));
  nodes = render();
  nodes.find((n) => n.type === antd.Select).props.onChange("1");
  nodes = render();
  nodes.find((n) => n.type === antd.Switch).props.onChange();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls.at(-1), ["ware", "1", "kiln"]);
});

test("student modules retain full tasks, courses and records rather than only the home preview", () => {
  const tasks = html("schedule"),
    courses = html("classes"),
    allRecords = html("records");
  for (const task of assignments) assert.ok(tasks.includes(task.title));
  for (const item of studentProps.courses)
    assert.ok(courses.includes(item.title));
  for (const item of records)
    assert.ok(allRecords.includes(item.courseware.title));
  assert.match(tasks, /老师还未开始课程/);
  assert.match(tasks, /本次课程已结束/);
  assert.match(html("home"), /当前课堂/);
  assert.match(html("profile"), /student@example.test/);
});

test("existing launch, preparation, schedule, details and shared projection wiring remain present", () => {
  const portal = functions.get("RolePortal").getText(tree);
  for (const name of [
    "startCourseware",
    "openPreparation",
    "openClassStudents",
    "openAssignmentRecords",
    "openCoursewareData",
    "saveAssignmentSchedule",
    "toggleAssignmentCourseware",
    "markTeacherWorkItemDone",
    "updateAssignmentTeachingStatus",
  ])
    assert.ok(portal.includes(name), name);
  assert.match(portal, /onViewRecord=\{openRecordDetail\}/);
  assert.match(portal, /onProject=\{projectRecord\}/);
  assert.match(portal, /disabled=\{!canStart\}/);
  assert.match(studentCode, /onClick=\{\(\) => onViewRecord\(record\)\}/);
  assert.match(studentCode, /未评分/);
});
