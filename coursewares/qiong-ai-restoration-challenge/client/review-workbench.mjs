export const REVIEW_FILTERS = [
  { id: "SUBMITTED", label: "待审核" },
  { id: "APPROVED", label: "已通过" },
  { id: "RETURNED", label: "待补充" },
  { id: "DRAFT", label: "未提交" },
  { id: "ALL", label: "全部" },
];

export const REVIEW_REASONS = [
  "图片不清楚，请换一张清晰的图片。",
  "缺少来源，请补充网页链接或书名页码。",
  "与本次修复部位无关，请更换相关线索。",
  "请补充你从图片中观察到的具体特征。",
];

export function reviewCounts(students = []) {
  const counts = {
    SUBMITTED: 0,
    APPROVED: 0,
    RETURNED: 0,
    DRAFT: 0,
    ALL: students.length,
  };
  for (const student of students) {
    const status = student.preparation?.status || "DRAFT";
    if (status !== "ALL" && status in counts) counts[status]++;
  }
  return counts;
}

export function reviewRoster(students = [], filter = "SUBMITTED", search = "") {
  const query = search.trim().toLocaleLowerCase();
  return students.filter(
    (student) =>
      (filter === "ALL" ||
        (student.preparation?.status || "DRAFT") === filter) &&
      (!query ||
        String(student.name || "")
          .toLocaleLowerCase()
          .includes(query)),
  );
}

export function nextPendingStudent(students, currentId) {
  const start = students.findIndex((student) => student.id === currentId);
  const ordered = [
    ...students.slice(start + 1),
    ...students.slice(0, start + 1),
  ];
  return (
    ordered.find(
      (student) =>
        student.id !== currentId && student.preparation?.status === "SUBMITTED",
    ) || null
  );
}

export function reviewPayload(studentId, detail, decision, feedback = "") {
  if (
    !studentId ||
    detail?.studentId !== studentId ||
    detail.preparation?.status !== "SUBMITTED"
  ) {
    throw new Error("请先读取当前学生的待审核资料");
  }
  const { revision, evidenceDigest } = detail.preparation;
  if (!Number.isInteger(revision) || revision < 0 || !evidenceDigest)
    throw new Error("资料版本尚未读全，请重新读取");
  if (!["APPROVED", "RETURNED"].includes(decision))
    throw new Error("请选择通过或退回");
  const text = feedback.trim();
  if (text.length > 1200) throw new Error("反馈不能超过1200字");
  if (decision === "RETURNED" && text.length < 4)
    throw new Error("请选择或填写具体补充要求");
  return { decision, revision, evidenceDigest, feedback: text };
}

// The selection is frozen before the request; callers advance only on confirmed success.
export async function submitReview(
  request,
  studentId,
  detail,
  decision,
  feedback,
) {
  const payload = reviewPayload(studentId, detail, decision, feedback);
  const result = await request(
    `preparation/students/${encodeURIComponent(studentId)}/review`,
    "POST",
    payload,
  );
  if (result?.preparation?.status !== decision)
    throw new Error("尚未确认审核成功，请重新读取当前学生资料");
  return result;
}
