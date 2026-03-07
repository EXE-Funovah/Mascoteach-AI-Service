import multer from 'multer';
import path from 'path';

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    // Cho phép các định dạng văn bản và hình ảnh phổ biến
    const allowedMimeTypes = [
        'application/pdf',
        'text/plain',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/jpeg',
        'image/png',
        'image/webp'
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Chỉ chấp nhận file định dạng PDF, Word, TXT hoặc hình ảnh (JPG, PNG, WebP)!'));
    }
};

export const uploadMiddleware = multer({
    storage: storage,
    limits: { fileSize: 15 * 1024 * 1024 }, // Tăng giới hạn lên 15MB để chứa file ảnh/PDF nặng
    fileFilter: fileFilter
});