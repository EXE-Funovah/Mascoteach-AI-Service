import { Router } from 'express';
import {
    createMascotLiveSession,
    endMascotLiveSession,
    getMascotLiveSession,
    mascotLiveHealthCheck,
} from '../controllers/mascot-live.controller';

const router = Router();

router.get('/health', mascotLiveHealthCheck);
router.post('/session', createMascotLiveSession);
router.get('/session/:sessionId', getMascotLiveSession);
router.post('/session/:sessionId/end', endMascotLiveSession);

export default router;
