import { Router } from 'express';
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
router.post('/devices/:deviceId/heartbeat', heartbeatMascobotDevice);
router.get('/devices/:deviceId', getMascobotDeviceState);
router.post('/eye/:deviceId/audio', uploadMascobotEyeAudio);
router.post('/audio/upload', uploadMascobotEyeAudio);
router.post('/turns/:turnId/response', markMascobotResponseReady);
router.get('/main/:deviceId/command', getMascobotMainCommand);
router.post('/main/:deviceId/command/:commandId/ack', ackMascobotMainCommand);

export default router;

