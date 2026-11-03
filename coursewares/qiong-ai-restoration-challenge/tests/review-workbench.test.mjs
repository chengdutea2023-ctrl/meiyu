import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "@phosphor-icons/react";
import * as schedule from "../shared/preparation-schedule.mjs";
import * as evidence from "../shared/preparation-evidence.mjs";
import * as review from "../client/review-workbench.mjs";

const require = createRequire(import.meta.url);
const students = [
  "SUBMITTED",
  "APPROVED",
  "RETURNED",
  "DRAFT",
  "SUBMITTED",
].map((status, i) => ({
  id: `student-${i}`,
  name: `测试学生${i}`,
  assetCount: 1,
  preparation: { status, revision: 2, evidenceDigest: `digest-${i}` },
}));
const detail = {
  studentId: students[0].id,
  preparation: students[0].preparation,
};

test("roster defaults to submitted students, while preserving every other status and search", () => {
  assert.deepEqual(review.reviewCounts(students), {
    SUBMITTED: 2,
    APPROVED: 1,
    RETURNED: 1,
    DRAFT: 1,
    ALL: 5,
  });
  assert.deepEqual(
    review.reviewRoster(students).map((s) => s.id),
    ["student-0", "student-4"],
  );
  for (const state of review.REVIEW_FILTERS) {
    const rows = review.reviewRoster(students, state.id);
    assert.equal(rows.length, review.reviewCounts(students)[state.id]);
  }
  assert.equal(
    review.reviewRoster(students, "ALL", "测试学生3")[0].preparation.status,
    "DRAFT",
  );
  assert.equal(review.reviewRoster(students, "SUBMITTED", "学生3").length, 0);
});

test("next student skips reviewed entries, wraps safely and terminates without approving others", () => {
  const before = JSON.stringify(students);
  assert.equal(
    review.nextPendingStudent(students, "student-0").id,
    "student-4",
  );
  assert.equal(
    review.nextPendingStudent(students, "student-4").id,
    "student-0",
  );
  assert.equal(review.nextPendingStudent([students[0]], "student-0"), null);
  assert.equal(review.nextPendingStudent([], "unknown"), null);
  assert.equal(JSON.stringify(students), before);
});

test("review submission binds the selected student, revision and evidence digest and requires a return reason", () => {
  assert.deepEqual(review.reviewPayload("student-0", detail, "APPROVED"), {
    decision: "APPROVED",
    revision: 2,
    evidenceDigest: "digest-0",
    feedback: "",
  });
  assert.throws(
    () => review.reviewPayload("student-4", detail, "APPROVED"),
    /当前学生/,
  );
  assert.throws(
    () =>
      review.reviewPayload(
        "student-0",
        {
          ...detail,
          preparation: { ...detail.preparation, status: "APPROVED" },
        },
        "APPROVED",
      ),
    /待审核/,
  );
  assert.throws(
    () =>
      review.reviewPayload(
        "student-0",
        {
          ...detail,
          preparation: { ...detail.preparation, evidenceDigest: "" },
        },
        "APPROVED",
      ),
    /版本/,
  );
  assert.throws(
    () => review.reviewPayload("student-0", detail, "RETURNED", "重交"),
    /具体补充/,
  );
  for (const reason of review.REVIEW_REASONS)
    assert.equal(
      review.reviewPayload("student-0", detail, "RETURNED", reason).feedback,
      reason,
    );
});

test("confirmed response is required before advancing; timeout and stale review are not automatically retried", async () => {
  let calls = 0;
  await assert.rejects(
    review.submitReview(
      async () => {
        calls++;
        throw Error("学生已更新资料");
      },
      "student-0",
      detail,
      "APPROVED",
    ),
    /已更新/,
  );
  assert.equal(calls, 1);
  await assert.rejects(
    review.submitReview(
      async () => {
        calls++;
        return {};
      },
      "student-0",
      detail,
      "APPROVED",
    ),
    /尚未确认/,
  );
  assert.equal(calls, 2);
  const saved = await review.submitReview(
    async (path, method, payload) => {
      assert.equal(path, "preparation/students/student-0/review");
      assert.equal(method, "POST");
      assert.equal(payload.evidenceDigest, "digest-0");
      return { preparation: { ...detail.preparation, status: "APPROVED" } };
    },
    "student-0",
    detail,
    "APPROVED",
  );
  assert.equal(saved.preparation.status, "APPROVED");
});

