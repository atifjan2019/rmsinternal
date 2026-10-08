import type { APIRoute } from "astro";
import { verifySession } from "../../lib/auth";
import {
    AI_SETTING_KEYS,
    ANTHROPIC_BASE_URL,
    deleteSetting,
    getAiConnections,
    maskSecret,
    setSetting,
    type AiConfig,
    type AiProvider,
} from "../../lib/settings";
import { testAiConnection } from "../../lib/ai";
import { IMAGE_SETTING_KEYS, getImageConfig, imageProviderReady, imagesUsedToday, testImageConnection, type ImageProvider } from "../../lib/images";

const SECRET_KEYS = new Set(["ANTHROPIC_API_KEY", "AGENTROUTER_API_KEY", "AGENTROUTER_PROXY_KEY", "IMAGE_API_KEY", "CF_AI_TOKEN"]);
const ALL_KEYS: readonly string[] = [...AI_SETTING_KEYS, ...IMAGE_SETTING_KEYS];

type Connection = AiProvider | ImageProvider;
const CONNECTIONS: Connection[] = ["anthropic", "agentrouter", "cloudflare", "gemini"];

async function checkAuth(request: Request): Promise<boolean> {
    const cookies = request.headers.get("cookie") || "";
    const match = cookies.match(/admin_session=([^;]+)/);
    return !!(await verifySession(match ? match[1] : undefined));
}

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const field = (value: string, source: string, secret = false) => ({ value: secret ? maskSecret(value) : value, set: !!value, source });

/**
 * Every connection as it stands, with secrets masked to their last four
 * characters, plus which connection is in use for text and for pictures.
 */
async function describe() {
    const ai = await getAiConnections();
    const img = await getImageConfig();
    const a = ai.anthropic;
    const r = ai.agentrouter;
    return {
        text: { active: ai.active, source: ai.activeSource },
        pictures: { active: img.provider, source: img.source.IMAGE_PROVIDER },
        connections: {
            anthropic: {
                configured: !!a.apiKey,
                fields: {
                    ANTHROPIC_API_KEY: field(a.apiKey, a.source.ANTHROPIC_API_KEY, true),
                    ANTHROPIC_MODEL: field(a.model, a.source.ANTHROPIC_MODEL),
                },
            },
            agentrouter: {
                configured: !!r.apiKey,
                fields: {
                    AGENTROUTER_API_KEY: field(r.apiKey, r.source.AGENTROUTER_API_KEY, true),
                    AGENTROUTER_BASE_URL: field(r.baseUrl, r.source.AGENTROUTER_BASE_URL),
                    AGENTROUTER_MODEL: field(r.model, r.source.AGENTROUTER_MODEL),
                    AGENTROUTER_PROXY_KEY: field(r.proxyKey, r.source.AGENTROUTER_PROXY_KEY, true),
                },
            },
            cloudflare: {
                configured: !!(img.cfAccountId && img.cfToken),
                fields: {
                    CF_AI_ACCOUNT_ID: field(img.cfAccountId, img.source.CF_AI_ACCOUNT_ID),
                    CF_AI_TOKEN: field(img.cfToken, img.source.CF_AI_TOKEN, true),
                },
            },
            gemini: {
                configured: !!img.apiKey,
                fields: {
                    IMAGE_API_KEY: field(img.apiKey, img.source.IMAGE_API_KEY, true),
                    IMAGE_MODEL: field(img.provider === "gemini" ? img.model : "", img.source.IMAGE_MODEL),
                },
            },
        },
        limits: {
            IMAGE_DAILY_LIMIT: field(String(img.dailyLimit), img.source.IMAGE_DAILY_LIMIT),
            usage: { today: await imagesUsedToday().catch(() => 0), limit: img.dailyLimit },
            picturesReady: imageProviderReady(img),
        },
    };
}

export const GET: APIRoute = async ({ request }) => {
    if (!(await checkAuth(request))) return json({ error: "Unauthorized" }, 401);
    try {
        return json(await describe());
    } catch (err: any) {
        return json({ error: err.message || "Could not read settings" }, 500);
    }
};

