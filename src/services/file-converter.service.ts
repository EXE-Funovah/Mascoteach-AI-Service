/**
 * Mascoteach AI Service — File Converter
 *
 * Converts unsupported file formats (.docx, .pptx, .doc) into
 * formats that Gemini can natively process (.txt / .pdf).
 *
 * Strategy:
 *   • .docx  → extract text via mammoth → save as .txt
 *   • .pptx  → parse ZIP/XML structure → extract slide text → save as .txt
 *   • .doc   → attempt mammoth (limited support) → save as .txt
 *   • .pdf, .txt, images → passthrough (Gemini supports natively)
 */

import * as fs from 'fs';
import * as path from 'path';
import mammoth from 'mammoth';
import JSZip from 'jszip';

// MIME types that Gemini can handle natively — no conversion needed
const GEMINI_NATIVE_MIMES = new Set([
    'application/pdf',
    'text/plain',
    'text/html',
    'text/csv',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/heic',
    'image/heif',
]);

// Extension → MIME type for files that need conversion
const CONVERTIBLE_EXTENSIONS = new Set(['.docx', '.doc', '.pptx']);

export interface ConvertedFile {
    filePath: string;
    mimeType: string;
    originalName: string;
    wasConverted: boolean;
}

/**
 * Check if a file needs conversion before being sent to Gemini.
 */
export function needsConversion(mimeType: string, filePath: string): boolean {
    if (GEMINI_NATIVE_MIMES.has(mimeType)) return false;

    const ext = path.extname(filePath).toLowerCase();
    return CONVERTIBLE_EXTENSIONS.has(ext);
}

/**
 * Main conversion pipeline.
 * If the file is natively supported by Gemini, returns it as-is.
 * Otherwise, extracts text and saves as .txt
 */
export async function convertForGemini(
    filePath: string,
    mimeType: string,
    originalName: string
): Promise<ConvertedFile> {
    // If Gemini can handle it natively, passthrough
    if (GEMINI_NATIVE_MIMES.has(mimeType)) {
        return { filePath, mimeType, originalName, wasConverted: false };
    }

    const ext = path.extname(filePath).toLowerCase();

    let extractedText: string;

    switch (ext) {
        case '.docx':
            extractedText = await extractTextFromDocx(filePath);
            break;
        case '.doc':
            extractedText = await extractTextFromDoc(filePath);
            break;
        case '.pptx':
            extractedText = await extractTextFromPptx(filePath);
            break;
        default:
            // Unknown format — try to read as text as a last resort
            console.warn(`[Converter] Định dạng không xác định: ${ext}, thử đọc như text...`);
            extractedText = fs.readFileSync(filePath, 'utf-8');
            break;
    }

    if (!extractedText || extractedText.trim().length === 0) {
        throw new Error(
            `Không thể trích xuất nội dung từ file "${originalName}". File có thể rỗng hoặc chỉ chứa hình ảnh.`
        );
    }

    // Save extracted text as .txt
    const txtFileName = path.basename(filePath, ext) + '.txt';
    const txtFilePath = path.join(path.dirname(filePath), txtFileName);
    fs.writeFileSync(txtFilePath, extractedText, 'utf-8');

    // Clean up the original unconverted file
    if (fs.existsSync(filePath) && filePath !== txtFilePath) {
        fs.unlinkSync(filePath);
    }

    console.log(
        `[Converter] Đã chuyển đổi ${ext} → .txt (${extractedText.length} ký tự) từ "${originalName}"`
    );

    return {
        filePath: txtFilePath,
        mimeType: 'text/plain',
        originalName,
        wasConverted: true,
    };
}

/* ══════════════════════════════════════════════════════════════════
   DOCX Extraction — using mammoth
   Mammoth reads .docx files and extracts clean, structured text.
══════════════════════════════════════════════════════════════════ */
async function extractTextFromDocx(filePath: string): Promise<string> {
    console.log(`[Converter] Đang trích xuất text từ DOCX: ${filePath}`);

    const result = await mammoth.extractRawText({ path: filePath });

    if (result.messages && result.messages.length > 0) {
        const warnings = result.messages
            .filter((m: any) => m.type === 'warning')
            .map((m: any) => m.message);
        if (warnings.length > 0) {
            console.warn(`[Converter] DOCX warnings:`, warnings.join('; '));
        }
    }

    return result.value;
}

/* ══════════════════════════════════════════════════════════════════
   DOC Extraction — using mammoth (limited .doc support)
   mammoth has partial support for .doc files.
══════════════════════════════════════════════════════════════════ */
async function extractTextFromDoc(filePath: string): Promise<string> {
    console.log(`[Converter] Đang trích xuất text từ DOC: ${filePath}`);

    try {
        // mammoth has limited .doc support but worth trying
        const result = await mammoth.extractRawText({ path: filePath });
        return result.value;
    } catch (err: any) {
        console.warn(`[Converter] mammoth không thể đọc .doc, thử fallback...`);
        // Fallback: try reading as binary and extracting readable strings
        const buffer = fs.readFileSync(filePath);
        return extractReadableStrings(buffer);
    }
}

