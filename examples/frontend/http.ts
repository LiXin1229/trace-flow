import type { ApiResponse } from "./types";

const API_BASE = "";

export async function apiRequest<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch {
    throw new Error(`无法连接后端服务，请确认已启动 ${API_BASE}`);
  }

  let data: ApiResponse<T>;
  try {
    data = (await res.json()) as ApiResponse<T>;
  } catch {
    throw new Error(`服务器响应异常 (HTTP ${res.status})`);
  }

  return data;
}
