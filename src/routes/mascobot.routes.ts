import { Router } from 'express';
import {
    createMascobotLiveSession,
    endMascobotLiveSession,
    getMascobotLiveSession,
    mascobotLiveHealthCheck,
} from '../controllers/mascot-live.controller';
import {
    ackMascobotMainCommand,
    getMascobotDeviceState,
    getMascobotMainCommand,
    heartbeatMascobotDevice,
    markMascobotResponseReady,
    mascobotHealthCheck,
    uploadMascobotEyeAudio,
} from '../controllers/mascobot.controller';

const router = Router();

router.get('/health', mascobotHealthCheck);
router.get('/live/health', mascobotLiveHealthCheck);
router.post('/live/session', createMascobotLiveSession);
router.get('/live/session/:sessionId', getMascobotLiveSession);
router.post('/live/session/:sessionId/end', endMascobotLiveSession);
router.post('/devices/:deviceId/heartbeat', heartbeatMascobotDevice);
router.get('/devices/:deviceId', getMascobotDeviceState);
router.post('/eye/:deviceId/audio', uploadMascobotEyeAudio);
router.post('/audio/upload', uploadMascobotEyeAudio);
router.post('/turns/:turnId/response', markMascobotResponseReady);
router.get('/main/:deviceId/command', getMascobotMainCommand);
router.post('/main/:deviceId/command/:commandId/ack', ackMascobotMainCommand);

export default router;

