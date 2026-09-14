from typing import Any

from fastapi.responses import JSONResponse


def success(data: Any = None, msg: str = "success") -> JSONResponse:
    return JSONResponse(
        status_code=200,
        content={"code": 200, "msg": msg, "data": data if data is not None else {}},
    )


def fail(msg: str = "操作失败", code: int = 500, data: Any = None) -> JSONResponse:
    return JSONResponse(
        status_code=200,
        content={"code": code, "msg": msg, "data": data if data is not None else {}},
    )
