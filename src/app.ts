import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mcqRoutes from './routes/mcq.route';
import aiRoutes from './routes/ai.routes';

dotenv.config();

const app = express();
const port = process.env.PORT || 5001;

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req: Request, res: Response) => {
    res.status(200).json({ status: 'success', message: 'Mascoteach AI Module đang hoạt động rất tốt!' });
});

// Route cho MCQ (giữ nguyên backward compatibility)
app.use('/api/v1/mcq', mcqRoutes);

// Route cho AI Integration với Backend
app.use('/api/v1/ai', aiRoutes);

app.listen(port, () => {
    console.log(`========================================`);
    console.log(`AI Server đang chạy tại: http://localhost:${port}`);
    console.log(`API Key: ${process.env.GEMINI_API_KEY ? 'Đã thiết lập' : 'Chưa thiết lập'}`);
    console.log(`AI Endpoint: POST /api/v1/ai/generate-for-backend`);
    console.log(`Health Check: GET /api/v1/ai/health`);
    console.log(`========================================`);
});