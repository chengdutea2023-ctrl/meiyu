import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  unlink,
  access,
  rm,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { digest } from "../server/domain.mjs";
import { assertAssetDeletable } from "../server/asset-deletion.mjs";

const asset = {
  id: "unused-clue-image-12345",
  role: "clue",
  source: "隔离图录",
  feature: "外翻口沿",
};
const owner = () => ({
  assets: [asset],
  tasks: [],
  holdoutFrozen: [],
  preparation: { status: "DRAFT", revision: 1 },
  proposalGenerationCount: 2,
});

test("unused clues can be deleted without changing the guard input or paid counters", () => {
  const value = owner(),
    before = JSON.stringify(value);
  assert.doesNotThrow(() => assertAssetDeletable(value, asset));
  assert.equal(JSON.stringify(value), before);
  assert.throws(
    () =>
      assertAssetDeletable(value, {
        ...asset,
        builtinId: "old-teacher-material",
      }),
    /保留供追溯/,
  );
  assert.throws(
    () => assertAssetDeletable(value, { ...asset, usedInGeneration: true }),
    /保留供追溯/,
  );
  assert.throws(
    () => assertAssetDeletable({ ...value, holdoutFrozen: [asset.id] }, asset),
    /保留供追溯/,
  );
});

test("current and reset-archived evidence, plan and feature references all protect their source pictures", () => {
  const snapshots = [
    { evidence: [{ id: asset.id }] },
    { clueIds: [asset.id] },
    { referenceIds: [asset.id] },
    { holdoutIds: [asset.id] },
    { constraints: [{ evidenceId: asset.id }] },
    { featureSelections: [{ clueId: asset.id }] },
  ];
  for (const snapshot of snapshots)
    for (const archived of [false, true]) {
      const task = { snapshot, results: [] },
        value = owner();
      if (archived) value.resetHistory = [{ tasks: [task] }];
      else value.tasks = [task];
      const before = JSON.stringify(value);
      assert.throws(
        () => assertAssetDeletable(value, asset),
        (error) => error.code === "ASSET_IN_USE",
      );
      assert.equal(JSON.stringify(value), before);
    }
});

test("AI recognition history retains clue files, including failed and pending jobs", () => {
  for (const state of ["pending", "running", "succeeded", "failed"]) {
    assert.throws(
      () =>
        assertAssetDeletable(
          { ...owner(), evidenceJobs: [{ state, clueIds: [asset.id] }] },
          asset,
        ),
      /AI识别/,
    );
  }
  assert.doesNotThrow(() =>
    assertAssetDeletable(
      { ...owner(), evidenceJobs: [{ clueIds: ["another-clue"] }] },
      asset,
    ),
  );
});

