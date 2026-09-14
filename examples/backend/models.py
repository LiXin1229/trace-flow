from sqlalchemy import Column, Integer, String, Text, create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker


class Base(DeclarativeBase):
    pass


class Homework(Base):
    __tablename__ = "homework"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=False, index=True)
    original_img = Column(String(255), nullable=False, default="")
    status = Column(Integer, default=1)
    total_questions = Column(Integer, default=0)
    correct_count = Column(Integer, default=0)
    half_correct_count = Column(Integer, default=0)
    wrong_count = Column(Integer, default=0)


class Question(Base):
    __tablename__ = "question"

    id = Column(Integer, primary_key=True, autoincrement=True)
    homework_id = Column(Integer, nullable=False, index=True)
    ocr_text = Column(Text)
    answer = Column(Text)
    result = Column(Integer)


# sqlite 免部署，换成真实库连接串即可
engine = create_engine("sqlite:///./homework.db")
SessionLocal = sessionmaker(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
