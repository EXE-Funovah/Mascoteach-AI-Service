import { WebSocketServer, WebSocket } from 'ws';
import { Server as HttpServer } from 'http';
import { MascotLiveSession } from '../services/mascot-live.service';

/**
 * WebSocket message protocol between browser and backend:
 * 
 * Client → Server:
 *   { type: 'audio', data: '<base64 PCM 16kHz mono 16-bit>' }
 *   { type: 'start' }    // Start a new Gemini Live session
 *   { type: 'stop' }     // End the current session
 * 
 * Server → Client:
 *   { type: 'audio', data: '<base64 PCM 24kHz mono 16-bit>' }
 *   { type: 'turn_complete' }
 *   { type: 'interrupted' }
 *   { type: 'connected' }
 *   { type: 'error', message: '...' }
 *   { type: 'session_ended' }
 */

interface ClientMessage {
    type: 'audio' | 'start' | 'stop' | 'text';
    data?: string;
    text?: string;
}

interface ServerMessage {
    type: 'audio' | 'turn_complete' | 'interrupted' | 'connected' | 'error' | 'session_ended';
    data?: string;
    message?: string;
}

/**
 * Set up the WebSocket server for mascot live audio on the given HTTP server.
 * Mounts at path /ws/mascot-live
 */
export function setupMascotWebSocket(server: HttpServer): WebSocketServer {
    const wss = new WebSocketServer({
        server,
        path: '/ws/mascot-live',
    });

    console.log('[MascotWS] WebSocket server ready at /ws/mascot-live');

    wss.on('connection', (ws: WebSocket) => {
        console.log('[MascotWS] New client connected');

        let liveSession: MascotLiveSession | null = null;

        const sendToClient = (msg: ServerMessage) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(msg));
            }
        };

        /**
         * Create a new Gemini Live session for this WebSocket client. 
         */
        const startSession = async () => {
            // Clean up any existing session
            if (liveSession) {
                liveSession.disconnect();
                liveSession = null;
            }

            try {
                liveSession = new MascotLiveSession({
                    onAudioChunk: (base64Audio: string) => {
                        sendToClient({ type: 'audio', data: base64Audio });
                    },
                    onTurnComplete: () => {
                        sendToClient({ type: 'turn_complete' });
                    },
                    onError: (error: Error) => {
                        sendToClient({ type: 'error', message: error.message });
                    },
                    onInterrupted: () => {
                        sendToClient({ type: 'interrupted' });
                    },
                });

                await liveSession.connect();
                sendToClient({ type: 'connected' });
            } catch (error: any) {
                console.error('[MascotWS] Failed to start Gemini session:', error.message);
                sendToClient({
                    type: 'error',
                    message: 'Failed to connect to AI service: ' + error.message,
                });
                liveSession = null;
            }
        };

        /**
         * Handle incoming messages from the browser client.
         */
        ws.on('message', async (raw: Buffer | string) => {
            try {
                const message: ClientMessage = JSON.parse(
                    typeof raw === 'string' ? raw : raw.toString()
                );

                switch (message.type) {
                    case 'start':
                        await startSession();
                        break;

                    case 'audio':
                        if (message.data && liveSession) {
                            liveSession.sendAudio(message.data);
                        }
                        break;

                    case 'text':
                        if (message.text && liveSession) {
                            liveSession.sendText(message.text);
                        }
                        break;

                    case 'stop':
                        if (liveSession) {
                            liveSession.disconnect();
                            liveSession = null;
                        }
                        sendToClient({ type: 'session_ended' });
                        break;

                    default:
                        console.warn('[MascotWS] Unknown message type:', (message as any).type);
                }
            } catch (error: any) {
                console.error('[MascotWS] Error processing message:', error.message);
                sendToClient({ type: 'error', message: 'Invalid message format' });
            }
        });

        /**
         * Clean up on client disconnect.
         */
        ws.on('close', () => {
            console.log('[MascotWS] Client disconnected');
            if (liveSession) {
                liveSession.disconnect();
                liveSession = null;
            }
        });

        ws.on('error', (error) => {
            console.error('[MascotWS] WebSocket error:', error.message);
            if (liveSession) {
                liveSession.disconnect();
                liveSession = null;
            }
        });
    });

    return wss;
}
