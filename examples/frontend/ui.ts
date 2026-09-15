export type MsgType = "error" | "success" | "info" | "warning";

export function showMsg(
  el: HTMLElement | null,
  text: string,
  type: MsgType,
): void {
  if (el) {
    el.textContent = text;
    el.className = `msg ${type}`;
  }
}
