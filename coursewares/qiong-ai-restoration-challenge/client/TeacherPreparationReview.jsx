import React, { useEffect, useRef, useState } from "react";
import {
  ArrowClockwise,
  ArrowRight,
  Check,
  Clock,
  GearSix,
  MagnifyingGlass,
  DotsThree,
  X,
  ArrowUUpLeft,
} from "@phosphor-icons/react";
import { api, returnToPortal } from "./platform";
import PreparationPhoto from "./PreparationPhoto";
import SourceReference from "./SourceReference";
import {
  preparationEvidence,
  clueLabel,
} from "../shared/preparation-evidence.mjs";
import {
  beijingInput,
  beijingTimestamp,
  displayBeijing,
  preparationAccess,
} from "../shared/preparation-schedule.mjs";
import {
  REVIEW_FILTERS,
  REVIEW_REASONS,
  reviewCounts,
  reviewRoster,
  nextPendingStudent,
  submitReview,
} from "./review-workbench.mjs";
import "./teacher-review.css";

const labels = {
  SUBMITTED: "待审核",
  APPROVED: "已通过",
  RETURNED: "待补充",
  DRAFT: "未提交",
};
const windowLabels = {
  OPEN: "资料收集中",
  CLOSED: "已截止上传",
  PAUSED: "常规上传已关闭",
  NOT_STARTED: "尚未开始收集",
  INVALID: "准备时间需要检查",
};

