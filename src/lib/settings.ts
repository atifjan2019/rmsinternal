/**
 * App settings kept in D1 (table app_settings), editable from /settings.
 *
 * Each setting falls back to the environment variable of the same name, so
 * nothing changes for a deployment that has never saved a setting, and a
 * saved value wins over the environment once there is one.
 */
import { queryD1 } from "./storage";

export const AI_SETTING_KEYS = ["AI_API_KEY", "AI_BASE_URL", "AI_MODEL", "AI_PROXY_KEY"] as const;
export type AiSettingKey = (typeof AI_SETTING_KEYS)[number];

export interface AiConfig {
    apiKey: string;
    baseUrl: string;
    model: string;
    proxyKey: string;
    /** Where each value came from, for the settings page. */
    source: Record<AiSettingKey, "saved" | "env" | "default" | "none">;
}

const DEFAULTS: Record<AiSettingKey, string> = {
    AI_API_KEY: "",
    AI_BASE_URL: "https://agentrouter.org/v1",
    AI_MODEL: "gpt-5.6-sol",
    AI_PROXY_KEY: "",
};

const ENV: Record<AiSettingKey, string | undefined> = {
    AI_API_KEY: import.meta.env.AI_API_KEY,
    AI_BASE_URL: import.meta.env.AI_BASE_URL,
    AI_MODEL: import.meta.env.AI_MODEL,
    AI_PROXY_KEY: import.meta.env.AI_PROXY_KEY,
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

/** The AI connection as it stands now: saved settings first, then the environment, then defaults. */
export async function getAiConfig(): Promise<AiConfig> {
    let saved: Record<string, string> = {};
    try {
        saved = await getSettings(AI_SETTING_KEYS);
    } catch (err) {
        // A missing table (migration not yet run) must not take the AI down: fall back to env.
        console.error("app_settings read failed, using environment:", (err as Error).message);
    }
    const pick = (key: AiSettingKey): [string, AiConfig["source"][AiSettingKey]] => {
        if (saved[key]) return [saved[key], "saved"];
        if (ENV[key]) return [ENV[key] as string, "env"];
        if (DEFAULTS[key]) return [DEFAULTS[key], "default"];
        return ["", "none"];
    };
    const [apiKey, s1] = pick("AI_API_KEY");
    const [baseUrl, s2] = pick("AI_BASE_URL");
    const [model, s3] = pick("AI_MODEL");
    const [proxyKey, s4] = pick("AI_PROXY_KEY");
    return {
        apiKey,
        baseUrl: baseUrl.replace(/\/$/, ""),
        model,
        proxyKey,
        source: { AI_API_KEY: s1, AI_BASE_URL: s2, AI_MODEL: s3, AI_PROXY_KEY: s4 },
    };
}

/** A key as the settings page may show it: last four characters only. */
export function maskSecret(value: string): string {
    if (!value) return "";
    return value.length <= 8 ? "••••" : `••••••••${value.slice(-4)}`;
}
