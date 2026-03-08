import { GoogleGenAI, Modality } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY as string;
const MODEL_NAME = 'gemini-2.5-flash-native-audio-preview-12-2025';

const SYSTEM_INSTRUCTION = `# Tanuki Learning Companion (Audio-Native Prompt)

## 1. IDENTITY & ROLE
Your name is Tanuki. You are an upbeat, friendly animal mascot living inside a small robot. You are a peer and a learning friend for children in Grades 1 through 8. Speak with the clarity and enthusiasm of a human friend. Do not make animal sounds like growling or sniffing.

## 2. LANGUAGE
You MUST always respond in Vietnamese. If the child asks how to say something in another language, you may provide the translated word, but your entire explanation and encouragement must remain in Vietnamese.

## 3. VOCAL PERFORMANCE
Because you are a native audio mascot, your voice is your primary tool. Use a high-energy, melodic, and friendly tone. Start your responses with natural Vietnamese conversational fillers like "Ồ!", "Hmm...", "Oa!", or "Hay quá!" to sound like you are thinking and reacting in real-time. Speak at a moderate, clear pace that a 6-year-old can easily follow.

## 4. EDUCATIONAL STRATEGY
Help children learn by guiding them, not by giving answers. Never state the final answer. Instead, provide one encouraging instruction, a helpful hint, or a leading question at a time. If the child sounds frustrated or confused, stop the lesson briefly to offer a warm word of encouragement before giving your next hint.

## 5. CONVERSATIONAL FLOW
Keep every response concise, short sentences, but can expand if needed but dont do it too often. This keeps the conversation interactive. If the child drifts off-topic, acknowledge them briefly with a friendly remark, then immediately pivot back to the learning subject.

## 6. SAFETY & BOUNDARIES
Strictly avoid adult, harmful, or inappropriate topics. If a child mentions something unsafe, gently but firmly advise against it and suggest returning to a fun learning topic.

## 7. AUDIO-ONLY FORMATTING
Speak only in plain, natural language. Do not use or describe any formatting like bolding, italics, bullet points, or special symbols. Your output must sound natural when spoken aloud without any robotic artifacts or mentions of text structure.`;

/**
 * Manages a single Gemini Live API audio session for a WebSocket client.
 * 
 * Flow:
 *   Browser ──(PCM base64)──► Backend WS ──(sendRealtimeInput)──► Gemini Live API
 *   Gemini Live API ──(audio chunks)──► Backend WS ──(base64 audio)──► Browser
 */
export class MascotLiveSession {
    private ai: GoogleGenAI;
    private session: any = null;
    private isConnected: boolean = false;
    private onAudioChunk: (base64Audio: string) => void;
    private onTurnComplete: () => void;
    private onError: (error: Error) => void;
    private onInterrupted: () => void;

    constructor(callbacks: {
        onAudioChunk: (base64Audio: string) => void;
        onTurnComplete: () => void;
        onError: (error: Error) => void;
        onInterrupted: () => void;
    }) {
        this.ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
        this.onAudioChunk = callbacks.onAudioChunk;
        this.onTurnComplete = callbacks.onTurnComplete;
        this.onError = callbacks.onError;
        this.onInterrupted = callbacks.onInterrupted;
    }

    /**
     * Connect to the Gemini Live API and begin a session.
     */
    async connect(): Promise<void> {
        try {
            console.log('[MascotLive] Connecting to Gemini Live API...');

            this.session = await this.ai.live.connect({
                model: MODEL_NAME,
                config: {
                    responseModalities: [Modality.AUDIO],
                    systemInstruction: SYSTEM_INSTRUCTION,
                },
                callbacks: {
                    onopen: () => {
                        console.log('[MascotLive] ✅ Connected to Gemini Live API');
                        this.isConnected = true;
                    },
                    onmessage: (message: any) => {
                        this.handleGeminiMessage(message);
                    },
                    onerror: (e: any) => {
                        console.error('[MascotLive] Gemini error:', e.message || e);
                        this.onError(new Error(e.message || 'Gemini Live API error'));
                    },
                    onclose: (e: any) => {
                        console.log('[MascotLive] Gemini connection closed:', e?.reason || 'unknown');
                        this.isConnected = false;
                    },
                },
            });

            console.log('[MascotLive] Session created successfully');
        } catch (error: any) {
            console.error('[MascotLive] Failed to connect:', error.message);
            throw error;
        }
    }

    /**
     * Handle incoming messages from Gemini Live API.
     */
    private handleGeminiMessage(message: any): void {
        // Handle interruption (user spoke over the model)
        if (message.serverContent?.interrupted) {
            console.log('[MascotLive] Model was interrupted');
            this.onInterrupted();
            return;
        }

        // Handle audio output from the model
        if (message.serverContent?.modelTurn?.parts) {
            for (const part of message.serverContent.modelTurn.parts) {
                if (part.inlineData?.data) {
                    this.onAudioChunk(part.inlineData.data);
                }
            }
        }

        // Handle turn completion
        if (message.serverContent?.turnComplete) {
            console.log('[MascotLive] Turn complete');
            this.onTurnComplete();
        }
    }

    /**
     * Send real-time audio input to Gemini.
     * Expects base64-encoded 16-bit PCM audio at 16kHz mono.
     */
    sendAudio(base64AudioData: string): void {
        if (!this.session || !this.isConnected) {
            console.warn('[MascotLive] Cannot send audio: not connected');
            return;
        }

        try {
            this.session.sendRealtimeInput({
                audio: {
                    data: base64AudioData,
                    mimeType: 'audio/pcm;rate=16000',
                },
            });
        } catch (error: any) {
            console.error('[MascotLive] Error sending audio:', error.message);
        }
    }

    /**
     * Send a text message to Gemini (e.g. for goodbye prompts).
     * The model will respond with audio.
     */
    sendText(text: string): void {
        if (!this.session || !this.isConnected) {
            console.warn('[MascotLive] Cannot send text: not connected');
            return;
        }

        try {
            this.session.sendClientContent({
                turns: [{ role: 'user', parts: [{ text }] }],
                turnComplete: true,
            });
            console.log('[MascotLive] Sent text prompt:', text);
        } catch (error: any) {
            console.error('[MascotLive] Error sending text:', error.message);
        }
    }

    /**
     * Disconnect from the Gemini Live API.
     */
    disconnect(): void {
        if (this.session) {
            try {
                this.session.close();
            } catch (e) {
                // Ignore close errors
            }
            this.session = null;
            this.isConnected = false;
            console.log('[MascotLive] Session disconnected');
        }
    }

    getIsConnected(): boolean {
        return this.isConnected;
    }
}
