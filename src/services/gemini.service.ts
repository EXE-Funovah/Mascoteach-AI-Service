import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);

export const generateMCQFromFile = async (filePath: string, mimeType: string) => {
    try {
        // Đã cập nhật chính xác tên model bạn lấy từ Google AI Studio
        const modelName = "gemini-3.1-flash-lite-preview";
        const model = genAI.getGenerativeModel({ model: modelName });

        const fileContent = fs.readFileSync(filePath);
        const base64Data = fileContent.toString("base64");

        const filePart = {
            inlineData: {
                data: base64Data,
                mimeType: mimeType
            }
        };

        const prompt = `
            Bạn là một giáo sư chuyên xây dựng đề thi trắc nghiệm (Multiple Choice Questions - MCQ).
            Tôi cung cấp cho bạn một tài liệu đính kèm (có thể là văn bản, hình ảnh, biểu đồ, hoặc bản scan). 
            Hãy "đọc", "nhìn" và phân tích kỹ toàn bộ thông tin trong tài liệu đó, sau đó tạo ra 5 câu hỏi trắc nghiệm.
            
            Yêu cầu bắt buộc:
            - Nếu tài liệu là hình ảnh/biểu đồ, hãy trích xuất dữ liệu từ hình ảnh đó để đặt câu hỏi.
            - Phải có 4 đáp án (A, B, C, D) cho mỗi câu.
            - Phân bổ độ khó: Dễ, Trung bình, Khó.
            - TRẢ VỀ TRỰC TIẾP MỘT MẢNG JSON HỢP LỆ, KHÔNG BAO GỒM MARKDOWN.
            
            Cấu trúc JSON bắt buộc:
            [
              {
                "question": "Nội dung câu hỏi dựa trên tài liệu?",
                "options": ["Đáp án A", "Đáp án B", "Đáp án C", "Đáp án D"],
                "correctAnswer": "Đáp án đúng (phải khớp chính xác nội dung 1 trong 4 options trên)",
                "difficulty": "Dễ | Trung bình | Khó",
                "explanation": "Giải thích chi tiết tại sao đáp án này đúng dựa trên dữ liệu trong file."
              }
            ]
        `;

        const result = await model.generateContent([prompt, filePart]);
        let responseText = result.response.text();

        // Xử lý chuỗi JSON: Cắt bỏ các thẻ markdown (```json và ```) nếu AI vô tình sinh ra
        responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();

        return JSON.parse(responseText);

    } catch (error) {
        console.error("Lỗi tại Gemini Service:", error);
        throw new Error("Không thể xử lý file bằng Gemini API.");
    } finally {
        // Luôn luôn dọn dẹp file tạm
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }
};