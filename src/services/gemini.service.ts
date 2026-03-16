import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);

const MODEL_PRIORITY = ["gemini-3.1-flash-lite-preview", "gemini-2.5-flash-preview-05-20"];

/**
 * Phân bổ độ khó theo phần trăm (khớp với frontend QuizSettingsPage)
 *   Cấp độ 1 = Nhận biết (Dễ)
 *   Cấp độ 2 = Thông hiểu (Trung bình)
 *   Cấp độ 3 = Vận dụng (Khó)
 */
export interface DifficultyDistribution {
    1: number; // phần trăm cấp độ 1
    2: number; // phần trăm cấp độ 2
    3: number; // phần trăm cấp độ 3
}

export interface GenerateMCQOptions {
    numberOfQuestions?: number;
    difficultyDistribution?: DifficultyDistribution;
    language?: 'vi' | 'en';
}

const DEFAULT_DISTRIBUTION: DifficultyDistribution = { 1: 40, 2: 40, 3: 20 };

/**
 * Tính số câu hỏi thực tế cho mỗi cấp độ, đảm bảo tổng = numberOfQuestions
 */
function computeQuestionCounts(
    total: number,
    dist: DifficultyDistribution
): { level1: number; level2: number; level3: number } {
    const pct1 = dist[1] || 0;
    const pct2 = dist[2] || 0;
    const pct3 = dist[3] || 0;
    const pctTotal = pct1 + pct2 + pct3 || 100;

    let level1 = Math.round((pct1 / pctTotal) * total);
    let level2 = Math.round((pct2 / pctTotal) * total);
    let level3 = total - level1 - level2; // phần còn lại để đảm bảo tổng chính xác

    // Đảm bảo không có giá trị âm
    if (level3 < 0) { level3 = 0; level2 = total - level1; }
    if (level2 < 0) { level2 = 0; level1 = total; }

    return { level1, level2, level3 };
}

function buildPrompt(
    numberOfQuestions: number,
    distribution: DifficultyDistribution,
    language: 'vi' | 'en'
): string {
    const counts = computeQuestionCounts(numberOfQuestions, distribution);
    const langInstruction = language === 'en'
        ? 'All question text, options, and explanations MUST be in English.'
        : 'Toàn bộ nội dung câu hỏi, đáp án và giải thích PHẢI bằng Tiếng Việt.';

    const difficultyLabels = language === 'en'
        ? { easy: 'Easy', medium: 'Medium', hard: 'Hard' }
        : { easy: 'Nhận biết', medium: 'Thông hiểu', hard: 'Vận dụng' };

    return `
Bạn là một giáo sư chuyên xây dựng đề thi trắc nghiệm (Multiple Choice Questions - MCQ).
Tôi cung cấp cho bạn một tài liệu đính kèm (có thể là văn bản, hình ảnh, biểu đồ, hoặc bản scan).
Hãy "đọc" và phân tích kỹ toàn bộ NỘI DUNG KIẾN THỨC trong tài liệu đó, sau đó tạo ra đúng ${numberOfQuestions} câu hỏi trắc nghiệm.

═══════════════════════════════════════════
NGÔN NGỮ ĐẦU RA
═══════════════════════════════════════════
${langInstruction}

═══════════════════════════════════════════
PHÂN BỔ ĐỘ KHÓ (BẮT BUỘC TUÂN THỦ CHÍNH XÁC)
═══════════════════════════════════════════
- "${difficultyLabels.easy}" (Cấp độ 1 — Nhận biết/Ghi nhớ): ${counts.level1} câu
  → Câu hỏi kiểm tra sự ghi nhớ, nhận diện thông tin trực tiếp có trong tài liệu.
- "${difficultyLabels.medium}" (Cấp độ 2 — Thông hiểu/Phân tích): ${counts.level2} câu
  → Câu hỏi yêu cầu hiểu bản chất, so sánh, phân biệt, giải thích ý nghĩa.
- "${difficultyLabels.hard}" (Cấp độ 3 — Vận dụng/Sáng tạo): ${counts.level3} câu
  → Câu hỏi yêu cầu áp dụng kiến thức vào tình huống mới, tổng hợp, đánh giá.

═══════════════════════════════════════════
QUY TẮC NỘI DUNG CÂU HỎI (CỰC KỲ QUAN TRỌNG)
═══════════════════════════════════════════
1. Mỗi câu PHẢI có đúng 4 đáp án.
2. Mỗi câu PHẢI TỰ CHỨA (self-contained) — người đọc chỉ cần đọc nội dung câu hỏi và 4 đáp án là có thể trả lời, KHÔNG CẦN nhìn tài liệu gốc.
3. **CẤM TUYỆT ĐỐI** tạo "câu hỏi mù" — là những câu tham chiếu đến hình ảnh, biểu đồ, bảng, sơ đồ, đồ thị, hoặc bất kỳ yếu tố trực quan nào mà người làm bài không thể nhìn thấy. Ví dụ các mẫu câu bị CẤM:
   ✗ "Dựa vào hình ảnh/biểu đồ/bảng/sơ đồ bên dưới, hãy cho biết..."
   ✗ "Quan sát hình vẽ sau..."
   ✗ "Theo đồ thị đã cho..."
   ✗ "Nhìn vào bảng số liệu..."
   ✗ "Hình sau đây mô tả..."
   ✗ Bất kỳ câu nào CẦN nhìn hình/bảng/biểu đồ/sơ đồ mới trả lời được.
4. Nếu tài liệu chứa dữ liệu từ bảng/biểu đồ/hình ảnh, hãy TRÍCH XUẤT số liệu/thông tin cụ thể và NHÚNG TRỰC TIẾP vào câu hỏi dưới dạng text.
   Ví dụ thay vì: "Dựa vào biểu đồ, doanh thu quý 3 là bao nhiêu?"
   Hãy viết: "Một công ty có doanh thu các quý lần lượt là: Q1: 500tr, Q2: 700tr, Q3: 850tr, Q4: 600tr. Quý nào có doanh thu cao nhất?"
5. Câu hỏi phải DỰA TRÊN nội dung kiến thức trong tài liệu, không bịa đặt thông tin.
6. Các đáp án sai (distractor) phải hợp lý, có tính gây nhiễu tốt — không nên quá hiển nhiên sai.

═══════════════════════════════════════════
CẤU TRÚC JSON BẮT BUỘC
═══════════════════════════════════════════
TRẢ VỀ TRỰC TIẾP MỘT MẢNG JSON HỢP LỆ, KHÔNG BAO GỒM MARKDOWN, KHÔNG CÓ \`\`\`json.

[
  {
    "question": "Nội dung câu hỏi tự chứa (self-contained), không tham chiếu hình ảnh",
    "options": ["Đáp án A", "Đáp án B", "Đáp án C", "Đáp án D"],
    "correctAnswer": "Đáp án đúng (phải khớp chính xác nội dung 1 trong 4 options trên)",
    "difficulty": "${difficultyLabels.easy} | ${difficultyLabels.medium} | ${difficultyLabels.hard}",
    "explanation": "Giải thích chi tiết tại sao đáp án này đúng dựa trên kiến thức trong tài liệu."
  }
]
`.trim();
}

