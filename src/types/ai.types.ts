export interface MCQItem {
    question: string;
    options: string[];
    correctAnswer: string;
    difficulty: 'Dễ' | 'Trung bình' | 'Khó';
    explanation: string;
}

/**
 * Cấu trúc Option chuẩn hóa - khớp với bảng Options trong DB
 * Map sang AIOptionItem trong Backend DTO
 */
export interface OptionForBackend {
    optionText: string;
    isCorrect: boolean;
}

/**
 * Cấu trúc Question chuẩn hóa - khớp với bảng Questions trong DB
 * Map sang AIQuestionItem trong Backend DTO
 */
export interface QuestionForBackend {
    questionText: string;
    questionType: string;   // 'MultipleChoice' - khớp cột question_type
    options: OptionForBackend[];
}

/**
 * Response chuẩn từ AI Service trả về cho Backend
 * Backend sẽ dùng để gọi QuizService.CreateFromAIAsync()
 * Khớp với AIGenerateQuizRequest trong Backend DTO
 */
export interface BackendIntegrationResponse {
    success: boolean;
    message: string;
    data: {
        documentId?: number;
        quizTitle: string;
        questions: QuestionForBackend[];
    };
    metadata: {
        generatedAt: string;
        questionCount: number;
        model: string;
    };
}

/**
 * Response chuẩn chung của AI Service
 */
export interface AIServiceResponse<T = any> {
    success: boolean;
    message: string;
    data: T;
}
