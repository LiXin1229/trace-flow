const API_BASE = "";

export async function apiRequest(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!headers["Content-Type"] && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch {
    throw new Error(`无法连接后端服务，请确认已启动 ${API_BASE}`);
  }
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`服务器响应异常 (HTTP ${res.status})`);
  }

  return data;
}