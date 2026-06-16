import { Request, Response } from 'express';
import { generateMCQFromFile, OPENAI_QUIZ_MODEL } from '../services/openai.service';
import { downloadFromUrl } from '../services/download.service';
import { extractFromZipIfNeeded } from '../services/unzip.service';
import { convertForOpenAI } from '../services/file-converter.service';
import { MCQItem, QuestionForBackend, OptionForBackend, BackendIntegrationResponse } from '../types/ai.types';
import { getMascotLiveReadiness } from '../config/mascot-live.config';
import OpenAI from 'openai';


export const generateForBackend = async (req: Request, res: Response): Promise<any> => {
    try {
        // 1. Validate fileUrl (JSON body)
        const { fileUrl } = req.body;
        if (!fileUrl) {
            return res.status(400).json({
                success: false,
                message: 'Vui lòng cung cấp fileUrl (S3 URL của tài liệu).',
                data: null
            });
        }

        // 2. Download file từ S3 về temp
        console.log(`[AI → Backend] Đang download file từ URL: ${fileUrl}`);
        const downloaded = await downloadFromUrl(fileUrl);

        // 2.5. Extract zip nếu file tải về là archive, rồi convert nếu OpenAI không hỗ trợ native
        const unzipped = await extractFromZipIfNeeded(downloaded.filePath, downloaded.mimeType, downloaded.fileName);
        const { filePath: rawFilePath, mimeType: rawMimeType, fileName: originalName } = unzipped;

        const converted = await convertForOpenAI(rawFilePath, rawMimeType, originalName);
        const { filePath, mimeType } = converted;
        if (converted.wasConverted) {
            console.log(`[AI → Backend] Đã chuyển đổi file: ${rawMimeType} → ${mimeType}`);
        }

        // 3. Lấy metadata từ request body
        const documentId = req.body.documentId ? parseInt(req.body.documentId) : undefined;
        const quizTitle = req.body.quizTitle || `Quiz từ ${originalName}`;
        const numberOfQuestions = req.body.numberOfQuestions ? parseInt(req.body.numberOfQuestions) : 5;
        const difficultyDistribution = req.body.difficultyDistribution || undefined;
        const language = req.body.language || 'vi';

        console.log(`[AI → Backend] Đang xử lý file: ${originalName}`);
        console.log(`[AI → Backend] DocumentId: ${documentId || 'N/A'}, Số câu hỏi: ${numberOfQuestions}, Ngôn ngữ: ${language}`);
        if (difficultyDistribution) {
            console.log(`[AI → Backend] Phân bổ độ khó: Cấp 1=${difficultyDistribution[1]}%, Cấp 2=${difficultyDistribution[2]}%, Cấp 3=${difficultyDistribution[3]}%`);
        }

        // 4. Gọi OpenAI Service để generate MCQ
        const rawMCQData: MCQItem[] = await generateMCQFromFile(filePath, mimeType, {
            numberOfQuestions,
            difficultyDistribution,
            language,
        });

        // 4. Chuẩn hóa: map từ OpenAI raw output → format khớp bảng Questions + Options
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
                model: OPENAI_QUIZ_MODEL
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
 * POST /api/v1/ai/chat
 *
 * Lightweight text fallback for the mascot widget. The voice/live experience is
 * handled by /api/v1/mascot-live; this endpoint keeps the legacy text fallback
 * from returning 404 and gives the mascot a real AI response when audio is not
 * available.
 */
export const chat = async (req: Request, res: Response): Promise<any> => {
    try {
        const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
        const history = Array.isArray(req.body?.history) ? req.body.history : [];

        if (!message) {
            return res.status(400).json({
                success: false,
                message: 'Vui lòng cung cấp message.',
                data: null,
            });
        }

        if (!process.env.OPENAI_API_KEY) {
            return res.status(503).json({
                success: false,
                message: 'OPENAI_API_KEY chưa được cấu hình.',
                data: null,
            });
        }

        const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const safeHistory = history
            .slice(-8)
            .map((item: any) => ({
                role: item?.role === 'assistant' ? 'assistant' : 'user',
                content: String(item?.content || item?.message || '').slice(0, 1000),
            }))
            .filter((item: { content: string }) => item.content);

        const response = await client.responses.create({
            model: process.env.OPENAI_CHAT_MODEL || 'gpt-5.4-mini',
            input: [
                {
                    role: 'system',
                    content:
                        'Bạn là Sumadi, trợ lý học tập thân thiện của Mascoteach. Trả lời ngắn gọn bằng tiếng Việt, ưu tiên hướng dẫn giáo viên/học sinh thao tác trong nền tảng, tạo quiz, tổ chức live game và học hiệu quả.',
                },
                ...safeHistory,
                { role: 'user', content: message },
            ],
        });

        const reply = response.output_text?.trim() || 'Mình chưa có câu trả lời phù hợp. Bạn thử hỏi lại ngắn hơn nhé.';

        return res.status(200).json({
            success: true,
            message: 'Mascot chat response generated.',
            data: { reply },
            reply,
        });
    } catch (error: any) {
        console.error('[AI Chat] Lỗi:', error.message);
        return res.status(500).json({
            success: false,
            message: error.message || 'Đã xảy ra lỗi khi chat với AI.',
            data: null,
        });
    }
};

/**
 * GET /api/v1/ai/health
 *
 * Endpoint để Backend kiểm tra AI Service có đang hoạt động không
 */
export const healthCheck = async (req: Request, res: Response): Promise<any> => {
    const mascotLive = getMascotLiveReadiness();

    return res.status(200).json({
        success: true,
        message: 'Mascoteach AI Service đang hoạt động!',
        data: {
            service: 'mascoteach-ai-service',
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            openaiApiKey: process.env.OPENAI_API_KEY ? 'configured' : 'missing',
            mascotLive,
        }
    });
};