export const generateMCQFromFile = async (
    filePath: string,
    mimeType: string,
    options: GenerateMCQOptions = {}
) => {
    const {
        numberOfQuestions = 5,
        difficultyDistribution = DEFAULT_DISTRIBUTION,
        language = 'vi',
    } = options;

    const fileContent = fs.readFileSync(filePath);
    const base64Data = fileContent.toString("base64");
    const filePart = { inlineData: { data: base64Data, mimeType } };

    const prompt = buildPrompt(numberOfQuestions, difficultyDistribution, language);

    const counts = computeQuestionCounts(numberOfQuestions, difficultyDistribution);
    console.log(`[Gemini Service] Phân bổ độ khó: Cấp 1=${counts.level1}, Cấp 2=${counts.level2}, Cấp 3=${counts.level3} (tổng ${numberOfQuestions})`);

    let lastError: unknown;

    try {
        for (const modelName of MODEL_PRIORITY) {
            try {
                console.log(`[Gemini Service] Đang gọi model: ${modelName}, yêu cầu: ${numberOfQuestions} câu hỏi, ngôn ngữ: ${language}`);
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent([prompt, filePart]);
                let responseText = result.response.text();
                responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
                const parsed = JSON.parse(responseText);
                console.log(`[Gemini Service] Đã sinh thành công ${parsed.length} câu hỏi (model: ${modelName})`);
                return parsed;
            } catch (err: any) {
                lastError = err;
                if (err?.status === 503 || err?.status === 429) {
                    console.warn(`[Gemini Service] Model ${modelName} lỗi ${err.status}, thử model tiếp theo...`);
                    continue;
                }
                // JSON parse error → thử model tiếp theo
                if (err instanceof SyntaxError) {
                    console.warn(`[Gemini Service] Model ${modelName} trả về JSON không hợp lệ, thử model tiếp theo...`);
                    continue;
                }
                throw err;
            }
        }
        console.error("[Gemini Service] Tất cả model đều thất bại:", lastError);
        throw new Error("Không thể xử lý file bằng Gemini API.");
    } finally {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }
};