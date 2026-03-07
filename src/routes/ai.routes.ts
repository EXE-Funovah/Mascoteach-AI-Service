import { Router } from 'express';
import { uploadMiddleware } from '../middlewares/upload.middleware';
import { generateForBackend, healthCheck } from '../controllers/ai.controller';

const router = Router();

// Health check - Backend dùng để kiểm tra AI Service còn sống không
router.get('/health', healthCheck);

// Endpoint chính: Backend gửi file → AI trả JSON chuẩn hóa
// Request: multipart/form-data với field "document" (file) + documentId, quizTitle, numberOfQuestions (optional)
// Response: { success, data: { documentId, quizTitle, questions: [{ questionText, questionType, options: [{ optionText, isCorrect }] }] } }
router.post('/generate-for-backend', uploadMiddleware.single('document'), generateForBackend);

export default router;