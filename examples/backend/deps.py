from dataclasses import dataclass

import jwt
from fastapi import Header

from exceptions import ApiException

JWT_SECRET = "change-me"
ROLE_USER = 1


@dataclass
class CurrentUser:
    id: int
    username: str
    role: int


def get_current_user(authorization: str | None = Header(default=None)) -> CurrentUser:
    """JWT 鉴权，不查库（token 已含 user_id / username / role）。"""
    if not authorization or not authorization.startswith("Bearer "):
        raise ApiException("未授权，请先登录", 401)

    token = authorization.removeprefix("Bearer ").strip()
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except Exception:
        raise ApiException("令牌无效或已过期", 401) from None

    return CurrentUser(
        id=int(payload["sub"]),
        username=str(payload.get("username") or ""),
        role=int(payload.get("role", ROLE_USER)),
    )