function ReviewDialog({ title, children, onClose, busy, error }) {
  const panel = useRef(null);
  useEffect(() => {
    const previous = document.activeElement,
      overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector("button")?.focus();
    const keydown = (event) => {
      if (document.querySelector(".image-viewer")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (!busy) onClose();
      }
      if (event.key !== "Tab") return;
      const controls = [
        ...panel.current.querySelectorAll(
          "button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], summary",
        ),
      ].filter((node) => node.getClientRects().length);
      const first = controls[0],
        last = controls.at(-1);
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
  }, [busy]);
  return (
    <div
      className="review-dialog-shade"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        ref={panel}
        className="review-dialog modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <h2>{title}</h2>
          <button
            type="button"
            className="review-icon"
            aria-label="关闭面板"
            title="关闭面板"
            disabled={busy}
            onClick={onClose}
          >
            <X />
          </button>
        </header>
        {error && (
          <p role="alert" className="review-message error">
            {error}
          </p>
        )}
        {children}
      </section>
    </div>
  );
}

export default function TeacherPreparationReview({
  data,
  onReload,
  onBusy,
  now = Date.now(),
}) {
  const [filter, setFilter] = useState("SUBMITTED"),
    [search, setSearch] = useState("");
  const [mobileSearch, setMobileSearch] = useState(false);
  const [selectedId, setSelectedId] = useState(() => typeof location === "undefined" ? "" : new URLSearchParams(location.search).get("studentId") || ""),
    [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false),
    [working, setWorking] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState(""),
    [feedback, setFeedback] = useState("");
  const [settings, setSettings] = useState({
    instructions: "",
    opensAt: "",
    closesAt: "",
  });
  const [supplementUntil, setSupplementUntil] = useState(""),
    [photos, setPhotos] = useState({});
  const sequence = useRef(0),
    lock = useRef(false),
    selection = useRef("");
  const students = data.students || [],
    counts = reviewCounts(students),
    roster = reviewRoster(students, filter, search);
  const selected =
    roster.find((student) => student.id === selectedId) || roster[0] || null;
  const activeId = selected?.id || "";
  selection.current = activeId;
  const current = !loading && detail?.studentId === activeId ? detail : null;
  const evidence = preparationEvidence(current?.assets);
  const reviewable = current?.preparation.status === "SUBMITTED";
  const currentStatus =
    current?.preparation.status || selected?.preparation?.status || "DRAFT";
  const picturesReady =
    evidence.clues.length > 0 &&
    evidence.clues.every((asset) => photos[asset.id] === "loaded");
  const canReview = reviewable && picturesReady && !working;
  const canReturn = reviewable && !working;
  const access = preparationAccess(data.settings, {}, now);
  const version = `${selected?.preparation?.revision}:${selected?.preparation?.status}:${selected?.preparation?.evidenceDigest}`;

  async function loadStudent(studentId) {
    const ticket = ++sequence.current;
    setDetail(null);
    setPhotos({});
    setLoading(Boolean(studentId));
    setError("");
    setFeedback("");
    if (!studentId) return;
    try {
      const result = await api(
        `preparation/students/${encodeURIComponent(studentId)}`,
      );
      if (ticket !== sequence.current || selection.current !== studentId)
        return;
      setDetail({ ...result, studentId, readId: ticket });
      setSupplementUntil(beijingInput(result.preparationExtension?.until));
    } catch (failure) {
      if (ticket === sequence.current)
        setError(failure.message || "资料读取失败，请重试");
    } finally {
      if (ticket === sequence.current) setLoading(false);
    }
  }
  useEffect(() => {
    void loadStudent(activeId);
    return () => {
      sequence.current++;
    };
  }, [activeId, version]);

  async function operate(action) {
    if (lock.current) return;
    lock.current = true;
    setWorking(true);
    onBusy?.(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (failure) {
      setError(failure.message || "操作未完成，请重试");
    } finally {
      lock.current = false;
      setWorking(false);
      onBusy?.(false);
    }
  }

  async function refresh() {
    await operate(async () => {
      await onReload();
      await loadStudent(activeId);
      setNotice("提交情况已刷新。");
    });
  }

  async function review(decision) {
    if (decision === "APPROVED" ? !canReview : !canReturn) return;
    const frozen = current,
      student = selected;
    await operate(async () => {
      try {
        const result = await submitReview(
          api,
          student.id,
          frozen,
          decision,
          decision === "APPROVED" ? "" : feedback,
        );
        setDetail({ ...frozen, ...result });
        setDialog("");
        setFeedback("");
      } catch (failure) {
        // A lost response or changed revision must never advance to another student.
        await loadStudent(student.id);
        throw failure;
      }
      let latest;
      try {
        latest = await onReload();
      } catch {
        setNotice(
          `${student.name}的资料已${decision === "APPROVED" ? "通过" : "退回"}，名单暂未刷新，请点击刷新；不会重复提交审核。`,
        );
        return;
      }
      const next = nextPendingStudent(latest.students || [], student.id);
      setFilter("SUBMITTED");
      setSearch("");
      setSelectedId(next?.id || "");
      setNotice(
        `${student.name}的资料已${decision === "APPROVED" ? "通过" : "退回补充"}。${next ? `正在查看${next.name}。` : "当前待审核资料已处理完。"}`,
      );
    });
  }

  function changeFilter(next) {
    if (working) return;
    setFilter(next);
    setSearch("");
    setSelectedId("");
    setDialog("");
    setNotice("");
  }
  function openSettings() {
    setSettings({
      instructions:
        data.settings.workflowVersion === 2
          ? data.settings.instructions
          : data.defaultInstructions,
      opensAt: beijingInput(data.settings.opensAt),
      closesAt: beijingInput(data.settings.closesAt),
    });
    setDialog("settings");
  }
  function evidenceCard(asset, historical = false) {
    return (
      <article
        className="review-evidence"
        key={`${activeId}:${current.readId}:${asset.id}`}
      >
        <PreparationPhoto
          asset={asset}
          studentId={activeId}
          onState={
            historical
              ? undefined
              : (id, state) => {
                  if (selection.current === activeId)
                    setPhotos((previous) => ({ ...previous, [id]: state }));
                }
          }
        />
        <div>
          <h3>{clueLabel(asset, current.assets)}</h3>
          <dl>
            <div>
              <dt>图片来源</dt>
              <dd>{asset.source || "未填写"}</dd>
            </div>
            <div>
              <dt>学生的发现</dt>
              <dd>{asset.feature || "未填写"}</dd>
            </div>
          </dl>
          <SourceReference asset={asset} />
        </div>
      </article>
    );
  }

  return (
    <div className="teacher-review-workspace">
      <section className="review-toolbar" aria-label="审核安排">
        <div>
          <span className={`review-dot ${access.open ? "open" : ""}`} />
          <strong>{windowLabels[access.status]}</strong>
          <span>
            {data.settings.closesAt
              ? `截止 ${displayBeijing(data.settings.closesAt)}`
              : "由老师手动关闭"}{" "}
            · 北京时间
          </span>
        </div>
        <div>
          <button type="button" disabled={working} onClick={openSettings}>
            <GearSix />
            准备设置
          </button>
          <button
            type="button"
            className="review-icon"
            title="刷新提交情况"
            aria-label="刷新提交情况"
            disabled={working}
            onClick={refresh}
          >
            <ArrowClockwise />
          </button>
        </div>
      </section>
      {error && (
        <div role="alert" className="review-message error">
          <span>{error}</span>
          <button disabled={working} onClick={() => void loadStudent(activeId)}>
            <ArrowClockwise />
            重新读取当前资料
          </button>
        </div>
      )}
      {notice && (
        <p role="status" className="review-message success">
          {notice}
        </p>
      )}
      <div className="review-tabs" role="group" aria-label="资料审核状态">
        {REVIEW_FILTERS.map((item) => (
          <button
            key={item.id}
            disabled={working}
            aria-pressed={filter === item.id}
            onClick={() => changeFilter(item.id)}
          >
            {item.label}
            <span>{counts[item.id]}</span>
          </button>
        ))}
      </div>
      <div className="review-layout">
        <aside className="review-roster" aria-label="学生名单">
          <header>
            <h2>学生名单</h2>
            <div>
              <span>{roster.length}人</span>
              <button
                type="button"
                className="review-icon review-mobile-search-toggle"
                title="搜索学生"
                aria-label="搜索学生"
                aria-expanded={mobileSearch}
                disabled={working}
                onClick={() => setMobileSearch((value) => !value)}
              >
                <MagnifyingGlass />
              </button>
            </div>
          </header>
          <label
            className={`review-search ${mobileSearch ? "mobile-open" : ""}`}
          >
            <MagnifyingGlass />
            <input
              aria-label="搜索学生姓名"
              placeholder="搜索学生姓名"
              value={search}
              disabled={working}
              onChange={(event) => {
                setSearch(event.target.value);
                setSelectedId("");
              }}
            />
          </label>
          <select
            className="review-mobile-roster"
            aria-label="选择学生"
            disabled={working || !roster.length}
            value={activeId}
            onChange={(event) => {
              setSelectedId(event.target.value);
              setDialog("");
              setNotice("");
            }}
          >
            {!roster.length && <option value="">没有匹配的学生</option>}
            {roster.map((student) => (
              <option key={student.id} value={student.id}>
                {student.name} · {student.assetCount || 0}张线索 ·{" "}
                {labels[student.preparation?.status || "DRAFT"]}
              </option>
            ))}
          </select>
          <div className="review-roster-list">
            {roster.map((student) => (
              <button
                type="button"
                key={student.id}
                disabled={working}
                aria-current={student.id === activeId ? "true" : undefined}
                onClick={() => {
                  setSelectedId(student.id);
                  setDialog("");
                  setNotice("");
                }}
              >
                <span>
                  <strong>{student.name}</strong>
                  <small>
                    {student.assetCount || 0}张线索
                    {student.preparationExtension ? " · 可补交" : ""}
                  </small>
                </span>
                <span
                  className={`review-status ${student.preparation?.status || "DRAFT"}`}
                >
                  {labels[student.preparation?.status || "DRAFT"]}
                </span>
              </button>
            ))}
            {!roster.length && (
              <p className="review-empty-small">
                {search ? "没有找到这位学生" : "此分类暂无学生"}
              </p>
            )}
          </div>
        </aside>
        <section
          className="review-detail"
          aria-label="学生资料预览"
          aria-busy={loading}
        >
          {!selected ? (
            <div className="review-empty">
              <Check size={32} />
              <h2>
                {filter === "SUBMITTED" && !search
                  ? "当前没有待审核资料"
                  : "没有匹配的学生"}
              </h2>
              <p>
                {filter === "SUBMITTED"
                  ? "可以查看已通过、待补充或未提交的学生。"
                  : "切换分类或修改姓名搜索。"}
              </p>
            </div>
          ) : (
            <>
              <header className="review-detail-head">
                <div>
                  <h2>
                    {selected.name}
                    <span>的课外线索</span>
                  </h2>
                  <p>
                    {current
                      ? `第${current.preparation.revision}版 · 本次采用${evidence.clues.length}张`
                      : "正在读取当前版本"}
                  </p>
                </div>
                <div>
                  <span className={`review-status ${currentStatus}`}>
                    {labels[currentStatus]}
                  </span>
                  <button
                    type="button"
                    className="review-icon"
                    aria-label="补交与历史资料"
                    title="补交与历史资料"
                    disabled={!current || working}
                    onClick={() => setDialog("more")}
                  >
                    <DotsThree />
                  </button>
                </div>
              </header>
              {loading ? (
                <p className="review-loading" role="status">
                  正在读取{selected.name}的资料…
                </p>
              ) : current ? (
                <>
                  {current.preparation.status === "DRAFT" && (
                    <p className="review-inline-note">
                      学生尚未提交，目前只能查看，不能审核。
                    </p>
                  )}
                  {current.preparation.feedback && (
                    <blockquote className="review-feedback">
                      <strong>审核反馈</strong>
                      <p>{current.preparation.feedback}</p>
                    </blockquote>
                  )}
                  <div className="review-evidence-list">
                    {evidence.clues.map((asset) => evidenceCard(asset))}
                    {!evidence.clues.length && (
                      <p className="review-empty-small">
                        该学生还没有采用的线索图片。
                      </p>
                    )}
                  </div>
                  <div className="review-action-bar">
                    <div>
                      <strong>
                        {reviewable
                          ? "核对来源与可见特征后审核"
                          : labels[current.preparation.status]}
                      </strong>
                      <span>
                        {reviewable && !picturesReady
                          ? "图片尚未完整显示，暂不能通过；可退回补充。"
                          : "审核针对当前这一版资料。"}
                      </span>
                    </div>
                    <div>
                      <button
                        type="button"
                        disabled={!canReturn}
                        onClick={() => {
                          setFeedback("");
                          setDialog("return");
                        }}
                      >
                        <ArrowUUpLeft />
                        退回补充
                      </button>
                      <button
                        type="button"
                        className="primary"
                        disabled={!canReview}
                        onClick={() => review("APPROVED")}
                      >
                        <Check />
                        {working ? "正在处理…" : "通过并查看下一位"}
                        <ArrowRight />
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <p className="review-empty-small">
                  当前资料未读出，请重新读取后再审核。
                </p>
              )}
            </>
          )}
        </section>
      </div>
      {dialog === "settings" && (
        <ReviewDialog
          title="课外准备设置"
          busy={working}
          error={error}
          onClose={() => setDialog("")}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void operate(async () => {
                await api("preparation/settings", "POST", {
                  workflowVersion: 2,
                  enabled: true,
                  instructions: settings.instructions,
                  opensAt: beijingTimestamp(settings.opensAt),
                  closesAt: beijingTimestamp(settings.closesAt),
                });
                await onReload();
                setDialog("");
                setNotice(
                  "准备安排已保存。课堂开课、结课仍由教师平台单独控制。",
                );
              });
            }}
          >
            <h3>上传时间</h3>
            <p>
              留空表示立即开放、由老师手动关闭；保存后生效。时间均为北京时间。
            </p>
            <div className="review-date-fields">
              <label>
                准备开始时间
                <input
                  type="datetime-local"
                  value={settings.opensAt}
                  disabled={working}
                  onInput={(event) =>
                    setSettings((value) => ({
                      ...value,
                      opensAt: event.target.value,
                    }))
                  }
                  onChange={(event) =>
                    setSettings((value) => ({
                      ...value,
                      opensAt: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                准备截止时间
                <input
                  type="datetime-local"
                  value={settings.closesAt}
                  disabled={working}
                  onInput={(event) =>
                    setSettings((value) => ({
                      ...value,
                      closesAt: event.target.value,
                    }))
                  }
                  onChange={(event) =>
                    setSettings((value) => ({
                      ...value,
                      closesAt: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <label className="review-field">
              给本班的准备要求
              <textarea
                rows={4}
                value={settings.instructions}
                minLength={8}
                maxLength={3000}
                required
                disabled={working}
                onChange={(event) =>
                  setSettings((value) => ({
                    ...value,
                    instructions: event.target.value,
                  }))
                }
              />
            </label>
            <div className="review-dialog-actions">
              <button type="submit" className="primary" disabled={working}>
                保存并启用
              </button>
              <button
                type="button"
                disabled={working || !data.settings.enabled}
                onClick={() =>
                  void operate(async () => {
                    await api("preparation/settings", "POST", {
                      workflowVersion: 2,
                      enabled: false,
                      instructions:
                        data.settings.workflowVersion === 2
                          ? data.settings.instructions
                          : data.defaultInstructions,
                      opensAt: data.settings.opensAt || null,
                      closesAt: data.settings.closesAt || null,
                    });
                    await onReload();
                    setDialog("");
                    setNotice(
                      "常规上传已关闭；已提交资料仍可审核，个人补交通道不受影响。",
                    );
                  })
                }
              >
                关闭常规上传
              </button>
            </div>
            <section className="review-classroom-note">
              <h3>课堂安排</h3>
              <p>
                课堂
                {{ READY: "待开课", OPEN: "已开课", ENDED: "已结课" }[
                  data.context.assignment.teachingStatus
                ] || "状态以教师平台为准"}
                。准备截止不会自动开课或结课。
              </p>
              <button
                type="button"
                disabled={working}
                onClick={() => returnToPortal(true, working)}
              >
                <ArrowRight />
                返回教师平台设置课堂
              </button>
            </section>
          </form>
        </ReviewDialog>
      )}
      {dialog === "return" && current && (
        <ReviewDialog
          title={`退回${selected.name}的资料`}
          busy={working}
          error={error}
          onClose={() => setDialog("")}
        >
          <label className="review-field">
            常用退回原因
            <select
              value={REVIEW_REASONS.includes(feedback) ? feedback : ""}
              disabled={working}
              onChange={(event) => setFeedback(event.target.value)}
            >
              <option value="">请选择原因，也可以直接填写反馈</option>
              {REVIEW_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </select>
          </label>
          <label className="review-field">
            给学生的反馈
            <textarea
              rows={3}
              value={feedback}
              maxLength={1200}
              disabled={working}
              onChange={(event) => setFeedback(event.target.value)}
              placeholder="选择上方原因，或填写具体补充要求"
            />
          </label>
          <div className="review-dialog-actions">
            <button
              type="button"
              className="primary"
              disabled={!canReturn || feedback.trim().length < 4}
              onClick={() => review("RETURNED")}
            >
              退回并查看下一位
              <ArrowRight />
            </button>
            <button disabled={working} onClick={() => setDialog("")}>
              取消
            </button>
          </div>
        </ReviewDialog>
      )}
      {dialog === "more" && current && (
        <ReviewDialog
          title={`${selected.name} · 补交与历史资料`}
          busy={working}
          error={error}
          onClose={() => setDialog("")}
        >
          <h3>个人补交</h3>
          <p>仅向这位学生开放，不改变全班时间；补交后仍须重新审核。</p>
          <label className="review-field">
            补交截止时间（北京时间）
            <input
              type="datetime-local"
              value={supplementUntil}
              disabled={working}
              onInput={(event) => setSupplementUntil(event.target.value)}
              onChange={(event) => setSupplementUntil(event.target.value)}
            />
          </label>
          <div className="review-dialog-actions">
            <button
              type="button"
              className="primary"
              disabled={
                working ||
                !supplementUntil ||
                !["DRAFT", "RETURNED"].includes(current.preparation.status)
              }
              onClick={() =>
                void operate(async () => {
                  const until = beijingTimestamp(supplementUntil);
                  await api(
                    `preparation/students/${encodeURIComponent(activeId)}/supplement`,
                    "POST",
                    { until },
                  );
                  await onReload();
                  await loadStudent(activeId);
                  setNotice("已为该学生开放补交，其他学生的时间不变。");
                })
              }
            >
              <Clock />
              开放个人补交
            </button>
            <button
              type="button"
              disabled={working || !current.preparationExtension}
              onClick={() =>
                void operate(async () => {
                  await api(
                    `preparation/students/${encodeURIComponent(activeId)}/supplement`,
                    "POST",
                    { until: null },
                  );
                  await onReload();
                  await loadStudent(activeId);
                  setNotice("已关闭该学生的补交通道。");
                })
              }
            >
              关闭个人补交
            </button>
          </div>
          {current.preparationExtension && (
            <p>
              补交截止：{displayBeijing(current.preparationExtension.until)}
            </p>
          )}
          <section className="review-history">
            <h3>本次资料记录</h3>
            <p>
              第{current.preparation.revision}版 ·{" "}
              {labels[current.preparation.status]}
            </p>
            {current.preparation.teacherName && (
              <p>审核教师：{current.preparation.teacherName}</p>
            )}
            {current.preparation.feedback && (
              <p>反馈：{current.preparation.feedback}</p>
            )}
            <details>
              <summary>已移出的图片（{evidence.excluded.length}张）</summary>
              {evidence.excluded.map((asset) => evidenceCard(asset, true))}
            </details>
            <details>
              <summary>历史教师备用资料（{evidence.legacy.length}张）</summary>
              <p>不计入学生本次课外收集成果。</p>
              {evidence.legacy.map((asset) => evidenceCard(asset, true))}
            </details>
          </section>
        </ReviewDialog>
      )}
    </div>
  );
}
