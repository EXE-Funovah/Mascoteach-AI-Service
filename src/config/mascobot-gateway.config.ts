import { MascobotGatewayConfig } from '../types/mascobot.types';

export function getMascobotGatewayConfig(): MascobotGatewayConfig {
    return {
        responseAudioBaseUrl: process.env.MASCOBOT_RESPONSE_AUDIO_BASE_URL?.trim(),
        testAudioUrl: process.env.MASCOBOT_TEST_AUDIO_URL?.trim(),
    };
}

