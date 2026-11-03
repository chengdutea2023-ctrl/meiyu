// Local synthetic fixtures only. No production data, tokens, AI calls or database access.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createServer as createViteServer } from "vite";
import react from "@vitejs/plugin-react";
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const base = resolve(root, "coursewares/qiong-ai-restoration-challenge");
const picture = await readFile(
  resolve(base, "static/assets/case-damaged.png"),
).catch(() => readFile(resolve(base, "server/private/teacher-jar.png")));
const date = new Date().toISOString();
const context = {
  role: "TEACHER",
  actor: { name: "审核体验老师" },
  assignment: { title: "邛窑修复 · 审核体验班", teachingStatus: "OPEN" },
};
const rows = ["SUBMITTED", "SUBMITTED", "RETURNED", "DRAFT", "APPROVED"].map(
  (status, i) => ({
    id: `preview-${i}`,
    name: [
      "体验学生甲",
      "体验学生乙",
      "体验学生丙",
      "体验学生丁",
      "体验学生戊",
    ][i],
    assetCount: i === 3 ? 0 : i === 1 ? 3 : 1,
    preparation: {
      status,
      revision: 2,
      evidenceDigest: `fixture-evidence-${i}`,
      submittedAt: Date.now(),
      feedback: i === 2 ? "请补充图片来源和观察到的特征。" : "",
    },
  }),
);
const owners = new Map(
  rows.map((row) => [
    row.id,
    {
      assets: Array.from({ length: row.assetCount }, (_, i) => ({
        id: `image-${row.id}-${i}`,
        title: ["四系罐整体", "罐口与肩部", "釉色细节"][i],
        role: "clue",
        origin: "student",
        source: "教学体验图录 · 第12页（本地测试）",
        feature: [
          "器身饱满，肩部有系耳，口沿向外翻。",
          "罐口较宽，肩部的小环与腹部衔接。",
          "釉色深浅不均，可见自然流动的痕迹。",
        ][i],
      })),
      preparation: row.preparation,
    },
  ]),
);
let settings = {
  enabled: true,
  workflowVersion: 2,
  instructions: "寻找与本次修复器物有关的图片，注明来源和你观察到的特征。",
  opensAt: null,
  closesAt: null,
};
let scenario = {};
const server = createServer(async (req, res) => {
  res.setHeader("content-type", "application/json");
  try {
    const path = new URL(req.url, "http://localhost").pathname;
    let input = {};
    if (req.method !== "GET") {
      let text = "";
      for await (const part of req) text += part;
      input = text ? JSON.parse(text) : {};
    }
    let result;
    if (path === "/fixture/scenario" && req.method === "POST") {
      scenario = input;
      const owner = owners.get("preview-1");
      if (input.studentStatus)
        owner.preparation = {
          ...owner.preparation,
          status: input.studentStatus,
        };
      if (input.emptyStudent) owner.assets = [];
      if (input.closed !== undefined) settings.enabled = !input.closed;
      result = { ok: true };
    } else if (path === "/api/preparation") {
      const student = req.headers["x-preparation-token"] === "fixture-student";
      result = {
        context,
        students: rows,
        settings,
        serverNow: Date.now(),
        defaultInstructions: settings.instructions,
      };
      if (student)
        result = {
          ...result,
          ...owners.get("preview-1"),
          students: undefined,
          context: {
            ...context,
            role: "STUDENT",
            actor: { name: "体验学生乙" },
            student: { id: "preview-1" },
          },
        };
    } else if (
      req.headers["x-preparation-token"] === "fixture-student" &&
      path.startsWith("/api/files/")
    ) {
      if (scenario.imageFailure) {
        res.statusCode = 503;
        throw Error("图片暂不可用");
      }
      res.setHeader("content-type", "image/png");
      res.end(picture);
      return;
    } else if (
      (req.headers["x-preparation-token"] === "fixture-student" &&
        [
          "/api/assets",
          "/api/preparation/submit",
          "/api/preparation/reopen",
        ].includes(path)) ||
      (req.headers["x-preparation-token"] === "fixture-student" &&
        path.startsWith("/api/assets/"))
    ) {
      const owner = owners.get("preview-1");
      if (path === "/api/preparation/reopen")
        owner.preparation = {
          ...owner.preparation,
          status: "DRAFT",
          revision: owner.preparation.revision + 1,
        };
      else {
        if (
          !settings.enabled ||
          !["DRAFT", "RETURNED"].includes(owner.preparation.status)
        ) {
          res.statusCode = 403;
          throw Error("资料暂不能修改或提交");
        }
        if (path === "/api/preparation/submit") {
          const clues = owner.assets.filter((a) => a.role === "clue");
          if (!clues.length || clues.some((a) => !a.source || !a.feature)) {
            res.statusCode = 400;
            throw Error("请为每张采用的线索填写来源和一句自己的发现");
          }
          if (scenario.submitFailure) {
            res.statusCode = 503;
            throw Error("提交暂时失败，请重试");
          }
          owner.preparation = { ...owner.preparation, status: "SUBMITTED" };
        } else if (path === "/api/assets") {
          const asset = {
            ...input,
            dataUrl: undefined,
            id: `fixture-upload-${Date.now()}`,
            origin: "student",
          };
          owner.assets.push(asset);
          result = { asset, uploadOutcome: "created" };
        } else {
          const asset = owner.assets.find(
            (a) => a.id === path.split("/").at(-1),
          );
          if (!asset) {
            res.statusCode = 404;
            throw Error("资料不存在");
          }
          if (req.method === "DELETE") {
            if (scenario.deleteFailure) {
              res.statusCode = 400;
              throw Error(
                "这张线索已用于方案、实验或AI识别，需要保留供追溯；不再使用请选“这次不用”",
              );
            }
            owner.assets = owner.assets.filter((a) => a.id !== asset.id);
            result = { assets: owner.assets };
          } else {
            Object.assign(asset, input);
            result = { asset };
          }
        }
      }
      result ||= { preparation: owner.preparation };
    } else if (path === "/api/preparation/settings") {
      if (
        input.closesAt &&
        input.opensAt &&
        Date.parse(input.closesAt) <= Date.parse(input.opensAt)
      ) {
        res.statusCode = 400;
        throw Error("准备截止时间必须晚于开始时间");
      }
      settings = { ...settings, ...input };
      result = { settings };
    } else {
      const match = path.match(
        /^\/api\/preparation\/students\/([^/]+)(?:\/(files|review|supplement)(?:\/([^/]+))?)?$/,
      );
      if (!match || !owners.has(match[1])) {
        res.statusCode = 404;
        throw Error("隔离预览未实现此接口");
      }
      const owner = owners.get(match[1]);
      if (match[2] === "files") {
        if (scenario.imageFailure) {
          res.statusCode = 503;
          throw Error("图片暂不可用");
        }
        result = {
          dataUrl: `data:image/png;base64,${picture.toString("base64")}`,
        };
      } else if (match[2] === "review") {
        if (scenario.reviewConflict) {
          scenario.reviewConflict = false;
          owner.preparation.revision++;
          owner.preparation.evidenceDigest += "-new";
          res.statusCode = 409;
          throw Error("学生已更新资料，请重新读取后审核");
        }
        if (scenario.reviewFailure) {
          res.statusCode = 503;
          throw Error("审核保存暂时失败，请重试");
        }
        if (
          owner.preparation.status !== "SUBMITTED" ||
          input.revision !== owner.preparation.revision ||
          input.evidenceDigest !== owner.preparation.evidenceDigest
        ) {
          res.statusCode = 409;
          throw Error("学生已更新资料，请重新读取后审核");
        }
        if (input.decision === "RETURNED" && input.feedback.trim().length < 4) {
          res.statusCode = 400;
          throw Error("退回时请说明补充要求");
        }
        owner.preparation = {
          ...owner.preparation,
          status: input.decision,
          feedback: input.feedback,
          teacherName: "审核体验老师",
        };
        rows.find((row) => row.id === match[1]).preparation = owner.preparation;
        result = { preparation: owner.preparation };
      } else if (match[2] === "supplement") {
        owner.preparationExtension = input.until
          ? { until: input.until }
          : null;
        rows.find((row) => row.id === match[1]).preparationExtension =
          owner.preparationExtension;
        result = { preparationExtension: owner.preparationExtension };
      } else {
        await new Promise((resolve) =>
          setTimeout(resolve, match[1] === "preview-0" ? 240 : 25),
        );
        result = owner;
      }
    }
    res.end(JSON.stringify(result));
  } catch (error) {
    if (res.statusCode === 200) res.statusCode = 500;
    res.end(JSON.stringify({ message: error.message }));
  }
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(3391, "127.0.0.1", resolve);
});
const vite = await createViteServer({
  configFile: false,
  cacheDir: "/private/tmp/zhike-review-vite-cache",
  root: resolve(base, "client"),
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5181,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:3391" },
  },
});
await vite.listen();
console.log(
  `Isolated preparation preview: http://127.0.0.1:5181/?prepare=1&preparationToken=fixture (teacher) or fixture-student (student)`,
);
async function close() {
  await vite.close();
  server.close();
  process.exit(0);
}
process.on("SIGINT", close);
process.on("SIGTERM", close);
