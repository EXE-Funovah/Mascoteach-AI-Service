import { Request, Response } from 'express';
import { generateMCQFromFile } from '../services/gemini.service';

export const generateMCQ = async (req: Request, res: Response): Promise<any> => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Vui lòng upload một file tài liệu hoặc hình ảnh.'
            });
        }

        const filePath = req.file.path;
        const mimeType = req.file.mimetype;

        console.log(`[AI Module] Đang phân tích file: ${req.file.originalname} (${req.file.mimetype})`);

        // Gọi service xử lý
        const mcqData = await generateMCQFromFile(filePath, mimeType);

        return res.status(200).json({
            success: true,
            message: 'Tạo bộ câu hỏi MCQ thành công!',
            data: mcqData
        });

    } catch (error: any) {
        console.error('[AI Module] Lỗi tại MCQ Controller:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Đã xảy ra lỗi hệ thống trong quá trình tạo câu hỏi.'
        });
    }
};