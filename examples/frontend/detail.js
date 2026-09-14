import { showMsg } from "./ui.js";
import { apiRequest } from "./http.js";

let detailLoaded = false;

async function loadDetail() {
  const res = await apiRequest(`/api/homework/detail?homework_id=${homeworkId}`);
  if (res.code !== 200) {
    showMsg(document.getElementById("msg"), res.msg, "error");
    return;
  }

  detailLoaded = true;

  document.getElementById("statsText").textContent =
    `共 ${d.total_questions} 题 · 对 ${d.correct_count} · 半对 ${d.half_correct_count} · 错 ${d.wrong_count}`;
}

async function init() {
  try {
    await loadDetail();
    if (detailLoaded) return;
  } catch (err) {
    showMsg(
      document.getElementById("msg"),
      err.message || "加载失败，请确认后端已启动后刷新重试",
      "error",
    );
  }
}

init();