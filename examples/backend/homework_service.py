from sqlalchemy.orm import Session

from deps import CurrentUser
from exceptions import ApiException
from models import Homework, Question

ROLE_ADMIN = 2


class HomeworkService:
    def __init__(self, db: Session):
        self.db = db

    def get_for_user(self, homework_id: int, current_user: CurrentUser) -> Homework:
        homework = self.db.get(Homework, homework_id)
        if not homework:
            raise ApiException("作业不存在", 500)
        if current_user.role != ROLE_ADMIN and homework.user_id != current_user.id:
            raise ApiException("无权限访问该作业", 403)
        return homework

    def get_detail(self, homework_id: int, current_user: CurrentUser) -> dict:
        homework = self.get_for_user(homework_id, current_user)
        questions = (
            self.db.query(Question)
            .filter(Question.homework_id == homework_id)
            .order_by(Question.id)
            .all()
        )
        return {
            "id": homework.id,
            "user_id": homework.user_id,
            "original_img": homework.original_img,
            "status": homework.status,
            "total_questions": homework.total_questions,
            "correct_count": homework.correct_count,
            "half_correct_count": homework.half_correct_count,
            "wrong_count": homework.wrong_count,
            "questions": [
                {
                    "id": q.id,
                    "ocr_text": q.ocr_text,
                    "answer": q.answer,
                    "result": q.result,
                }
                for q in questions
            ],
        }
