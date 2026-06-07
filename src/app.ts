import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mcqRoutes from './routes/mcq.route';
import aiRoutes from './routes/ai.routes';
import mascotLiveRoutes from './routes/mascot-live.routes';
import { getAgoraLiveReadiness } from './config/agora-live.config';

dotenv.config();

const app = express();
const port = process.env.PORT || 5001;

const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
    : ['*'];

app.use(cors({
    origin: allowedOrigins.includes('*') ? true : allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.get('/', (req: Request, res: Response) => {
    res.status(200).json({ status: 'success', message: 'Mascoteach AI Module đang hoạt động rất tốt!' });
});

// Route cho MCQ (giữ nguyên backward compatibility)
app.use('/api/v1/mcq', mcqRoutes);

// Route cho AI Integration với Backend
app.use('/api/v1/ai', aiRoutes);

// Route cho mascot live orchestration via Agora
app.use('/api/v1/mascot-live', mascotLiveRoutes);

app.listen(port, () => {
    const agoraLive = getAgoraLiveReadiness();

    console.log(`========================================`);
    console.log(`AI Server đang chạy tại: http://localhost:${port}`);
    console.log(`OpenAI API Key: ${process.env.OPENAI_API_KEY ? 'Đã thiết lập' : 'Chưa thiết lập'}`);
    console.log(`AI Endpoint: POST /api/v1/ai/generate-for-backend`);
    console.log(`Health Check: GET /api/v1/ai/health`);
    console.log(`Agora Native ConvoAI Health: GET /api/v1/mascot-live/health`);
    console.log(`Agora Native ConvoAI Session: POST /api/v1/mascot-live/session`);
    console.log(`Agora skip join on create: ${agoraLive.skipConvoAiJoinOnCreate ? 'yes (local RTC-only mode)' : 'no'}`);
    console.log(`Agora RTC ready: ${agoraLive.rtcReady ? 'yes' : `no (${agoraLive.missingRtcFields.join(', ') || 'unknown'})`}`);
    console.log(`Agora lifecycle ready: ${agoraLive.lifecycleApiReady ? 'yes' : `no (${agoraLive.missingLifecycleFields.join(', ') || 'unknown'})`}`);
    console.log(`Agora native ConvoAI ready: ${agoraLive.convoAiReady ? 'yes' : `no (${agoraLive.missingConvoAiFields.join(', ') || 'unknown'})`}`);
    console.log(`========================================`);
});
