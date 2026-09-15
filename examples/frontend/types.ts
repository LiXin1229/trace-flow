/** 后端统一响应结构 */
export interface ApiResponse<T = unknown> {
  code: number;
  msg: string;
  data: T;
}

/** 作业题目 */
export interface Question {
  id: number;
  ocr_text: string | null;
  answer: string | null;
  result: number | null;
}

/** 作业详情 */
export interface HomeworkDetail {
  id: number;
  user_id: number;
  original_img: string;
  status: number;
  total_questions: number;
  correct_count: number;
  half_correct_count: number;
  wrong_count: number;
  questions: Question[];
}
