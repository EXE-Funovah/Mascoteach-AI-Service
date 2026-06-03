import * as fs from "fs";
import * as path from "path";
import JSZip from "jszip";
import { guessMimeType } from "./download.service";

const SUPPORTED_INNER_EXTENSIONS = new Set([
    ".pdf",
    ".doc",
    ".docx",
    ".pptx",
    ".txt",
    ".html",
    ".csv",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".heic",
    ".heif",
]);

const MAX_UNZIPPED_BYTES = 100 * 1024 * 1024;

/**
 * If the downloaded file is a ZIP, extract the first non-directory entry,
 * write it to uploads/, delete the original zip, and return the inner file info.
 * Otherwise return the input unchanged.
 */
export async function extractFromZipIfNeeded(filePath: string, mimeType: string, fileName: string): Promise<{
    filePath: string;
    mimeType: string;
    fileName: string;
}> {
    const isZip =
        mimeType === "application/zip" ||
        mimeType === "application/x-zip-compressed" ||
        filePath.toLowerCase().endsWith(".zip");

    if (!isZip) {
        return { filePath, mimeType, fileName };
    }

    const zipBuffer = fs.readFileSync(filePath);
    const zip = await JSZip.loadAsync(zipBuffer);

    const entry = Object.values(zip.files).find((f) => !f.dir);
    if (!entry) {
        throw new Error("ZIP archive contains no files.");
    }

    const innerName = path.basename(entry.name);
    const ext = path.extname(innerName).toLowerCase();
    if (!ext || !SUPPORTED_INNER_EXTENSIONS.has(ext)) {
        throw new Error(`Unsupported file type inside ZIP: ${innerName || entry.name}`);
    }

    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const innerFileName = uniqueSuffix + ext;
    const innerFilePath = path.join("uploads", innerFileName);

    const innerBuffer = await entry.async("nodebuffer");
    if (innerBuffer.length > MAX_UNZIPPED_BYTES) {
        throw new Error(`File inside ZIP is too large. Max allowed size is ${MAX_UNZIPPED_BYTES / 1024 / 1024}MB.`);
    }

    fs.writeFileSync(innerFilePath, innerBuffer);

    fs.unlinkSync(filePath);

    const innerMime = guessMimeType(ext);

    return {
        filePath: innerFilePath,
        mimeType: innerMime,
        fileName: innerName,
    };
}
