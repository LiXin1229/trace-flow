export function showMsg(el, text, type) {
  el.textContent = text;
  el.className = `msg ${type}`;
}