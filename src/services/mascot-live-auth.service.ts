import { createHmac, timingSafeEqual } from 'crypto';
import { AuthenticatedMascotLiveUser, MascotLiveRuntimeConfig } from '../types/mascot-live.types';

const ROLE_CLAIM_URI = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role';

interface MascotLiveJwtClaims {
    userId: string;
    role: string | null;
    token: string;
}

interface BillingStatusResponse {
    subscriptionTier?: string;
    SubscriptionTier?: string;
    isPremiumActive?: boolean;
    IsPremiumActive?: boolean;
    premiumExpiresAt?: string | null;
    PremiumExpiresAt?: string | null;
}

export class MascotLiveAuthConfigError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'MascotLiveAuthConfigError';
    }
}

export class MascotLiveUnauthorizedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'MascotLiveUnauthorizedError';
    }
}

export class MascotLiveAccessResolver {
    constructor(
        private readonly config: MascotLiveRuntimeConfig,
        private readonly fetchImpl: typeof fetch = fetch,
    ) {}

    async resolveAuthenticatedUser(authorizationHeader: string | undefined): Promise<AuthenticatedMascotLiveUser> {
        const claims = verifyMascotLiveAccessToken(authorizationHeader, this.config);
        const billingStatus = await this.fetchBillingStatus(claims.token);

        return {
            userId: claims.userId,
            token: claims.token,
            role: claims.role,
            subscriptionTier: billingStatus.subscriptionTier,
            isPremiumActive: billingStatus.isPremiumActive,
            premiumExpiresAt: billingStatus.premiumExpiresAt,
        };
    }

    private async fetchBillingStatus(token: string): Promise<{
        subscriptionTier: string;
        isPremiumActive: boolean;
        premiumExpiresAt: string | null;
    }> {
        const baseUrl = this.config.backendApiBaseUrl?.trim();
        if (!baseUrl) {
            return {
                subscriptionTier: 'Freemium',
                isPremiumActive: false,
                premiumExpiresAt: null,
            };
        }

        const response = await this.fetchImpl(`${baseUrl.replace(/\/+$/, '')}/api/Billing/me`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        if (response.status === 401 || response.status === 403) {
            throw new MascotLiveUnauthorizedError('Phiên đăng nhập đã hết hạn hoặc không hợp lệ.');
        }

        const payload = await this.parseResponseBody(response);
        if (!response.ok) {
            throw new MascotLiveAuthConfigError(
                `Không lấy được trạng thái gói dịch vụ từ backend (${response.status}).`,
            );
        }

        const raw = (payload ?? {}) as BillingStatusResponse;
        return {
            subscriptionTier: String(raw.subscriptionTier ?? raw.SubscriptionTier ?? 'Freemium'),
            isPremiumActive: Boolean(raw.isPremiumActive ?? raw.IsPremiumActive ?? false),
            premiumExpiresAt: String(raw.premiumExpiresAt ?? raw.PremiumExpiresAt ?? '') || null,
        };
    }

    private async parseResponseBody(response: Response): Promise<unknown> {
        const text = await response.text();
        if (!text) {
            return null;
        }

        try {
            return JSON.parse(text);
        } catch {
            return text;
        }
    }
}

export function verifyMascotLiveAccessToken(
    authorizationHeader: string | undefined,
    config: Pick<MascotLiveRuntimeConfig, 'jwtKey' | 'jwtIssuer' | 'jwtAudience'>,
): MascotLiveJwtClaims {
    const token = readBearerToken(authorizationHeader);
    const jwtKey = config.jwtKey?.trim();

    if (!jwtKey) {
        throw new MascotLiveAuthConfigError('JWT_KEY chưa được cấu hình cho mascot live.');
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
        throw new MascotLiveUnauthorizedError('Access token không đúng định dạng JWT.');
    }

    const [headerPart, payloadPart, signaturePart] = parts;
    const header = parseJsonPart(headerPart);
    const payload = parseJsonPart(payloadPart) as Record<string, unknown>;

    if (header.alg !== 'HS256') {
        throw new MascotLiveUnauthorizedError('Access token dùng thuật toán chữ ký không được hỗ trợ.');
    }

    const expectedSignature = createHmac('sha256', jwtKey)
        .update(`${headerPart}.${payloadPart}`)
        .digest();
    const actualSignature = decodeBase64Url(signaturePart);

    if (
        expectedSignature.length !== actualSignature.length
        || !timingSafeEqual(expectedSignature, actualSignature)
    ) {
        throw new MascotLiveUnauthorizedError('Chữ ký access token không hợp lệ.');
    }

    const exp = Number(payload.exp);
    if (Number.isFinite(exp) && exp <= Math.floor(Date.now() / 1000)) {
        throw new MascotLiveUnauthorizedError('Access token đã hết hạn.');
    }

    const issuer = config.jwtIssuer?.trim();
    if (issuer && payload.iss !== issuer) {
        throw new MascotLiveUnauthorizedError('Issuer của access token không hợp lệ.');
    }

    const audience = config.jwtAudience?.trim();
    if (audience) {
        const rawAud = payload.aud;
        const matchesAudience =
            rawAud === audience
            || (Array.isArray(rawAud) && rawAud.includes(audience));
        if (!matchesAudience) {
            throw new MascotLiveUnauthorizedError('Audience của access token không hợp lệ.');
        }
    }

    const userId = String(payload.UserId ?? '').trim();
    if (!userId) {
        throw new MascotLiveUnauthorizedError('Access token không chứa UserId.');
    }

    const role =
        readOptionalString(payload.role)
        || readOptionalString(payload[ROLE_CLAIM_URI])
        || null;

    return {
        userId,
        role,
        token,
    };
}

function readBearerToken(authorizationHeader: string | undefined): string {
    if (!authorizationHeader) {
        throw new MascotLiveUnauthorizedError('Bạn cần đăng nhập để trò chuyện với Sumadi.');
    }

    const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
    const token = match?.[1]?.trim();

    if (!token) {
        throw new MascotLiveUnauthorizedError('Authorization header không hợp lệ.');
    }

    return token;
}

function parseJsonPart(value: string): Record<string, unknown> {
    try {
        const decoded = decodeBase64Url(value).toString('utf8');
        const parsed = JSON.parse(decoded);
        return typeof parsed === 'object' && parsed ? parsed as Record<string, unknown> : {};
    } catch {
        throw new MascotLiveUnauthorizedError('Access token không đọc được.');
    }
}

function decodeBase64Url(value: string): Buffer {
    const normalized = value
        .replace(/-/g, '+')
        .replace(/_/g, '/')
        .padEnd(Math.ceil(value.length / 4) * 4, '=');

    return Buffer.from(normalized, 'base64');
}

function readOptionalString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value : null;
}