test("real deletion endpoint enforces identity, editable time and history, persists before unlink and never spends AI quota", async () => {
  const dir = await mkdtemp(join(tmpdir(), "qiong-clue-delete-"));
  const picture = await readFile(
    new URL("../static/assets/case-damaged.png", import.meta.url),
  );
  const ids = [
    "student",
    "submitted",
    "approved",
    "archived",
    "recognized",
    "persist-fail",
  ];
  const diskPath = (token) =>
    join(dir, digest(`${token}:assignment:ware`).slice(0, 40));
  for (const token of ids) {
    const value = {
      ...owner(),
      id: digest(`${token}:assignment:ware`).slice(0, 40),
      assets: [
        asset,
        { ...asset, id: "second-clue-image-12345", role: "excluded" },
      ],
    };
    if (token === "submitted") value.preparation.status = "SUBMITTED";
    if (token === "approved") value.preparation.status = "APPROVED";
    if (token === "archived")
      value.resetHistory = [
        { tasks: [{ results: [], snapshot: { clueIds: [asset.id] } }] },
      ];
    if (token === "recognized")
      value.evidenceJobs = [{ state: "succeeded", clueIds: [asset.id] }];
    await mkdir(diskPath(token));
    await writeFile(join(diskPath(token), "state.json"), JSON.stringify(value));
    for (const image of value.assets)
      await writeFile(join(diskPath(token), `${image.id}.png`), picture);
  }
  const verifier = createServer(async (req, res) => {
    let raw = "";
    for await (const part of req) raw += part;
    const input = JSON.parse(raw),
      token = input.preparationToken || input.launchToken;
    if (token === "expired") {
      res.writeHead(401);
      res.end("{}");
      return;
    }
    const teacher = token === "teacher";
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        context: {
          role: teacher ? "TEACHER" : "STUDENT",
          actor: { id: token, name: "隔离测试" },
          student: teacher ? null : { id: token, userType: "STUDENT" },
          students: teacher ? [{ id: "student" }] : [],
          assignment: { id: "assignment" },
          courseware: { id: "ware", slug: "delete-fixture" },
          course: { slug: "fixture" },
        },
      }),
    );
  });
  verifier.listen(0, "127.0.0.1");
  await once(verifier, "listening");
  Object.assign(process.env, {
    PLATFORM_API_BASE: `http://127.0.0.1:${verifier.address().port}`,
    COURSEWARE_DATA_DIR: dir,
    COURSE_SLUG: "fixture",
    COURSEWARE_SLUG: "delete-fixture",
    ALLOW_LOCAL_DEMO: "0",
    AI_TEST_MOCK: "1",
    PORT: "0",
  });
  delete process.env.ARK_API_KEY;
  delete process.env.COURSEWARE_ENV_FILE;
  const { server } = await import("../server/server.js");
  if (!server.listening) await once(server, "listening");
  async function call(
    path,
    token = "student",
    method = "GET",
    value,
    formal = false,
  ) {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api/${path}`,
      {
        method,
        headers: {
          "content-type": "application/json",
          ...(formal
            ? { authorization: `Bearer ${token}` }
            : { "x-preparation-token": token }),
        },
        body: value === undefined ? undefined : JSON.stringify(value),
      },
    );
    return { status: response.status, body: await response.json() };
  }
  const remove = (token = "student", id = asset.id, formal = false) =>
    call(`assets/${id}`, token, "DELETE", undefined, formal);
  try {
    await call("preparation/settings", "teacher", "POST", {
      enabled: true,
      workflowVersion: 2,
      instructions: "隔离资料删除测试，不连接生产。",
    });
    assert.equal((await remove("expired")).status, 401);
    assert.equal((await remove("other")).status, 404);
    assert.equal((await remove("teacher")).status, 403);
    assert.equal((await remove("student", asset.id, true)).status, 403);
    for (const token of ["submitted", "approved"])
      assert.equal((await remove(token)).status, 409);
    for (const token of ["archived", "recognized"]) {
      const before = await readFile(
        join(diskPath(token), "state.json"),
        "utf8",
      );
      const result = await remove(token);
      assert.equal(result.status, 400);
      assert.equal(result.body.code, "ASSET_IN_USE");
      assert.equal(
        await readFile(join(diskPath(token), "state.json"), "utf8"),
        before,
      );
      await access(join(diskPath(token), `${asset.id}.png`));
    }
    const result = await remove();
    assert.equal(result.status, 200);
    assert.deepEqual(
      result.body.assets.map((image) => image.id),
      ["second-clue-image-12345"],
    );
    const saved = JSON.parse(
      await readFile(join(diskPath("student"), "state.json"), "utf8"),
    );
    assert.equal(saved.assets.length, 1);
    assert.equal(saved.preparation.revision, 2);
    assert.equal(saved.proposalGenerationCount, 2);
    await assert.rejects(access(join(diskPath("student"), `${asset.id}.png`)), {
      code: "ENOENT",
    });
    assert.equal((await remove()).status, 404);
    assert.equal(
      (await call("files/" + asset.id + "?format=data")).status,
      404,
    );
    await access(join(diskPath("student"), "second-clue-image-12345.png"));
    await call("preparation/settings", "teacher", "POST", {
      enabled: false,
      instructions: "隔离资料删除测试，不连接生产。",
    });
    assert.equal(
      (await remove("student", "second-clue-image-12345")).status,
      403,
    );
    await call("preparation/students/student/supplement", "teacher", "POST", {
      until: new Date(Date.now() + 60000).toISOString(),
    });
    assert.equal(
      (await remove("student", "second-clue-image-12345")).status,
      200,
    );
    await call("preparation/settings", "teacher", "POST", {
      enabled: true,
      instructions: "隔离资料删除测试，不连接生产。",
    });
    await unlink(join(diskPath("persist-fail"), "state.json"));
    await mkdir(join(diskPath("persist-fail"), "state.json"));
    assert.equal((await remove("persist-fail")).status, 500);
    assert.equal(
      (await call("preparation", "persist-fail")).body.assets.length,
      2,
      "failed persistence must not remove in-memory evidence",
    );
    await access(join(diskPath("persist-fail"), `${asset.id}.png`));
    assert.equal((await call("health")).body.requestsUsed, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await new Promise((resolve) => verifier.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