function loadJsx(name, dependencies, globals = {}) {
  return readFile(
    new URL(`../client/${name}.jsx`, import.meta.url),
    "utf8",
  ).then((source) => {
    const module = { exports: {} };
    vm.runInNewContext(
      ts.transpileModule(source, {
        fileName: `${name}.tsx`,
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          jsx: ts.JsxEmit.React,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText,
      {
        module,
        exports: module.exports,
        require: (id) =>
          dependencies[id] ?? (id.endsWith(".css") ? {} : require(id)),
        Date,
        document: undefined,
        ...globals,
      },
    );
    return { Component: module.exports.default, source };
  });
}

test("real teacher component renders the queue and counts, with settings not crowding the first screen", async () => {
  const { Component, source } = await loadJsx("TeacherPreparationReview", {
    react: { ...React, default: React },
    "@phosphor-icons/react": icons,
    "./platform": {
      api() {
        throw Error("No server calls in SSR");
      },
    },
    "./PreparationPhoto": { default: () => null },
    "./SourceReference": { default: () => null },
    "../shared/preparation-schedule.mjs": schedule,
    "../shared/preparation-evidence.mjs": evidence,
    "./review-workbench.mjs": review,
  });
  const html = renderToStaticMarkup(
    React.createElement(Component, {
      data: {
        students,
        settings: { enabled: true },
        context: { assignment: {} },
      },
      onReload() {},
    }),
  );
  assert.match(html, /学生名单/);
  assert.match(html, /测试学生0/);
  assert.match(html, /测试学生4/);
  assert.doesNotMatch(html, /测试学生1/);
  assert.doesNotMatch(html, /准备开始时间/);
  assert.match(html, /准备设置/);
  assert.match(html, /资料收集中/);
  assert.match(source, /picturesReady/);
  assert.match(source, /sequence\.current/);
  assert.match(source, /selection\.current !== studentId/);
  assert.match(source, /disabled=\{!canReview\}/);
  assert.match(source, /const canReturn = reviewable && !working/);
  assert.match(source, /disabled=\{!canReturn\}/);
  assert.match(source, /decision === "APPROVED" \? !canReview : !canReturn/);
});

test("homepage review link selects the requested pending student, falling back safely for stale links", async () => {
  for (const requested of ['student-4', 'not-in-class', 'student-1']) {
    const { Component } = await loadJsx('TeacherPreparationReview', {
      react: { ...React, default: React }, '@phosphor-icons/react': icons,
      './platform': { api() { throw Error('No server calls in SSR'); } },
      './PreparationPhoto': { default: () => null }, './SourceReference': { default: () => null },
      '../shared/preparation-schedule.mjs': schedule,
      '../shared/preparation-evidence.mjs': evidence, './review-workbench.mjs': review,
    }, { location: { search: `?studentId=${requested}` }, URLSearchParams });
    const html = renderToStaticMarkup(React.createElement(Component, {
      data: { students, settings: { enabled: true }, context: { assignment: {} } }, onReload() {},
    }));
    assert.match(html, requested === 'student-4' ? /<h2>测试学生4<span>的课外线索/ : /<h2>测试学生0<span>的课外线索/);
  }
});

test("parent preparation page still mounts the existing student workflow without undeclared teacher state", async () => {
  const { Component, source } = await loadJsx("Preparation", {
    react: { ...React, default: React },
    "@phosphor-icons/react": icons,
    "./platform": {},
    "./PreparationPhoto": { default: () => null },
    "./TeacherPreparationReview": { default: () => null },
    "./SourceReference": { default: () => null },
    "../shared/preparation-schedule.mjs": schedule,
    "../shared/preparation-evidence.mjs": evidence,
    "./preparation-upload": {},
  });
  assert.match(
    renderToStaticMarkup(React.createElement(Component)),
    /正在读取本次任务/,
  );
  for (const text of [
    "preparation/submit",
    "preparation/reopen",
    "上传我的线索",
    "保存线索卡",
    "这次不用",
    "maxLength={800}",
    "student-clue-delete",
    "确认删除",
  ])
    assert.ok(source.includes(text), text);
  assert.match(source, /api\(\s*`assets\/\$\{deleting\.id\}`,\s*"DELETE"\s*,?\s*\)/);
});

test("student preparation renders draft, submitted, approved and returned evidence after teacher extraction", async () => {
  for (const status of ["DRAFT", "SUBMITTED", "APPROVED", "RETURNED"]) {
    let index = 0;
    const data = {
      context: {
        role: "STUDENT",
        actor: { name: "隔离学生" },
        assignment: { title: "准备任务" },
      },
      settings: {
        enabled: true,
        workflowVersion: 2,
        instructions: "寻找相关图片，注明来源并记录可见特征。",
      },
      preparation: {
        status,
        revision: 1,
        teacherName: "隔离教师",
        feedback: status === "RETURNED" ? "请补充图片来源" : "",
      },
      assets: [
        {
          id: "student-clue",
          title: "线索照片",
          role: "clue",
          source: "测试图录",
          feature: "口沿外翻",
        },
      ],
    };
    const { Component } = await loadJsx("Preparation", {
      react: {
        ...React,
        default: React,
        useState: (value) => React.useState(index++ === 0 ? data : value),
      },
      "@phosphor-icons/react": icons,
      "./platform": {},
      "./PreparationPhoto": { default: () => null },
      "./TeacherPreparationReview": { default: () => null },
      "./SourceReference": { default: () => null },
      "../shared/preparation-schedule.mjs": schedule,
      "../shared/preparation-evidence.mjs": evidence,
      "./preparation-upload": {},
    });
    const html = renderToStaticMarkup(React.createElement(Component));
    assert.match(html, /我的课外线索/);
    assert.match(html, /student-preparation-app/);
    for (const heading of ["准备状态", "准备要求", "时间安排", "提交与审核", "我的线索", "已保存到本次任务"])
      assert.ok(html.includes(heading), heading);
    assert.match(html, /口沿外翻/);
    assert.match(html, /上传我的线索/);
    assert.doesNotMatch(html, /teacher-review-app/);
    if (status === "APPROVED") assert.match(html, /资料已审核通过/);
    if (status === "SUBMITTED") assert.match(html, /已提交，等待老师审核/);
    if (status === "RETURNED") assert.match(html, /请补充图片来源/);
  }
});

async function studentMarkup({ status = "DRAFT", enabled = true, assets = [], extension = null } = {}) {
  let index = 0;
  const data = {
    context: { role: "STUDENT", actor: { name: "隔离学生" }, assignment: { title: "隔离任务" } },
    settings: { enabled, workflowVersion: 2, instructions: "寻找相关图片，注明来源并记录可见特征。" },
    preparation: { status, revision: 1 },
    preparationExtension: extension,
    assets,
  };
  const before = JSON.stringify(data);
  const { Component } = await loadJsx("Preparation", {
    react: { ...React, default: React, useState: value => React.useState(index++ === 0 ? data : value) },
    "@phosphor-icons/react": icons,
    "./platform": {},
    "./PreparationPhoto": { default: () => null },
    "./TeacherPreparationReview": { default: () => null },
    "./SourceReference": { default: () => null },
    "../shared/preparation-schedule.mjs": schedule,
    "../shared/preparation-evidence.mjs": evidence,
    "./preparation-upload": {},
  });
  const html = renderToStaticMarkup(React.createElement(Component));
  assert.equal(JSON.stringify(data), before, "render must not seed or modify saved material");
  return html;
}

test("empty student task stays empty; no teacher or sample images are silently added", async () => {
  const html = await studentMarkup();
  assert.match(html, /还没有线索/);
  assert.doesNotMatch(html, /class="prep-evidence"/);
  assert.match(html, /课外准备进度/);
  assert.match(html, /aria-current="step"[^>]*>.*?整理线索/);
});

test("closed and individual supplementation keep the original editing and submission restrictions", async () => {
  const closed = await studentMarkup({ enabled: false });
  assert.match(closed, /需要补交请联系老师/);
  assert.match(closed, /disabled=""[^>]*>[\s\S]*?上传我的线索/);
  assert.match(closed, /当前不在提交时间内/);
  const reopened = await studentMarkup({ enabled: false, extension: { until: new Date(Date.now() + 60000).toISOString() } });
  assert.match(reopened, /个人补交通道已开放/);
  assert.doesNotMatch(reopened, /当前不在提交时间内/);
});
