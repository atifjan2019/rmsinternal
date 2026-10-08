/**
 * App settings kept in D1 (table app_settings), editable from /settings.
 *
 * Each setting falls back to the environment variable of the same name, so
 * nothing changes for a deployment that has never saved a setting, and a
 * saved value wins over the environment once there is one.
 *
 * The text AI is one of two separate connections, each with its own keys:
 * Claude (Anthropic) and Agent Router (or any OpenAI-compatible API).
 * AI_PROVIDER says which one writes replies and posts.
 */
import { queryD1 } from "./storage";

export type Source = "saved" | "env" | "default" | "none";
export type AiProvider = "anthropic" | "agentrouter";

export const ANTHROPIC_KEYS = ["ANTHROPIC_API_KEY", "ANTHROPIC_MODEL"] as const;
export const AGENTROUTER_KEYS = ["AGENTROUTER_API_KEY", "AGENTROUTER_BASE_URL", "AGENTROUTER_MODEL", "AGENTROUTER_PROXY_KEY"] as const;
export const AI_SETTING_KEYS = ["AI_PROVIDER", ...ANTHROPIC_KEYS, ...AGENTROUTER_KEYS] as const;
export type AiSettingKey = (typeof AI_SETTING_KEYS)[number];

/** The keys the first version of the settings page saved; moved to the new names on first read. */
const LEGACY_KEYS = ["AI_API_KEY", "AI_BASE_URL", "AI_MODEL", "AI_PROXY_KEY"] as const;

export const ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1";

/** One text-AI connection, as the AI client uses it. */
export interface AiConfig {
    provider: AiProvider;
    apiKey: string;
    baseUrl: string;
    model: string;
    proxyKey: string;
}

/** Every connection with where each value came from, for the settings page. */
export interface AiConnections {
    /** Which connection writes replies and posts. */
    active: AiProvider;
    activeSource: Source;
    anthropic: AiConfig & { source: Record<(typeof ANTHROPIC_KEYS)[number], Source> };
    agentrouter: AiConfig & { source: Record<(typeof AGENTROUTER_KEYS)[number], Source> };
}

const DEFAULTS: Partial<Record<AiSettingKey, string>> = {
    ANTHROPIC_MODEL: "claude-sonnet-5-5",
    AGENTROUTER_BASE_URL: "https://agentrouter.org/v1",
    AGENTROUTER_MODEL: "gpt-5.6-sol",
};

/**
 * Environment fallbacks. The AI_* variables predate the split and were always
 * Agent Router (or its relay), so they feed that connection.
 */
const ENV: Partial<Record<AiSettingKey, string | undefined>> = {
    AI_PROVIDER: import.meta.env.AI_PROVIDER,
    ANTHROPIC_API_KEY: import.meta.env.ANTHROPIC_API_KEY,
    ANTHROPIC_MODEL: import.meta.env.ANTHROPIC_MODEL,
    AGENTROUTER_API_KEY: import.meta.env.AGENTROUTER_API_KEY || import.meta.env.AI_API_KEY,
    AGENTROUTER_BASE_URL: import.meta.env.AGENTROUTER_BASE_URL || import.meta.env.AI_BASE_URL,
    AGENTROUTER_MODEL: import.meta.env.AGENTROUTER_MODEL || import.meta.env.AI_MODEL,
    AGENTROUTER_PROXY_KEY: import.meta.env.AGENTROUTER_PROXY_KEY || import.meta.env.AI_PROXY_KEY,
};

export async function getSettings(keys: readonly string[]): Promise<Record<string, string>> {
    const placeholders = keys.map(() => "?").join(", ");
    const { results } = await queryD1(
        `SELECT key, value FROM app_settings WHERE key IN (${placeholders})`,
        [...keys],
    );
    const out: Record<string, string> = {};
    for (const row of results as { key: string; value: string }[]) out[row.key] = row.value ?? "";
    return out;
}

