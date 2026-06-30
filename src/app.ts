import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { IncomingMessage } from 'http';
import { Socket } from 'net';
import cors from 'cors';
import dotenv from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';
import mcqRoutes from './routes/mcq.route';
import aiRoutes from './routes/ai.routes';
import mascotLiveRoutes from './routes/mascot-live.routes';
import mascobotRoutes from './routes/mascobot.routes';
import { getMascotLiveReadiness } from './config/mascot-live.config';
import { mascobotLiveRelay } from './controllers/mascobot.controller';

dotenv.config();

const app = express();
const port = process.env.PORT || 5001;
const server = createServer(app);
const liveWss = new WebSocketServer({ noServer: true });

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

// Route cho mascot live orchestration via OpenAI Realtime
app.use('/api/v1/mascot-live', mascotLiveRoutes);

// Route cho physical Mascobot ESP32 gateway orchestration
app.use('/api/v1/mascobot', mascobotRoutes);

liveWss.on('connection', (socket: WebSocket, _request: IncomingMessage, peer: unknown) => {
    const connection = peer as { sessionId: string; deviceId: string; role: 'eye' | 'main' };
    const connectionId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    console.log(`[robot-live-ws] connected ${JSON.stringify({
        connectionId,
        sessionId: connection.sessionId,
        deviceId: connection.deviceId,
        role: connection.role,
    })}`);
    mascobotLiveRelay.connectPeer({
        connectionId,
        sessionId: connection.sessionId,
        deviceId: connection.deviceId,
        role: connection.role,
        sendText: (payload) => {
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(payload);
            }
        },
        sendBinary: (payload) => {
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(payload, { binary: true });
            }
        },
    });

    socket.on('message', (data: Buffer, isBinary: boolean) => {
        if (isBinary) {
            if (connection.role === 'eye') {
                const accepted = mascobotLiveRelay.relayEyeAudio(connection.sessionId, connection.deviceId, Buffer.from(data));
                if (!accepted) {
                    console.log(`[robot-live-ws] eye-audio dropped ${JSON.stringify({
                        sessionId: connection.sessionId,
                        deviceId: connection.deviceId,
                        bytes: data.byteLength,
                    })}`);
                }
            }
            return;
        }

        const text = data.toString();
        if (text === 'ping' && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'heartbeat', ts: new Date().toISOString() }));
        }
    });

    const cleanup = (event: string, detail?: string) => {
        console.log(`[robot-live-ws] disconnected ${JSON.stringify({
            connectionId,
            sessionId: connection.sessionId,
            deviceId: connection.deviceId,
            role: connection.role,
            event,
            detail: detail || null,
        })}`);
        mascobotLiveRelay.disconnectPeer(connection.sessionId, connection.deviceId, connection.role, connectionId);
    };
    socket.on('close', (code, reason) => cleanup('close', `${code}:${reason?.toString?.() || ''}`));
    socket.on('error', (error) => cleanup('error', error instanceof Error ? error.message : String(error)));
});

server.on('upgrade', (request: IncomingMessage, socket: Socket, head: Buffer) => {
    const pathname = request.url ? new URL(request.url, `http://${request.headers.host || 'localhost'}`).pathname : '';
    const match = pathname.match(/^\/ws\/mascobot\/live\/(eye|main)\/([^/]+)\/([^/]+)$/);

    if (!match) {
        socket.destroy();
        return;
    }

    const [, role, sessionId, deviceId] = match;
    liveWss.handleUpgrade(request, socket, head, (ws) => {
        liveWss.emit('connection', ws, request, {
            role: role as 'eye' | 'main',
            sessionId,
            deviceId,
        });
    });
});

server.listen(port, () => {
    const mascotLive = getMascotLiveReadiness();

    console.log(`========================================`);
    console.log(`AI Server đang chạy tại: http://localhost:${port}`);
    console.log(`OpenAI API Key: ${process.env.OPENAI_API_KEY ? 'Đã thiết lập' : 'Chưa thiết lập'}`);
    console.log(`AI Endpoint: POST /api/v1/ai/generate-for-backend`);
    console.log(`Health Check: GET /api/v1/ai/health`);
    console.log(`OpenAI Realtime Health: GET /api/v1/mascot-live/health`);
    console.log(`OpenAI Realtime Session: POST /api/v1/mascot-live/session`);
    console.log(`Mascobot Gateway Health: GET /api/v1/mascobot/health`);
    console.log(`Mascobot Live Health: GET /api/v1/mascobot/live/health`);
    console.log(`Mascobot Live Session: POST /api/v1/mascobot/live/session`);
    console.log(`Mascobot Eye Audio: POST /api/v1/mascobot/eye/:deviceId/audio`);
    console.log(`Mascobot Main Command: GET /api/v1/mascobot/main/:deviceId/command`);
    console.log(`Mascobot Live Eye WS: ws://localhost:${port}/ws/mascobot/live/eye/:sessionId/:deviceId`);
    console.log(`Mascobot Live Main WS: ws://localhost:${port}/ws/mascobot/live/main/:sessionId/:deviceId`);
    console.log(`OpenAI Realtime model: ${mascotLive.model}`);
    console.log(`OpenAI Realtime ready: ${mascotLive.configured ? 'yes' : `no (${mascotLive.missingFields.join(', ') || 'unknown'})`}`);
    console.log(`========================================`);
});
