import { Router } from 'express';
import { uploadMiddleware } from '../middlewares/upload.middleware';
import { generateMCQ } from '../controllers/mcq.controller';

const router = Router();

// Endpoint nhận 1 file với key là "document"
router.post('/generate', uploadMiddleware.single('document'), generateMCQ);

export default router;