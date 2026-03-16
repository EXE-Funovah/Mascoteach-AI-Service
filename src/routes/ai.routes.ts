import { Router } from 'express';
import { generateForBackend, healthCheck } from '../controllers/ai.controller';

const router = Router();

// Health check - Backend dùng để kiểm tra AI Service còn sống không
router.get('/health', healthCheck);

// Endpoint chính: Nhận fileUrl (S3) qua JSON → AI download & xử lý → trả JSON chuẩn hóa
// Request:  POST application/json { fileUrl, documentId?, quizTitle?, numberOfQuestions?, difficultyDistribution?, language? }
// Response: { success, data: { documentId, quizTitle, questions: [{ questionText, questionType, options: [{ optionText, isCorrect }] }] } }
router.post('/generate-for-backend', generateForBackend);

export default router;