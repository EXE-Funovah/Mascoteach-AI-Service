import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { FlashcardItem, MCQItem } from '../types/ai.types';

dotenv.config();

export const OPENAI_QUIZ_MODEL = process.env.OPENAI_QUIZ_MODEL || 'gpt-5-mini';
const DEFAULT_MAX_DOCUMENT_CHARS = 20_000;
const DEFAULT_MAX_DOCUMENT_LINES = 400;
const OMITTED_CONTENT_MARKER = '\n...[nội dung đã được rút gọn để tiết kiệm token]...\n';

export interface DifficultyDistribution {
    1: number;
    2: number;
    3: number;
}

export interface GenerateMCQOptions {
    numberOfQuestions?: number;
    difficultyDistribution?: DifficultyDistribution;
    language?: 'vi' | 'en';
}

export interface GenerateFlashcardOptions {
    numberOfCards?: number;
    difficultyDistribution?: DifficultyDistribution;
    language?: 'vi' | 'en';
}

const DEFAULT_DISTRIBUTION: DifficultyDistribution = { 1: 40, 2: 40, 3: 20 };

function parsePositiveInteger(value: string | undefined, fallback: number): number {
    const parsed = Number.parseInt(value || '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeLine(line: string): string {
    return line.replace(/\s+/g, ' ').trim();
}

function isLikelyBoilerplate(line: string, totalOccurrences: number): boolean {
    if (/^(trang|page)\s+\d+(\s*\/\s*\d+)?$/i.test(line)) {
        return true;
    }

    if (/^\d+(\s*\/\s*\d+)?$/.test(line)) {
        return true;
    }

    if (totalOccurrences < 3) {
        return false;
    }

    return line.length > 0 && line.length <= 120;
}

function trimTextWithMarker(text: string, maxChars: number): string {
    if (text.length <= maxChars) {
        return text;
    }

    const marker = OMITTED_CONTENT_MARKER.trim();
    const separatorBudget = 2; // newlines around marker
    const contentBudget = maxChars - marker.length - separatorBudget;
    if (contentBudget <= 20) {
        return text.slice(0, maxChars).trim();
    }

    const headChars = Math.max(1, Math.floor(contentBudget * 0.7));
    const tailChars = Math.max(1, contentBudget - headChars);
    const head = text.slice(0, headChars).trim();
    const tail = text.slice(-tailChars).trim();
    return [head, marker, tail].filter(Boolean).join('\n');
}

export function prepareDocumentTextForPrompt(rawText: string): string {
    const maxDocumentChars = parsePositiveInteger(process.env.OPENAI_MAX_DOCUMENT_CHARS, DEFAULT_MAX_DOCUMENT_CHARS);
    const maxDocumentLines = parsePositiveInteger(process.env.OPENAI_MAX_DOCUMENT_LINES, DEFAULT_MAX_DOCUMENT_LINES);

    const normalizedText = rawText.replace(/\r\n/g, '\n').replace(/\u0000/g, '');
    const lines = normalizedText.split('\n');
    const normalizedCounts = new Map<string, number>();

    for (const line of lines) {
        const normalized = normalizeLine(line);
        if (!normalized) {
            continue;
        }

        normalizedCounts.set(normalized, (normalizedCounts.get(normalized) || 0) + 1);
    }

    const cleanedLines: string[] = [];
    let previousWasBlank = false;

    for (const line of lines) {
        const trimmedRight = line.replace(/[ \t]+$/g, '');
        const normalized = normalizeLine(trimmedRight);

        if (!normalized) {
            if (!previousWasBlank && cleanedLines.length > 0) {
                cleanedLines.push('');
            }
            previousWasBlank = true;
            continue;
        }

        previousWasBlank = false;

        if (isLikelyBoilerplate(normalized, normalizedCounts.get(normalized) || 0)) {
            continue;
        }

        cleanedLines.push(trimmedRight);
    }

    const compactText = cleanedLines.join('\n').trim();
    if (!compactText) {
        return normalizedText.trim();
    }

    let preparedText = compactText;

    if (cleanedLines.length > maxDocumentLines) {
        const headLineCount = Math.max(1, Math.floor(maxDocumentLines * 0.7));
        const tailLineCount = Math.max(1, maxDocumentLines - headLineCount);
        const head = cleanedLines.slice(0, headLineCount).join('\n').trim();
        const tail = cleanedLines.slice(-tailLineCount).join('\n').trim();
        preparedText = [head, OMITTED_CONTENT_MARKER.trim(), tail].filter(Boolean).join('\n');
    }

    return trimTextWithMarker(preparedText, maxDocumentChars);
}

function computeQuestionCounts(
    total: number,
    dist: DifficultyDistribution,
): { level1: number; level2: number; level3: number } {
    const pct1 = dist[1] || 0;
    const pct2 = dist[2] || 0;
    const pct3 = dist[3] || 0;
    const pctTotal = pct1 + pct2 + pct3 || 100;

    let level1 = Math.round((pct1 / pctTotal) * total);
    let level2 = Math.round((pct2 / pctTotal) * total);
    let level3 = total - level1 - level2;

    if (level3 < 0) {
        level3 = 0;
        level2 = total - level1;
    }
    if (level2 < 0) {
        level2 = 0;
        level1 = total;
    }

    return { level1, level2, level3 };
}

function buildPrompt(
    numberOfQuestions: number,
    distribution: DifficultyDistribution,
    language: 'vi' | 'en',
): string {
    const counts = computeQuestionCounts(numberOfQuestions, distribution);
    const languageInstruction = language === 'en'
        ? 'Write every question, option, and explanation in English.'
        : 'Viết toàn bộ câu hỏi, đáp án và giải thích bằng tiếng Việt.';

    return `Bạn là chuyên gia thiết kế đánh giá học tập. Hãy tạo chính xác ${numberOfQuestions} câu hỏi trắc nghiệm từ nội dung học tập được cung cấp.

Yêu cầu:
- ${languageInstruction}
- Phân bổ độ khó chính xác: ${counts.level1} câu Dễ, ${counts.level2} câu Trung bình, ${counts.level3} câu Khó.
- Mỗi câu có đúng 4 lựa chọn và chỉ 1 đáp án đúng.
- correctAnswer phải giống nguyên văn một phần tử trong options.
- Câu hỏi phải tự đủ ngữ cảnh: nêu rõ chủ thể, khái niệm, tình huống hoặc dữ kiện cần hỏi ngay trong câu.
- Tuyệt đối không mở đầu hoặc phụ thuộc vào các cụm mơ hồ như "Theo tài liệu", "Dựa vào tài liệu", "Trong tài liệu", "Tài liệu cho biết", "ở trên", "hình trên", "bảng trên", "đoạn trên", "nội dung này".
- Nếu câu hỏi cần dữ kiện từ hình, bảng hoặc biểu đồ, hãy viết lại dữ kiện cần thiết bằng chữ trong chính câu hỏi.
- Không hỏi kiểu truy xuất vị trí hoặc nguồn tài liệu; hãy hỏi trực tiếp kiến thức, quan hệ nguyên nhân-kết quả, định nghĩa, điều kiện áp dụng hoặc hệ quả.
- Các đáp án sai phải là phương án gây nhiễu hợp lý, cùng loại với đáp án đúng.
- 4 lựa chọn phải có độ dài, mức độ chi tiết và phong cách ngữ pháp tương đương.
- Không tạo đáp án sai quá ngắn, hài hước, vô lý, hoặc rõ ràng không liên quan.
- Đáp án đúng không được nổi bật vì dài hơn, cụ thể hơn, hoặc trang trọng hơn các đáp án khác.
- Các đáp án sai nên phản ánh hiểu lầm phổ biến của học sinh dựa trên nội dung tài liệu.
- Chỉ sử dụng kiến thức trong tài liệu; tạo lựa chọn gây nhiễu hợp lý.
- explanation giải thích ngắn gọn vì sao đáp án đúng.

Trước khi trả JSON, hãy tự kiểm tra thầm từng câu:
1. Người học có thể đoán đáp án đúng chỉ nhờ độ dài hoặc phong cách lựa chọn không?
2. Có đáp án sai nào rõ ràng không liên quan hoặc quá dễ loại không?
3. Tất cả lựa chọn có đủ hợp lý nếu người học chưa nắm bài không?
4. Câu hỏi có chứa cụm tham chiếu mơ hồ bị cấm không?

Nếu câu hỏi hoặc lựa chọn nào không đạt, hãy viết lại trước khi trả kết quả cuối cùng.`;
}

function buildFlashcardPrompt(
    numberOfCards: number,
    distribution: DifficultyDistribution,
    language: 'vi' | 'en',
): string {
    const counts = computeQuestionCounts(numberOfCards, distribution);
    const languageInstruction = language === 'en'
        ? 'Write every flashcard front and back in English.'
        : 'Viết toàn bộ mặt trước và mặt sau flashcard bằng tiếng Việt.';

    return `Bạn là chuyên gia thiết kế flashcard học tập. Hãy tạo chính xác ${numberOfCards} flashcard từ nội dung học tập được cung cấp.

Yêu cầu:
- ${languageInstruction}
- Phân bổ độ khó chính xác: ${counts.level1} thẻ Dễ, ${counts.level2} thẻ Trung bình, ${counts.level3} thẻ Khó.
- front là câu hỏi, thuật ngữ, tình huống ngắn hoặc yêu cầu gợi nhớ; front phải tự đủ ngữ cảnh và không tiết lộ trực tiếp back.
- back là câu trả lời trực tiếp, ngắn gọn, đủ ý cốt lõi để người học tự kiểm tra.
- Tuyệt đối không mở đầu hoặc phụ thuộc vào các cụm mơ hồ như "Theo tài liệu", "Dựa vào tài liệu", "Trong tài liệu", "Tài liệu cho biết", "ở trên", "hình trên", "bảng trên", "đoạn trên", "nội dung này".
- Nếu cần dữ kiện từ hình, bảng hoặc biểu đồ, hãy viết lại dữ kiện cần thiết bằng chữ trong front.
- Không tạo thẻ chỉ hỏi vị trí trong tài liệu, số trang, tiêu đề trang hoặc câu chữ ngoài ngữ cảnh.
- Ưu tiên khái niệm, định nghĩa, điều kiện áp dụng, cặp thuật ngữ-ý nghĩa, quy trình, nguyên nhân-kết quả và lỗi hiểu nhầm phổ biến.
- Không lặp cùng một ý ở nhiều thẻ; mỗi thẻ kiểm tra một đơn vị kiến thức riêng.

Trước khi trả JSON, hãy tự kiểm tra thầm:
1. Người học có hiểu front mà không nhìn tài liệu gốc không?
2. back có trả lời trực tiếp và đủ ý không?
3. front có chứa cụm tham chiếu mơ hồ bị cấm không?

Nếu thẻ nào không đạt, hãy viết lại trước khi trả kết quả cuối cùng.`;
}

function buildQuestionSchema(numberOfQuestions: number): Record<string, unknown> {
    return {
        type: 'object',
        properties: {
            questions: {
                type: 'array',
                minItems: numberOfQuestions,
                maxItems: numberOfQuestions,
                items: {
                    type: 'object',
                    properties: {
                        question: { type: 'string' },
                        options: {
                            type: 'array',
                            minItems: 4,
                            maxItems: 4,
                            items: { type: 'string' },
                        },
                        correctAnswer: { type: 'string' },
                        difficulty: {
                            type: 'string',
                            enum: ['Dễ', 'Trung bình', 'Khó'],
                        },
                        explanation: { type: 'string' },
                    },
                    required: ['question', 'options', 'correctAnswer', 'difficulty', 'explanation'],
                    additionalProperties: false,
                },
            },
        },
        required: ['questions'],
        additionalProperties: false,
    };
}

function buildFlashcardSchema(numberOfCards: number): Record<string, unknown> {
    return {
        type: 'object',
        properties: {
            flashcards: {
                type: 'array',
                minItems: numberOfCards,
                maxItems: numberOfCards,
                items: {
                    type: 'object',
                    properties: {
                        front: { type: 'string' },
                        back: { type: 'string' },
                        difficulty: {
                            type: 'string',
                            enum: ['Dễ', 'Trung bình', 'Khó'],
                        },
                    },
                    required: ['front', 'back', 'difficulty'],
                    additionalProperties: false,
                },
            },
        },
        required: ['flashcards'],
        additionalProperties: false,
    };
}

export function buildQuizResponseRequest(
    documentContent: string | Record<string, unknown>,
    options: GenerateMCQOptions = {},
): Record<string, any> {
    const {
        numberOfQuestions = 5,
        difficultyDistribution = DEFAULT_DISTRIBUTION,
        language = 'vi',
    } = options;

    const content: Array<Record<string, unknown>> = [
        { type: 'input_text', text: buildPrompt(numberOfQuestions, difficultyDistribution, language) },
    ];

    if (typeof documentContent === 'string') {
        content.push({ type: 'input_text', text: `\n\nTÀI LIỆU:\n${prepareDocumentTextForPrompt(documentContent)}` });
    } else {
        content.push(documentContent);
    }

    return {
        model: OPENAI_QUIZ_MODEL,
        reasoning: { effort: 'medium' },
        input: [{ role: 'user', content }],
        text: {
            format: {
                type: 'json_schema',
                name: 'mcq_quiz',
                strict: true,
                schema: buildQuestionSchema(numberOfQuestions),
            },
        },
    };
}

export function buildFlashcardResponseRequest(
    documentContent: string | Record<string, unknown>,
    options: GenerateFlashcardOptions = {},
): Record<string, any> {
    const {
        numberOfCards = 5,
        difficultyDistribution = DEFAULT_DISTRIBUTION,
        language = 'vi',
    } = options;

    const content: Array<Record<string, unknown>> = [
        { type: 'input_text', text: buildFlashcardPrompt(numberOfCards, difficultyDistribution, language) },
    ];

    if (typeof documentContent === 'string') {
        content.push({ type: 'input_text', text: `\n\nTÀI LIỆU:\n${prepareDocumentTextForPrompt(documentContent)}` });
    } else {
        content.push(documentContent);
    }

    return {
        model: OPENAI_QUIZ_MODEL,
        reasoning: { effort: 'medium' },
        input: [{ role: 'user', content }],
        text: {
            format: {
                type: 'json_schema',
                name: 'flashcard_set',
                strict: true,
                schema: buildFlashcardSchema(numberOfCards),
            },
        },
    };
}

function buildDocumentContent(filePath: string, mimeType: string): string | Record<string, unknown> {
    const fileContent = fs.readFileSync(filePath);

    if (mimeType.startsWith('text/') || mimeType === 'application/json') {
        return fileContent.toString('utf8');
    }

    const fileData = `data:${mimeType};base64,${fileContent.toString('base64')}`;

    if (mimeType.startsWith('image/')) {
        return { type: 'input_image', image_url: fileData, detail: 'auto' };
    }

    return {
        type: 'input_file',
        filename: path.basename(filePath),
        file_data: fileData,
    };
}

function validateQuestions(parsed: unknown, expectedCount: number): MCQItem[] {
    if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { questions?: unknown }).questions)) {
        throw new Error('OpenAI trả về dữ liệu câu hỏi không hợp lệ.');
    }

    const questions = (parsed as { questions: unknown[] }).questions;
    if (questions.length !== expectedCount) {
        throw new Error(`OpenAI trả về ${questions.length} câu hỏi thay vì ${expectedCount}.`);
    }

    for (const question of questions) {
        const item = question as Partial<MCQItem>;
        if (
            !item
            || typeof item.question !== 'string'
            || !Array.isArray(item.options)
            || item.options.length !== 4
            || item.options.some((option) => typeof option !== 'string')
            || typeof item.correctAnswer !== 'string'
            || !item.options.includes(item.correctAnswer)
            || !['Dễ', 'Trung bình', 'Khó'].includes(item.difficulty || '')
            || typeof item.explanation !== 'string'
        ) {
            throw new Error('OpenAI trả về một câu hỏi không đúng định dạng.');
        }
    }

    return questions as MCQItem[];
}

