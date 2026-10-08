import type { APIRoute } from "astro";
import { verifySession } from "../../lib/auth";
import { AI_SETTING_KEYS, deleteSetting, getAiConfig, maskSecret, setSetting, type AiSettingKey } from "../../lib/settings";
import { testAiConnection } from "../../lib/ai";
import { IMAGE_SETTING_KEYS, getImageConfig } from "../../lib/images";

const SECRET_KEYS: AiSettingKey[] = ["AI_API_KEY", "AI_PROXY_KEY"];
const ALL_KEYS: readonly string[] = [...AI_SETTING_KEYS, ...IMAGE_SETTING_KEYS];

async function checkAuth(request: Request): Promise<boolean> {
    const cookies = request.headers.get("cookie") || "";
    const match = cookies.match(/admin_session=([^;]+)/);
    return !!(await verifySession(match ? match[1] : undefined));
}

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** The AI connection as it stands, with secrets masked to their last four characters. */
async function describe() {
    const cfg = await getAiConfig();
    const img = await getImageConfig();
    return {
        AI_API_KEY: { value: maskSecret(cfg.apiKey), set: !!cfg.apiKey, source: cfg.source.AI_API_KEY },
        AI_BASE_URL: { value: cfg.baseUrl, set: !!cfg.baseUrl, source: cfg.source.AI_BASE_URL },
        AI_MODEL: { value: cfg.model, set: !!cfg.model, source: cfg.source.AI_MODEL },
        AI_PROXY_KEY: { value: maskSecret(cfg.proxyKey), set: !!cfg.proxyKey, source: cfg.source.AI_PROXY_KEY },
        IMAGE_API_KEY: { value: maskSecret(img.apiKey), set: !!img.apiKey, source: img.source.IMAGE_API_KEY },
        IMAGE_MODEL: { value: img.model, set: !!img.model, source: img.source.IMAGE_MODEL },
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
            if (key === "AI_BASE_URL" && value && !/^https?:\/\//i.test(value)) {
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
 * Tests a connection. Secrets left blank in the request mean "use what is
 * saved", so the current key can be tested without being typed again.
 */
export const POST: APIRoute = async ({ request }) => {
    if (!(await checkAuth(request))) return json({ error: "Unauthorized" }, 401);
    let body: Record<string, unknown> = {};
    try {
        body = await request.json();
    } catch {
        /* an empty body tests the saved connection */
    }
    try {
        const current = await getAiConfig();
        const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");
        const cfg = {
            ...current,
            apiKey: str("AI_API_KEY") || current.apiKey,
            baseUrl: (str("AI_BASE_URL") || current.baseUrl).replace(/\/$/, ""),
            model: str("AI_MODEL") || current.model,
            proxyKey: SECRET_KEYS.includes("AI_PROXY_KEY") && "AI_PROXY_KEY" in body && !str("AI_PROXY_KEY")
                ? current.proxyKey
                : str("AI_PROXY_KEY") || current.proxyKey,
        };
        const started = Date.now();
        const reply = await testAiConnection(cfg);
        return json({ ok: true, reply, ms: Date.now() - started, model: cfg.model, baseUrl: cfg.baseUrl });
    } catch (err: any) {
        return json({ ok: false, error: err.message || "Test failed" });
    }
};
