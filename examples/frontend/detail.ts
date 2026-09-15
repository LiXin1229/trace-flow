import { showMsg } from "./ui";
import { apiRequest } from "./http";
import type { HomeworkDetail } from "./types";

declare global {
  var homeworkId: number | string;
}

let detailLoaded = false;

async function loadDetail(): Promise<void> {
  const res = await apiRequest<HomeworkDetail>(
    `/api/homework/detail?homework_id=${homeworkId}`,
  );

  if (res.code !== 200) {
    showMsg(document.getElementById("msg"), res.msg, "error");
    return;
  }

  detailLoaded = true;

  const statsText = document.getElementById("statsText");
  if (statsText) {
    const d = res.data;
    statsText.textContent =
      `共 ${d.total_questions} 题 · 对 ${d.correct_count} · 半对 ${d.half_correct_count} · 错 ${d.wrong_count}`;
  }
}

async function init(): Promise<void> {
  try {
    await loadDetail();
    if (detailLoaded) return;
  } catch (err) {
    showMsg(
      document.getElementById("msg"),
      err instanceof Error ? err.message : "加载失败，请确认后端已启动后刷新重试",
      "error",
    );
  }
}

init();