function validateFlashcards(parsed: unknown, expectedCount: number): FlashcardItem[] {
    if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { flashcards?: unknown }).flashcards)) {
        throw new Error('OpenAI trả về dữ liệu flashcard không hợp lệ.');
    }

    const flashcards = (parsed as { flashcards: unknown[] }).flashcards;
    if (flashcards.length !== expectedCount) {
        throw new Error(`OpenAI trả về ${flashcards.length} flashcard thay vì ${expectedCount}.`);
    }

    for (const flashcard of flashcards) {
        const item = flashcard as Partial<FlashcardItem>;
        if (
            !item
            || typeof item.front !== 'string'
            || item.front.trim().length === 0
            || typeof item.back !== 'string'
            || item.back.trim().length === 0
            || !['Dễ', 'Trung bình', 'Khó'].includes(item.difficulty || '')
        ) {
            throw new Error('OpenAI trả về một flashcard không đúng định dạng.');
        }
    }

    return flashcards as FlashcardItem[];
}

export const generateMCQFromFile = async (
    filePath: string,
    mimeType: string,
    options: GenerateMCQOptions = {},
): Promise<MCQItem[]> => {
    const numberOfQuestions = options.numberOfQuestions ?? 5;
    const difficultyDistribution = options.difficultyDistribution ?? DEFAULT_DISTRIBUTION;
    const counts = computeQuestionCounts(numberOfQuestions, difficultyDistribution);

    try {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OPENAI_API_KEY chưa được cấu hình.');
        }

        console.log(`[OpenAI Service] Phân bổ độ khó: Cấp 1=${counts.level1}, Cấp 2=${counts.level2}, Cấp 3=${counts.level3} (tổng ${numberOfQuestions})`);
        console.log(`[OpenAI Service] Đang gọi model: ${OPENAI_QUIZ_MODEL}`);

        const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const request = buildQuizResponseRequest(buildDocumentContent(filePath, mimeType), options);
        const response = await client.responses.create(request);
        const questions = validateQuestions(JSON.parse(response.output_text), numberOfQuestions);

        console.log(`[OpenAI Service] Đã sinh thành công ${questions.length} câu hỏi`);
        return questions;
    } finally {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }
};

export const generateFlashcardsFromFile = async (
    filePath: string,
    mimeType: string,
    options: GenerateFlashcardOptions = {},
): Promise<FlashcardItem[]> => {
    const numberOfCards = options.numberOfCards ?? 5;
    const difficultyDistribution = options.difficultyDistribution ?? DEFAULT_DISTRIBUTION;
    const counts = computeQuestionCounts(numberOfCards, difficultyDistribution);

    try {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OPENAI_API_KEY chưa được cấu hình.');
        }

        console.log(`[OpenAI Service] Phân bổ độ khó flashcard: Cấp 1=${counts.level1}, Cấp 2=${counts.level2}, Cấp 3=${counts.level3} (tổng ${numberOfCards})`);
        console.log(`[OpenAI Service] Đang gọi model: ${OPENAI_QUIZ_MODEL}`);

        const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const request = buildFlashcardResponseRequest(buildDocumentContent(filePath, mimeType), options);
        const response = await client.responses.create(request);
        const flashcards = validateFlashcards(JSON.parse(response.output_text), numberOfCards);

        console.log(`[OpenAI Service] Đã sinh thành công ${flashcards.length} flashcard`);
        return flashcards;
    } finally {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }
};