export async function setSetting(key: string, value: string): Promise<void> {
    await queryD1(
        `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [key, value, new Date().toISOString()],
    );
}

export async function deleteSetting(key: string): Promise<void> {
    await queryD1(`DELETE FROM app_settings WHERE key = ?`, [key]);
}

/**
 * Moves settings saved under the old single-connection names to the
 * connection they belong to, once, and removes the old rows. A Claude base
 * URL means they were a Claude connection; anything else was Agent Router.
 */
async function migrateLegacy(saved: Record<string, string>): Promise<Record<string, string>> {
    const legacy = await getSettings(LEGACY_KEYS);
    if (!Object.keys(legacy).length) return saved;
    const isClaude = /^https:\/\/api\.anthropic\.com(\/|$)/i.test(legacy.AI_BASE_URL || "");
    const moves: Record<string, string> = isClaude
        ? { ANTHROPIC_API_KEY: legacy.AI_API_KEY, ANTHROPIC_MODEL: legacy.AI_MODEL, AI_PROVIDER: "anthropic" }
        : {
              AGENTROUTER_API_KEY: legacy.AI_API_KEY,
              AGENTROUTER_BASE_URL: legacy.AI_BASE_URL,
              AGENTROUTER_MODEL: legacy.AI_MODEL,
              AGENTROUTER_PROXY_KEY: legacy.AI_PROXY_KEY,
              AI_PROVIDER: "agentrouter",
          };
    const out = { ...saved };
    for (const [key, value] of Object.entries(moves)) {
        if (!value || out[key]) continue;
        await setSetting(key, value);
        out[key] = value;
    }
    for (const key of LEGACY_KEYS) if (key in legacy) await deleteSetting(key);
    return out;
}

/** Every text-AI connection as it stands: saved settings first, then the environment, then defaults. */
export async function getAiConnections(): Promise<AiConnections> {
    let saved: Record<string, string> = {};
    try {
        saved = await migrateLegacy(await getSettings(AI_SETTING_KEYS));
    } catch (err) {
        // A missing table (migration not yet run) must not take the AI down: fall back to env.
        console.error("app_settings read failed, using environment:", (err as Error).message);
    }
    const pick = (key: AiSettingKey): [string, Source] => {
        if (saved[key]) return [saved[key], "saved"];
        if (ENV[key]) return [ENV[key] as string, "env"];
        if (DEFAULTS[key]) return [DEFAULTS[key] as string, "default"];
        return ["", "none"];
    };
    const [aKey, aKeySrc] = pick("ANTHROPIC_API_KEY");
    const [aModel, aModelSrc] = pick("ANTHROPIC_MODEL");
    const [rKey, rKeySrc] = pick("AGENTROUTER_API_KEY");
    const [rBase, rBaseSrc] = pick("AGENTROUTER_BASE_URL");
    const [rModel, rModelSrc] = pick("AGENTROUTER_MODEL");
    const [rProxy, rProxySrc] = pick("AGENTROUTER_PROXY_KEY");

    // Nothing chosen yet: use whichever connection has a key, Claude first.
    let [activeText, activeSource] = pick("AI_PROVIDER");
    let active: AiProvider;
    if (activeText === "anthropic" || activeText === "agentrouter") active = activeText;
    else {
        active = aKey ? "anthropic" : rKey ? "agentrouter" : "anthropic";
        activeSource = "default";
    }

    return {
        active,
        activeSource,
        anthropic: {
            provider: "anthropic",
            apiKey: aKey,
            baseUrl: ANTHROPIC_BASE_URL,
            model: aModel,
            proxyKey: "",
            source: { ANTHROPIC_API_KEY: aKeySrc, ANTHROPIC_MODEL: aModelSrc },
        },
        agentrouter: {
            provider: "agentrouter",
            apiKey: rKey,
            baseUrl: rBase.replace(/\/$/, ""),
            model: rModel,
            proxyKey: rProxy,
            source: { AGENTROUTER_API_KEY: rKeySrc, AGENTROUTER_BASE_URL: rBaseSrc, AGENTROUTER_MODEL: rModelSrc, AGENTROUTER_PROXY_KEY: rProxySrc },
        },
    };
}

/** The connection that writes replies and posts right now. */
export async function getAiConfig(): Promise<AiConfig> {
    const all = await getAiConnections();
    const { source: _s, ...cfg } = all[all.active];
    return cfg;
}

/** A key as the settings page may show it: last four characters only. */
export function maskSecret(value: string): string {
    if (!value) return "";
    return value.length <= 8 ? "••••" : `••••••••${value.slice(-4)}`;
}
