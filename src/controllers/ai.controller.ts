import { Request, Response } from "express";
import { generateMCQFromFile, OPENAI_QUIZ_MODEL } from "../services/openai.service";
import { downloadFromUrl } from "../services/download.service";
import { extractFromZipIfNeeded } from "../services/unzip.service";
import { convertForOpenAI } from "../services/file-converter.service";
import { MCQItem, QuestionForBackend, OptionForBackend, BackendIntegrationResponse } from "../types/ai.types";
import { getAgoraLiveReadiness } from "../config/agora-live.config";

export const generateForBackend = async (req: Request, res: Response): Promise<any> => {
    try {
        const { fileUrl } = req.body;
        if (!fileUrl) {
            return res.status(400).json({ success: false, message: "Vui long cung cap fileUrl.", data: null });
        }
        console.log(`[AI] Downloading: ${fileUrl}`);
        const downloaded = await downloadFromUrl(fileUrl);
        const unzipped = await extractFromZipIfNeeded(downloaded.filePath, downloaded.mimeType, downloaded.fileName);
        const { filePath: rawFilePath, mimeType: rawMimeType, fileName: originalName } = unzipped;
        const converted = await convertForOpenAI(rawFilePath, rawMimeType, originalName);
        const { filePath, mimeType } = converted;
        if (converted.wasConverted) { console.log(`[AI] Converted: ${rawMimeType} -> ${mimeType}`); }
        const documentId = req.body.documentId ? parseInt(req.body.documentId) : undefined;
        const quizTitle = req.body.quizTitle || `Quiz tu ${originalName}`;
        const numberOfQuestions = req.body.numberOfQuestions ? parseInt(req.body.numberOfQuestions) : 5;
        const difficultyDistribution = req.body.difficultyDistribution || undefined;
        const language = req.body.language || "vi";
        console.log(`[AI] File: ${originalName}, Questions: ${numberOfQuestions}, Lang: ${language}`);
        const rawMCQData: MCQItem[] = await generateMCQFromFile(filePath, mimeType, { numberOfQuestions, difficultyDistribution, language });
        const questionsForBackend: QuestionForBackend[] = rawMCQData.map((item) => {
            const options: OptionForBackend[] = item.options.map((optText) => ({ optionText: optText, isCorrect: optText === item.correctAnswer }));
            return { questionText: item.question, questionType: "MultipleChoice", options };
        });
        const response: BackendIntegrationResponse = {
            success: true,
            message: `Tao thanh cong ${questionsForBackend.length} cau hoi MCQ!`,
            data: { documentId, quizTitle, questions: questionsForBackend },
            metadata: { generatedAt: new Date().toISOString(), questionCount: questionsForBackend.length, model: OPENAI_QUIZ_MODEL }
        };
        console.log(`[AI] Done: ${questionsForBackend.length} questions`);
        return res.status(200).json(response);
    } catch (error: any) {
        console.error("[AI] Error:", error.message);
        return res.status(500).json({ success: false, message: error.message || "AI error.", data: null });
    }
};

export const healthCheck = async (req: Request, res: Response): Promise<any> => {
    const agoraLive = getAgoraLiveReadiness();
    return res.status(200).json({
        success: true, message: "Mascoteach AI Service running",
        data: { service: "mascoteach-ai-service", version: "1.0.0", timestamp: new Date().toISOString(), openaiApiKey: process.env.OPENAI_API_KEY ? "configured" : "missing", agoraLive }
    });
};
