import { Request, Response } from 'express';
import { generateMCQFromFile } from '../services/gemini.service';
import { MCQItem, QuestionForBackend, OptionForBackend, BackendIntegrationResponse } from '../types/ai.types';


export const generateForBackend = async (req: Request, res: Response): Promise<any> => {
    try {
        // 1. Validate file upload
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Vui lòng upload một file tài liệu hoặc hình ảnh.',
                data: null
            });
        }

        // 2. Lấy metadata từ request body (optional fields từ Backend)
        const documentId = req.body.documentId ? parseInt(req.body.documentId) : undefined;
        const quizTitle = req.body.quizTitle || `Quiz từ ${req.file.originalname}`;
        const numberOfQuestions = req.body.numberOfQuestions ? parseInt(req.body.numberOfQuestions) : 5;

        const filePath = req.file.path;
        const mimeType = req.file.mimetype;

        console.log(`[AI → Backend] Đang xử lý file: ${req.file.originalname}`);
        console.log(`[AI → Backend] DocumentId: ${documentId || 'N/A'}, Số câu hỏi: ${numberOfQuestions}`);

        // 3. Gọi Gemini Service để generate MCQ
        const rawMCQData: MCQItem[] = await generateMCQFromFile(filePath, mimeType, numberOfQuestions);

        // 4. Chuẩn hóa: map từ Gemini raw output → format khớp bảng Questions + Options
        const questionsForBackend: QuestionForBackend[] = rawMCQData.map((item) => {
            // Chuyển đổi options array thành cấu trúc Options table
            // Với is_correct = true cho đáp án đúng
            const options: OptionForBackend[] = item.options.map((optText) => ({
                optionText: optText,
                isCorrect: optText === item.correctAnswer
            }));

            return {
                questionText: item.question,
                questionType: 'MultipleChoice',
                options: options
            };
        });

        // 5. Trả response khớp với AIGenerateQuizRequest DTO của Backend
        const response: BackendIntegrationResponse = {
            success: true,
            message: `Tạo thành công ${questionsForBackend.length} câu hỏi MCQ!`,
            data: {
                documentId,
                quizTitle,
                questions: questionsForBackend
            },
            metadata: {
                generatedAt: new Date().toISOString(),
                questionCount: questionsForBackend.length,
                model: 'gemini-2.0-flash-lite'
            }
        };

        console.log(`[AI → Backend] Đã tạo ${questionsForBackend.length} câu hỏi thành công!`);
        return res.status(200).json(response);

    } catch (error: any) {
        console.error('[AI → Backend] Lỗi:', error.message);
        return res.status(500).json({
            success: false,
            message: error.message || 'Đã xảy ra lỗi trong quá trình tạo câu hỏi bằng AI.',
            data: null
        });
    }
};

/**
 * GET /api/v1/ai/health
 * 
 * Endpoint để Backend kiểm tra AI Service có đang hoạt động không
 */
export const healthCheck = async (req: Request, res: Response): Promise<any> => {
    return res.status(200).json({
        success: true,
        message: 'Mascoteach AI Service đang hoạt động!',
        data: {
            service: 'mascoteach-ai-service',
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            geminiApiKey: process.env.GEMINI_API_KEY ? 'configured' : 'missing'
        }
    });
};
