import { Router } from 'express';
import {
    agoraLiveHealthCheck,
    createAgoraLiveSession,
    endAgoraLiveSession,
    getAgoraLiveSession,
} from '../controllers/mascot-live.controller';

const router = Router();

router.get('/health', agoraLiveHealthCheck);
router.post('/session', createAgoraLiveSession);
router.get('/session/:sessionId', getAgoraLiveSession);
router.post('/session/:sessionId/end', endAgoraLiveSession);

export default router;
