from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from deps import CurrentUser, get_current_user
from exceptions import ApiException
from homework_service import HomeworkService
from models import get_db
from response import fail, success

router = APIRouter(prefix="/api/homework", tags=["作业批改"])


@router.get("/detail")
def homework_detail(
    homework_id: int,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        return success(data=HomeworkService(db).get_detail(homework_id, current_user))
    except ApiException as exc:
        return fail(exc.msg, exc.code)