/* ══════════════════════════════════════════════════════════════════
   PPTX Extraction — parse ZIP structure and extract slide XML
   PPTX files are ZIP archives containing XML slides.
══════════════════════════════════════════════════════════════════ */
async function extractTextFromPptx(filePath: string): Promise<string> {
    console.log(`[Converter] Đang trích xuất text từ PPTX: ${filePath}`);

    const fileBuffer = fs.readFileSync(filePath);
    const zip = await JSZip.loadAsync(fileBuffer);

    // PPTX slide files are at ppt/slides/slide1.xml, slide2.xml, etc.
    const slideFiles: string[] = [];
    zip.forEach((relativePath) => {
        if (/^ppt\/slides\/slide\d+\.xml$/i.test(relativePath)) {
            slideFiles.push(relativePath);
        }
    });

    // Sort slides by number
    slideFiles.sort((a, b) => {
        const numA = parseInt(a.match(/slide(\d+)/i)?.[1] || '0');
        const numB = parseInt(b.match(/slide(\d+)/i)?.[1] || '0');
        return numA - numB;
    });

    if (slideFiles.length === 0) {
        throw new Error('Không tìm thấy slide nào trong file PPTX.');
    }

    const allText: string[] = [];

    for (const slideFile of slideFiles) {
        const slideXml = await zip.file(slideFile)?.async('string');
        if (!slideXml) continue;

        const slideNum = slideFile.match(/slide(\d+)/i)?.[1] || '?';
        const texts = extractTextFromXml(slideXml);

        if (texts.length > 0) {
            allText.push(`── Slide ${slideNum} ──`);
            allText.push(texts.join('\n'));
            allText.push(''); // blank line between slides
        }
    }

    // Also try to extract from slide notes
    const noteFiles: string[] = [];
    zip.forEach((relativePath) => {
        if (/^ppt\/notesSlides\/notesSlide\d+\.xml$/i.test(relativePath)) {
            noteFiles.push(relativePath);
        }
    });

    if (noteFiles.length > 0) {
        allText.push('\n── Ghi chú diễn giả ──');
        noteFiles.sort((a, b) => {
            const numA = parseInt(a.match(/notesSlide(\d+)/i)?.[1] || '0');
            const numB = parseInt(b.match(/notesSlide(\d+)/i)?.[1] || '0');
            return numA - numB;
        });
        for (const noteFile of noteFiles) {
            const noteXml = await zip.file(noteFile)?.async('string');
            if (!noteXml) continue;
            const texts = extractTextFromXml(noteXml);
            if (texts.length > 0) {
                allText.push(texts.join('\n'));
            }
        }
    }

    console.log(`[Converter] PPTX: Trích xuất được ${slideFiles.length} slides`);
    return allText.join('\n');
}

/* ══════════════════════════════════════════════════════════════════
   XML text extraction helper
   Extracts all text content from <a:t> tags in Office Open XML.
══════════════════════════════════════════════════════════════════ */
function extractTextFromXml(xml: string): string[] {
    const texts: string[] = [];

    // Extract text from <a:t> tags (PowerPoint text runs)
    // and <w:t> tags (Word text runs, just in case)
    const tagPattern = /<(?:a|w):t[^>]*>([\s\S]*?)<\/(?:a|w):t>/g;
    let match;

    // Group text by paragraphs (<a:p> blocks)
    const paragraphs = xml.split(/<\/a:p>/);

    for (const para of paragraphs) {
        const paraTexts: string[] = [];
        tagPattern.lastIndex = 0;

        while ((match = tagPattern.exec(para)) !== null) {
            const text = match[1]
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&apos;/g, "'")
                .trim();
            if (text) {
                paraTexts.push(text);
            }
        }

        if (paraTexts.length > 0) {
            texts.push(paraTexts.join(''));
        }
    }

    return texts.filter((t) => t.trim().length > 0);
}

/* ══════════════════════════════════════════════════════════════════
   Fallback: Extract readable ASCII/Unicode strings from binary
══════════════════════════════════════════════════════════════════ */
function extractReadableStrings(buffer: Buffer): string {
    // Extract sequences of printable characters (length >= 4)
    const text = buffer.toString('utf-8', 0, Math.min(buffer.length, 1_000_000));
    const readable = text.replace(/[^\x20-\x7E\u00C0-\u024F\u1E00-\u1EFF\s]/g, ' ');
    // Collapse multiple spaces
    return readable.replace(/\s{3,}/g, '\n').trim();
}