/**
 * Saves the fields sent. A field left out is untouched; an empty string
 * removes the saved value so the environment variable applies again. Secrets
 * are only ever accepted here, never echoed back in full.
 */
export const PUT: APIRoute = async ({ request }) => {
    if (!(await checkAuth(request))) return json({ error: "Unauthorized" }, 401);
    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return json({ error: "Invalid JSON" }, 400);
    }
    try {
        for (const key of ALL_KEYS) {
            if (!(key in body)) continue;
            const value = typeof body[key] === "string" ? (body[key] as string).trim() : "";
            if (key === "AI_PROVIDER" && value && value !== "anthropic" && value !== "agentrouter") {
                return json({ error: "The text AI must be anthropic or agentrouter" }, 400);
            }
            if (key === "IMAGE_PROVIDER" && value && value !== "gemini" && value !== "cloudflare") {
                return json({ error: "The picture service must be cloudflare or gemini" }, 400);
            }
            if (key === "IMAGE_DAILY_LIMIT" && value && !/^\d{1,4}$/.test(value)) {
                return json({ error: "The daily image limit must be a whole number" }, 400);
            }
            if (key === "AGENTROUTER_BASE_URL" && value && !/^https?:\/\//i.test(value)) {
                return json({ error: "The base URL must start with http:// or https://" }, 400);
            }
            if (value) await setSetting(key, value);
            else await deleteSetting(key);
        }
        return json(await describe());
    } catch (err: any) {
        return json({ error: err.message || "Could not save settings" }, 500);
    }
};

/**
 * Tests one connection, named by `connection`. Secrets left blank in the
 * request mean "use what is saved", so a saved key can be tested without
 * being typed again. Nothing is saved.
 */
export const POST: APIRoute = async ({ request }) => {
    if (!(await checkAuth(request))) return json({ error: "Unauthorized" }, 401);
    let body: Record<string, unknown> = {};
    try {
        body = await request.json();
    } catch {
        /* an empty body tests the saved connection */
    }
    const connection = body.connection as Connection;
    if (!CONNECTIONS.includes(connection)) return json({ error: "Unknown connection" }, 400);
    const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");
    const started = Date.now();
    try {
        if (connection === "anthropic" || connection === "agentrouter") {
            const all = await getAiConnections();
            const saved = all[connection];
            const cfg: AiConfig =
                connection === "anthropic"
                    ? {
                          provider: "anthropic",
                          apiKey: str("ANTHROPIC_API_KEY") || saved.apiKey,
                          baseUrl: ANTHROPIC_BASE_URL,
                          model: str("ANTHROPIC_MODEL") || saved.model,
                          proxyKey: "",
                      }
                    : {
                          provider: "agentrouter",
                          apiKey: str("AGENTROUTER_API_KEY") || saved.apiKey,
                          baseUrl: (str("AGENTROUTER_BASE_URL") || saved.baseUrl).replace(/\/$/, ""),
                          model: str("AGENTROUTER_MODEL") || saved.model,
                          proxyKey: str("AGENTROUTER_PROXY_KEY") || saved.proxyKey,
                      };
            if (!cfg.apiKey) return json({ ok: false, error: "No API key yet." });
            const reply = await testAiConnection(cfg);
            return json({ ok: true, ms: Date.now() - started, detail: `${cfg.model} replied: "${reply}"` });
        }
        const img = await getImageConfig();
        const cfg = {
            ...img,
            provider: connection,
            apiKey: str("IMAGE_API_KEY") || img.apiKey,
            model: str("IMAGE_MODEL") || (img.provider === connection ? img.model : ""),
            cfAccountId: str("CF_AI_ACCOUNT_ID") || img.cfAccountId,
            cfToken: str("CF_AI_TOKEN") || img.cfToken,
        };
        const result = await testImageConnection(connection, cfg);
        return json({ ok: result.ok, ms: Date.now() - started, detail: result.detail });
    } catch (err: any) {
        return json({ ok: false, ms: Date.now() - started, error: (err.message || "Test failed").replace(/^AI connection test failed: /, "") });
    }
};
