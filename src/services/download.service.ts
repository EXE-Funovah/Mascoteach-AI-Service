import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

/**
 * Download a file from a URL (e.g. S3 presigned or public URL)
 * and save it to the uploads/ directory.
 *
 * @param fileUrl - The remote URL to download
 * @returns { filePath, mimeType, fileName }
 */
export async function downloadFromUrl(fileUrl: string): Promise<{
    filePath: string;
    mimeType: string;
    fileName: string;
}> {
    // Extract filename from URL (strip query params)
    const urlObj = new URL(fileUrl);
    const rawName = path.basename(urlObj.pathname) || 'document';
    const ext = path.extname(rawName) || '.pdf';
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const fileName = uniqueSuffix + ext;
    const filePath = path.join('uploads', fileName);

    // Ensure uploads directory exists
    if (!fs.existsSync('uploads')) {
        fs.mkdirSync('uploads', { recursive: true });
    }

    return new Promise((resolve, reject) => {
        const protocol = fileUrl.startsWith('https') ? https : http;

        protocol.get(fileUrl, (response) => {
            // Follow redirects (301, 302, 307, 308)
            if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                downloadFromUrl(response.headers.location).then(resolve).catch(reject);
                return;
            }

            if (response.statusCode !== 200) {
                reject(new Error(`Download thất bại: HTTP ${response.statusCode}`));
                return;
            }

            const contentType = response.headers['content-type'] || guessMimeType(ext);
            const fileStream = fs.createWriteStream(filePath);

            response.pipe(fileStream);

            fileStream.on('finish', () => {
                fileStream.close();
                resolve({
                    filePath,
                    mimeType: contentType,
                    fileName: rawName,
                });
            });

            fileStream.on('error', (err) => {
                // Clean up partial file
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
                reject(err);
            });
        }).on('error', (err) => {
            reject(new Error(`Không thể download file: ${err.message}`));
        });
    });
}

/**
 * Guess MIME type from file extension
 */
function guessMimeType(ext: string): string {
    const map: Record<string, string> = {
        '.pdf': 'application/pdf',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        '.ppt': 'application/vnd.ms-powerpoint',
        '.txt': 'text/plain',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
    };
    return map[ext.toLowerCase()] || 'application/octet-stream';
}
