import React, { useEffect, useRef, useState } from "react";
import {
  PaperPlaneTilt,
  SpinnerGap,
  CheckCircle,
  ArrowClockwise,
  Clock,
  UploadSimple,
  PencilSimple,
  MinusCircle,
  ArrowCounterClockwise,
  ArrowRight,
  X,
  Trash,
} from "@phosphor-icons/react";
import { api, returnToPortal } from "./platform";
import SourceReference from "./SourceReference";
import Photo from "./PreparationPhoto";
import TeacherPreparationReview from "./TeacherPreparationReview";
import {
  preparationAccess,
  displayBeijing,
} from "../shared/preparation-schedule.mjs";
import {
  preparationEvidence,
  clueLabel,
} from "../shared/preparation-evidence.mjs";
import { uploadPreparationImages, uploadSummary } from "./preparation-upload";
import "./student-preparation.css";
const windowNames = {
  OPEN: "准备期进行中",
  SUPPLEMENT: "个人补交通道已开放",
  NOT_STARTED: "尚未到准备开始时间",
  CLOSED: "课外准备已截止",
  PAUSED: "常规上传未开放",
  INVALID: "请联系老师检查准备时间",
};
const states = {
  DRAFT: "整理中",
  SUBMITTED: "等待老师审核",
  APPROVED: "审核通过 · 可制作课堂方案",
  RETURNED: "请按老师反馈补充",
};
export default function Preparation() {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState(null),
    [deleting, setDeleting] = useState(null),
    [notice, setNotice] = useState(""),
    [clock, setClock] = useState(Date.now()),
    [uploadFeedback, setUploadFeedback] = useState({}),
    [submitFeedback, setSubmitFeedback] = useState({
      state: "idle",
      message: "",
    });
  const input = useRef(),
    uploadRole = useRef(null),
    action = useRef(false),
    clockOffset = useRef(0),
    editingPanel = useRef(null);
  useEffect(() => {
    if (!editing && !deleting) return;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const controls = () =>
      [
        ...editingPanel.current.querySelectorAll(
          "button:not(:disabled), textarea:not(:disabled), a[href]",
        ),
      ].filter((node) => node.getClientRects().length);
    controls()[0]?.focus();
    const keydown = (event) => {
      if (document.querySelector(".image-viewer")) return;
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        setEditing(null);
        setDeleting(null);
      }
      if (event.key !== "Tab") return;
      const list = controls(),
        first = list[0],
        last = list.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", keydown);
      if (previous?.isConnected) previous.focus();
    };
  }, [Boolean(editing || deleting), busy]);
  async function refresh() {
    const next = await api("preparation");
    setData(next);
    clockOffset.current = (next.serverNow || Date.now()) - Date.now();
    setClock(Date.now());
    return next;
  }
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  async function run(fn) {
    if (action.current) return;
    action.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      action.current = false;
      setBusy(false);
    }
  }
  const studentEvidence = preparationEvidence(data?.assets);
  const teacher = data?.context.role === "TEACHER",
    prep = data?.preparation,
    access = preparationAccess(
      data?.settings,
      { preparation: prep, preparationExtension: data?.preparationExtension },
      clock + clockOffset.current,
    ),
    editable =
      Boolean(data) &&
      access.open &&
      ["DRAFT", "RETURNED"].includes(prep?.status);
  async function upload(files, assignedRole) {
    if (!files.length) return;
    await run(async () => {
      setUploadFeedback((old) => ({
        ...old,
        [assignedRole]: { state: "uploading", message: "正在读取图片…" },
      }));
      try {
        const result = await uploadPreparationImages(files, assignedRole, {
          post: (value) => api("assets", "POST", value),
          onProgress: (name) =>
            setUploadFeedback((old) => ({
              ...old,
              [assignedRole]: {
                state: "uploading",
                message: `正在处理：${name}`,
              },
            })),
          onAsset: (asset) =>
            setData((old) => ({
              ...old,
              assets: [...old.assets.filter((a) => a.id !== asset.id), asset],
            })),
        });
        setUploadFeedback((old) => ({
          ...old,
          [assignedRole]: {
            state: result.failed.length ? "error" : "done",
            message: uploadSummary(result, assignedRole),
            failed: result.failed,
          },
        }));
      } catch (e) {
        setUploadFeedback((old) => ({
          ...old,
          [assignedRole]: {
            state: "error",
            message: e.message || "上传未完成，请重试",
          },
        }));
      } finally {
        await refresh();
      }
    });
  }
  async function submitPreparation() {
    await run(async () => {
      setSubmitFeedback({
        state: "saving",
        message: "正在提交资料，请稍候，不用重复点击。",
      });
      function accepted(value) {
        setData((old) => ({
          ...old,
          preparation: value,
          preparationExtension: null,
        }));
        setSubmitFeedback({
          state: "done",
          message: "资料已提交成功，等待老师审核。",
        });
        setNotice("已提交，等待老师审核。");
      }
      try {
        const response = await api("preparation/submit", "POST", {
          workflowVersion: 2,
        });
        if (!["SUBMITTED", "APPROVED"].includes(response.preparation?.status))
          throw new Error("尚未确认提交成功，请重试");
        accepted(response.preparation);
        try {
          await refresh();
        } catch {
          setNotice(
            "资料已提交成功，列表暂未刷新；可以稍后点击“刷新审核状态”。",
          );
        }
      } catch (e) {
        const latest = await refresh().catch(() => null);
        if (["SUBMITTED", "APPROVED"].includes(latest?.preparation?.status))
          accepted(latest.preparation);
        else {
          setSubmitFeedback({
            state: "error",
            message: e.message || "提交未完成，请重试",
          });
          setError(e.message || "提交未完成，请重试");
        }
      }
    });
  }
  const submitDone = ["SUBMITTED", "APPROVED"].includes(prep?.status),
    submitSaving = submitFeedback.state === "saving",
    submitError = !submitDone && submitFeedback.state === "error";
  const SubmitIcon = submitSaving
    ? SpinnerGap
    : submitDone
      ? CheckCircle
      : submitError
        ? ArrowClockwise
        : !editable
          ? Clock
          : PaperPlaneTilt;
  const submitLabel = submitSaving
    ? "正在提交…"
    : prep?.status === "APPROVED"
      ? "资料已审核通过"
      : submitDone
        ? "已提交，等待老师审核"
        : submitError
          ? "提交未完成，点击重试"
          : prep?.status === "RETURNED"
            ? "补充完成，重新提交审核"
            : "提交资料，等待老师审核";
  const submitMessage = submitSaving
    ? submitFeedback.message
    : prep?.status === "APPROVED"
      ? "资料已审核通过，平台开放课堂后即可制作方案。"
      : submitDone
        ? "提交成功！资料已交给老师，请等待审核。"
        : submitError
          ? submitFeedback.message
          : !access.open
            ? "当前不在提交时间内；如需补交，请联系老师。"
            : "点击按钮将资料交给老师审核，提交前请先保存各张资料卡。";
  function chooseUpload(role) {
    uploadRole.current = role;
    input.current.accept = ".png,.jpg,.jpeg,.webp,.zip";
    input.current.click();
  }
  function evidenceCard(asset) {
    return (
      <article key={asset.id} className="prep-evidence">
        <Photo asset={asset} />
        <div className="student-clue-body">
          <h3>{clueLabel(asset, data.assets)}</h3>
          <div className="student-clue-source">
            <SourceReference asset={asset} />
          </div>
          <dl className="student-clue-notes">
            <div>
              <dt>我的发现</dt>
              <dd>{asset.feature || "尚未填写"}</dd>
            </div>
          </dl>
          <div className="button-row">
            <button
              disabled={busy || !editable}
              onClick={() => setEditing({ ...asset })}
            >
              <PencilSimple aria-hidden="true" />
              填写线索卡
            </button>
            <button
              disabled={busy || !editable}
              onClick={() =>
                run(async () => {
                  await api(`assets/${asset.id}`, "PATCH", {
                    role: asset.role === "excluded" ? "clue" : "excluded",
                  });
                  await refresh();
                })
              }
            >
              {asset.role === "excluded" ? (
                <ArrowCounterClockwise aria-hidden="true" />
              ) : (
                <MinusCircle aria-hidden="true" />
              )}
              {asset.role === "excluded" ? "重新采用" : "这次不用"}
            </button>
            <button
              type="button"
              className="student-clue-delete"
              aria-label={`删除${clueLabel(asset, data.assets)}`}
              title={
                editable
                  ? `删除${clueLabel(asset, data.assets)}`
                  : "修改并重新提交后才可删除"
              }
              disabled={busy || !editable}
              onClick={() => {
                setError("");
                setDeleting(asset);
              }}
            >
              <Trash aria-hidden="true" />
            </button>
          </div>
        </div>
      </article>
    );
  }
  return (
    <div
      className={`preparation-app${teacher ? " teacher-review-app" : data ? " student-preparation-app" : ""}`}
    >
      <header className="app-header">
        <div>
          <span className="eyebrow">邛窑AI修复挑战</span>
          <h1>
            {!data ? "课外资料准备" : teacher ? "课外资料审核" : "我的课外线索"}
          </h1>
          <p>
            {data?.context.assignment.title} · {data?.context.actor.name}
          </p>
        </div>
        <button disabled={busy} onClick={() => returnToPortal(true, busy)}>
          返回{!data ? "" : teacher ? "教师" : "学生"}平台
        </button>
      </header>
      <main className="preparation-main">
        {error && (
          <div role="alert" className="error-banner">
            {error}
            <button disabled={busy} onClick={() => run(refresh)}>
              重新读取
            </button>
          </div>
        )}
        {notice && (
          <p role="status" className="notice">
            {notice}
          </p>
        )}
        {!data ? (
          <p>正在读取本次任务…</p>
        ) : (
          <>
            {teacher ? (
              <TeacherPreparationReview
                data={data}
                onReload={refresh}
                onBusy={setBusy}
                now={clock + clockOffset.current}
              />
            ) : (
              <>
                <section className="student-prep-status" aria-label="准备状态">
                  <div>
                    <span className="student-module-label">准备状态</span>
                    <h2>{states[prep.status]}</h2>
                  </div>
                  <button
                    className="student-icon"
                    title="刷新审核状态"
                    aria-label="刷新审核状态"
                    disabled={busy}
                    onClick={() => run(refresh)}
                  >
                    <ArrowClockwise />
                  </button>
                </section>
                <ol className="student-prep-steps" aria-label="课外准备进度">
                  {[
                    ["整理线索", ["DRAFT", "RETURNED"].includes(prep.status)],
                    ["老师审核", prep.status === "SUBMITTED"],
                    ["课堂创作", prep.status === "APPROVED"],
                  ].map(([label, current], index) => (
                    <li key={label} aria-current={current ? "step" : undefined}>
                      <span>{index + 1}</span>
                      {label}
                    </li>
                  ))}
                </ol>
                <div className="student-prep-layout">
                  <section
                    className="student-prep-library"
                    aria-label="我的线索"
                  >
                    <header className="student-library-heading">
                      <div>
                        <h2>
                          我的线索{" "}
                          <span>{studentEvidence.counts.active}张</span>
                        </h2>
                        <p>
                          {studentEvidence.counts.active
                            ? "已保存到本次任务"
                            : "尚未上传资料"}
                        </p>
                      </div>
                      <button
                        className="primary"
                        disabled={busy || !editable}
                        onClick={() => chooseUpload("clue")}
                      >
                        <UploadSimple aria-hidden="true" />
                        {uploadFeedback.clue?.state === "uploading"
                          ? "正在上传…"
                          : "上传我的线索"}
                      </button>
                    </header>
                    <p className="student-library-note">
                      建议准备1—3张，每张记下来源和一句自己的发现。数量不评分。
                    </p>
                    {uploadFeedback.clue && (
                      <div
                        className={`prep-upload-feedback ${uploadFeedback.clue.state}`}
                        role={
                          uploadFeedback.clue.state === "error"
                            ? "alert"
                            : "status"
                        }
                      >
                        <p>{uploadFeedback.clue.message}</p>
                        {uploadFeedback.clue.failed?.length > 0 && (
                          <ul>
                            {uploadFeedback.clue.failed.map((failure, i) => (
                              <li key={i}>
                                {failure.name}：{failure.message}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                    <div className="prep-grid">
                      {studentEvidence.clues.map(evidenceCard)}
                    </div>
                    {!studentEvidence.clues.length && (
                      <p className="empty-references">
                        还没有线索。请从博物馆官网、书本或自己的实拍照片中寻找与器物有关的图片。
                      </p>
                    )}
                    <input
                      ref={input}
                      type="file"
                      accept=".png,.jpg,.jpeg,.webp,.zip"
                      multiple
                      hidden
                      onChange={(e) => {
                        const element = e.currentTarget,
                          files = Array.from(element.files || []);
                        upload(files, "clue").finally(() => {
                          element.value = "";
                        });
                      }}
                    />
                    {studentEvidence.excluded.length > 0 && (
                      <details className="prep-unused">
                        <summary>
                          这次未采用的图片（{studentEvidence.excluded.length}
                          张）
                        </summary>
                        <div className="prep-grid">
                          {studentEvidence.excluded.map(evidenceCard)}
                        </div>
                      </details>
                    )}
                  </section>
                  <aside
                    className="student-prep-sidebar"
                    aria-label="准备要求与提交"
                  >
                    <section className="student-prep-section">
                      <h2>准备要求</h2>
                      <p className="prep-instructions">
                        {data.settings.workflowVersion === 2
                          ? data.settings.instructions
                          : data.defaultInstructions}
                      </p>
                    </section>
                    <section className="student-prep-section">
                      <h2>时间安排</h2>
                      <strong className="student-window-status">
                        {windowNames[access.status]}
                      </strong>
                      <dl className="student-schedule">
                        <div>
                          <dt>开始</dt>
                          <dd>
                            {data.settings.opensAt
                              ? displayBeijing(data.settings.opensAt)
                              : "老师启用后即可上传"}
                          </dd>
                        </div>
                        <div>
                          <dt>截止</dt>
                          <dd>
                            {data.settings.closesAt
                              ? displayBeijing(data.settings.closesAt)
                              : "由老师手动关闭"}
                          </dd>
                        </div>
                        {access.status === "SUPPLEMENT" && (
                          <div>
                            <dt>个人补交</dt>
                            <dd>{displayBeijing(access.until)}</dd>
                          </div>
                        )}
                      </dl>
                      <small>北京时间</small>
                      {!access.open && (
                        <p>审核通过的线索仍可用于课堂；需要补交请联系老师。</p>
                      )}
                    </section>
                    {prep.feedback && (
                      <section className="student-prep-section">
                        <h2>老师反馈</h2>
                        <blockquote>{prep.feedback}</blockquote>
                      </section>
                    )}
                    <section className="student-prep-section prep-submit-area">
                      <h2>提交与审核</h2>
                      <button
                        className={`primary prep-submit ${submitSaving ? "saving" : submitDone ? "done" : submitError ? "retry" : ""}`}
                        disabled={busy || !editable || submitSaving}
                        aria-busy={submitSaving}
                        aria-describedby="prep-submit-status"
                        onClick={submitPreparation}
                      >
                        <SubmitIcon
                          className={submitSaving ? "prep-submit-spinner" : ""}
                          weight={submitDone ? "fill" : "bold"}
                          aria-hidden="true"
                        />
                        <span>{submitLabel}</span>
                      </button>
                      <div
                        id="prep-submit-status"
                        className={`prep-submit-status ${submitDone ? "done" : submitError ? "error" : ""}`}
                        role={submitError ? "alert" : "status"}
                        aria-live="polite"
                      >
                        {submitMessage}
                      </div>
                      {prep.status === "APPROVED" && (
                        <>
                          <p className="student-teacher-name">
                            审核教师：{prep.teacherName || "任课教师"}
                          </p>
                          <button
                            className="primary student-return"
                            disabled={busy}
                            onClick={() => returnToPortal(true, busy)}
                          >
                            返回学生平台
                            <ArrowRight />
                          </button>
                        </>
                      )}
                      {!["DRAFT", "RETURNED"].includes(prep.status) && (
                        <button
                          className="student-reopen"
                          disabled={busy || !access.open}
                          onClick={() => {
                            if (
                              confirm(
                                "修改线索后需要重新提交老师审核。继续吗？",
                              )
                            )
                              run(async () => {
                                await api("preparation/reopen", "POST", {});
                                await refresh();
                              });
                          }}
                        >
                          <PencilSimple />
                          修改并重新提交
                        </button>
                      )}
                    </section>
                    <details className="student-device-note">
                      <summary>设备与保存</summary>
                      <p>
                        在自己的手机或电脑上登录同一学生账号上传，课堂 iPad
                        会自动读取。课堂未提交的草稿保存在当前设备，换设备时可导出进度包。
                      </p>
                    </details>
                  </aside>
                </div>
              </>
            )}
          </>
        )}
      </main>
      {deleting && (
        <div className="modal-shade">
          <section
            ref={editingPanel}
            className="modal student-delete-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="student-delete-title"
            aria-describedby="student-delete-description"
          >
            <header className="student-edit-heading">
              <h2 id="student-delete-title">
                删除{clueLabel(deleting, data.assets)}？
              </h2>
              <button
                className="student-icon"
                aria-label="取消删除"
                title="取消删除"
                disabled={busy}
                onClick={() => setDeleting(null)}
              >
                <X />
              </button>
            </header>
            <p id="student-delete-description">
              删除后将移除这张图片及它的来源、发现，不能撤销。已用于方案或实验的线索不能删除，可选择“这次不用”。
            </p>
            {error && (
              <p role="alert" className="student-delete-error">
                {error}
              </p>
            )}
            <div className="button-row">
              <button disabled={busy} onClick={() => setDeleting(null)}>
                保留线索
              </button>
              <button
                className="student-delete-confirm"
                disabled={busy || !editable}
                onClick={() =>
                  run(async () => {
                    const response = await api(
                      `assets/${deleting.id}`,
                      "DELETE",
                    );
                    if (
                      !Array.isArray(response.assets) ||
                      response.assets.some((asset) => asset.id === deleting.id)
                    )
                      throw new Error(
                        "尚未确认删除成功，请重新读取资料后再检查",
                      );
                    setData((previous) => ({
                      ...previous,
                      assets: response.assets,
                    }));
                    setDeleting(null);
                    setNotice("线索已删除。");
                    try {
                      await refresh();
                    } catch {
                      setNotice(
                        "线索已删除，状态暂未刷新；请稍后刷新审核状态。",
                      );
                    }
                  })
                }
              >
                <Trash />
                {busy ? "正在删除…" : "确认删除"}
              </button>
            </div>
          </section>
        </div>
      )}
      {editing && (
        <div className="modal-shade">
          <section
            ref={editingPanel}
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="填写课外线索卡"
          >
            <header className="student-edit-heading">
              <h2>填写线索卡</h2>
              <button
                className="student-icon"
                aria-label="关闭线索卡"
                title="关闭线索卡"
                disabled={busy}
                onClick={() => setEditing(null)}
              >
                <X />
              </button>
            </header>
            <Photo asset={editing} />
            <p className="prep-card-hint">记下图片来源，写一句自己的发现。</p>
            {editable ? (
              <label className="form-label">
                图片从哪里来？
                <textarea
                  rows={2}
                  value={editing.source || ""}
                  maxLength={1200}
                  placeholder="例如：四川博物院实拍，或粘贴网页链接、书名页码"
                  onChange={(e) =>
                    setEditing({ ...editing, source: e.target.value })
                  }
                />
              </label>
            ) : (
              <SourceReference asset={editing} />
            )}
            <label className="form-label">
              我发现了什么？
              <textarea
                rows={2}
                value={editing.feature || ""}
                maxLength={800}
                placeholder="例如：罐口向外翻，肩部有四个小环。写一句就可以。"
                onChange={(e) =>
                  setEditing({ ...editing, feature: e.target.value })
                }
              />
            </label>
            <div className="button-row">
              <button
                className="primary"
                disabled={busy || !editable}
                onClick={() =>
                  run(async () => {
                    await api(`assets/${editing.id}`, "PATCH", editing);
                    setEditing(null);
                    await refresh();
                  })
                }
              >
                保存线索卡
              </button>
              <button disabled={busy} onClick={() => setEditing(null)}>
                取消
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
