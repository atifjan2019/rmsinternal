/**
 * Post image generation with Gemini's image models ("Nano Banana"), through
 * the Gemini API's Interactions endpoint. (Imagen was shut down in that API.)
 *
 * Settings (from /settings, falling back to the environment): IMAGE_API_KEY
 * (a Gemini API key from aistudio.google.com) and IMAGE_MODEL. A generated
 * image is uploaded to R2 like an uploaded one and joins the business's
 * library, so it rotates into later posts too.
 */
import { generateImagePrompt } from "./ai";
import { uploadImage } from "./r2";
import { getSettings } from "./settings";
import { queryD1 } from "./storage";

export const IMAGE_SETTING_KEYS = ["IMAGE_PROVIDER", "IMAGE_API_KEY", "IMAGE_MODEL", "CF_AI_ACCOUNT_ID", "CF_AI_TOKEN", "IMAGE_DAILY_LIMIT"] as const;
// Cloudflare's free allowance is 10,000 neurons a day, reset at midnight UTC,
// and one image at the default settings costs about 58, so around 170 would
// fit. A lower cap keeps the account well inside it with room for other use.
export const DEFAULT_DAILY_LIMIT = 100;
// The cheapest current image model (about 3p an image); posts need nothing more.
const DEFAULT_MODEL = "gemini-3.1-flash-lite-image";

export type ImageProvider = "gemini" | "cloudflare";
type Source = "saved" | "env" | "default" | "none";

export interface ImageConfig {
    /** Which service draws the pictures. Cloudflare has a free daily allowance; Gemini needs a paid key. */
    provider: ImageProvider;
    apiKey: string;
    model: string;
    cfAccountId: string;
    cfToken: string;
    /** Generated images allowed per UTC day, across all businesses. */
    dailyLimit: number;
    source: Record<(typeof IMAGE_SETTING_KEYS)[number], Source>;
}
const CF_MODEL = "@cf/black-forest-labs/flux-1-schnell";

export async function getImageConfig(): Promise<ImageConfig> {
    let saved: Record<string, string> = {};
    try {
        saved = await getSettings(IMAGE_SETTING_KEYS);
    } catch (err) {
        console.error("app_settings read failed, using environment:", (err as Error).message);
    }
    const env: Record<string, string> = {
        IMAGE_PROVIDER: import.meta.env.IMAGE_PROVIDER || "",
        IMAGE_API_KEY: import.meta.env.IMAGE_API_KEY || "",
        IMAGE_MODEL: import.meta.env.IMAGE_MODEL || "",
        // The D1 account is the same Cloudflare account, so it is the default.
        CF_AI_ACCOUNT_ID: import.meta.env.CF_AI_ACCOUNT_ID || import.meta.env.CF_ACCOUNT_ID || "",
        CF_AI_TOKEN: import.meta.env.CF_AI_TOKEN || "",
        IMAGE_DAILY_LIMIT: import.meta.env.IMAGE_DAILY_LIMIT || "",
    };
    const defaults: Record<string, string> = { IMAGE_PROVIDER: "cloudflare", IMAGE_MODEL: "" };
    const pick = (key: (typeof IMAGE_SETTING_KEYS)[number]): [string, Source] =>
        saved[key] ? [saved[key], "saved"] : env[key] ? [env[key], "env"] : defaults[key] ? [defaults[key], "default"] : ["", "none"];
    const [provider, s1] = pick("IMAGE_PROVIDER");
    const [apiKey, s2] = pick("IMAGE_API_KEY");
    const [model, s3] = pick("IMAGE_MODEL");
    const [cfAccountId, s4] = pick("CF_AI_ACCOUNT_ID");
    const [cfToken, s5] = pick("CF_AI_TOKEN");
    const [limitText, s6] = pick("IMAGE_DAILY_LIMIT");
    const parsed = parseInt(limitText, 10);
    const dailyLimit = Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_DAILY_LIMIT;
    const p: ImageProvider = provider === "gemini" ? "gemini" : "cloudflare";
    return {
        provider: p,
        apiKey,
        model: model || (p === "gemini" ? DEFAULT_MODEL : CF_MODEL),
        cfAccountId,
        cfToken,
        dailyLimit,
        source: { IMAGE_PROVIDER: s1, IMAGE_API_KEY: s2, IMAGE_MODEL: model ? s3 : "default", CF_AI_ACCOUNT_ID: s4, CF_AI_TOKEN: s5, IMAGE_DAILY_LIMIT: limitText ? s6 : "default" },
    };
}

/** Today's date as Cloudflare counts its allowance: UTC. */
const utcDay = () => new Date().toISOString().slice(0, 10);

/** How many images have been generated today (UTC). */
export async function imagesUsedToday(): Promise<number> {
    const { results } = await queryD1("SELECT count FROM image_usage WHERE day = ?", [utcDay()]);
    return Number((results[0] as any)?.count || 0);
}

async function recordImageUse(): Promise<void> {
    await queryD1(
        "INSERT INTO image_usage (day, count) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET count = count + 1",
        [utcDay()]
    );
}

/** Whether the chosen provider has what it needs. */
export function imageProviderReady(cfg: ImageConfig): boolean {
    return cfg.provider === "gemini" ? !!cfg.apiKey : !!(cfg.cfAccountId && cfg.cfToken);
}

export async function imagesConfigured(): Promise<boolean> {
    return imageProviderReady(await getImageConfig());
}

/** What the settings page learns from a connection check. */
export interface ImageCheck {
    ok: boolean;
    detail: string;
}

/**
 * Checks one picture service's credentials without drawing anything, so a
 * check costs no allowance: Cloudflare's model catalogue and Gemini's model
 * list both need a valid key and nothing more.
 */
export async function testImageConnection(provider: ImageProvider, cfg: ImageConfig): Promise<ImageCheck> {
    const read = async (res: Response) => {
        const raw = await res.text();
        try {
            return { raw, data: JSON.parse(raw) };
        } catch {
            throw new Error(`Returned non-JSON (HTTP ${res.status}): ${raw.slice(0, 160)}`);
        }
    };
    if (provider === "cloudflare") {
        if (!cfg.cfAccountId || !cfg.cfToken) throw new Error("Add the Cloudflare account ID and a Workers AI token first.");
        const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(cfg.cfAccountId)}/ai/models/search?search=flux&per_page=5`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${cfg.cfToken}` } });
        const { data } = await read(res);
        if (!res.ok || data.success === false) {
            throw new Error(data.errors?.map((e: any) => e.message).join("; ") || `HTTP ${res.status}`);
        }
        const names: string[] = (data.result || []).map((m: any) => m.name);
        const model = cfg.model || CF_MODEL;
        if (names.length && !names.includes(model)) {
            return { ok: true, detail: `Token works, but the model ${model} was not in Cloudflare's list; pictures may fail.` };
        }
        return { ok: true, detail: `Token works. Model ${model} is available.` };
    }
    if (!cfg.apiKey) throw new Error("Add a Gemini API key first.");
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
        headers: { "x-goog-api-key": cfg.apiKey },
    });
    const { data } = await read(res);
    if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
    const names: string[] = (data.models || []).map((m: any) => String(m.name || "").replace(/^models\//, ""));
    const model = cfg.model || DEFAULT_MODEL;
    if (names.length && !names.includes(model)) {
        return { ok: true, detail: `Key works, but the model ${model} was not in Google's list; pictures may fail.` };
    }
    return { ok: true, detail: `Key works. Model ${model} is available.` };
}

/** One image from Cloudflare Workers AI (FLUX.1 schnell): free daily allowance, JPEG back as base64. */
async function cloudflareImage(prompt: string, cfg: ImageConfig): Promise<{ bytes: ArrayBuffer; contentType: string }> {
    const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(cfg.cfAccountId)}/ai/run/${cfg.model}`;
    // The model's own default of 4 steps; more, and long prompts, make its
    // runner fail ("Cog prediction failed"), which is also why a failed run is
    // tried once more before giving up.
    const body = JSON.stringify({ prompt: prompt.slice(0, 900), steps: 4 });
    let lastError = "";
    for (let attempt = 0; attempt < 2; attempt++) {
        const res = await fetch(url, {
            method: "POST",
            headers: { Authorization: `Bearer ${cfg.cfToken}`, "Content-Type": "application/json" },
            body,
        });
        const raw = await res.text();
        let data: any = {};
        try {
            data = JSON.parse(raw);
        } catch {
            throw new Error(`Image API returned non-JSON (HTTP ${res.status}): ${raw.slice(0, 200)}`);
        }
        if (res.ok && data.success !== false) {
            const b64 = data.result?.image || data.image;
            if (!b64) throw new Error(`Image generation returned no image: ${raw.slice(0, 200)}`);
            const bin = atob(b64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            return { bytes: bytes.buffer, contentType: "image/jpeg" };
        }
        lastError = data.errors?.map((e: any) => e.message).join("; ") || `HTTP ${res.status}`;
        // Only the runner's own hiccup is worth a second go; a bad token or account is not.
        if (!/prediction failed|internal|timed? ?out|unavailable|503|500/i.test(lastError)) break;
    }
    throw new Error(`Image generation failed: ${lastError}`);
}

/** One image from Gemini (Nano Banana) through the Interactions API, as bytes plus its type. */
async function geminiImage(prompt: string, cfg: ImageConfig): Promise<{ bytes: ArrayBuffer; contentType: string }> {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
        method: "POST",
        headers: { "x-goog-api-key": cfg.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
            model: cfg.model,
            input: [{ type: "text", text: prompt }],
            // Google shows post images at about 4:3, which this crops least; 1K
            // is plenty for a post and the cheapest size.
            response_format: { type: "image", mime_type: "image/jpeg", aspect_ratio: "4:3", image_size: "1K", delivery: "inline" },
        }),
    });
    const raw = await res.text();
    let data: any = {};
    try {
        data = JSON.parse(raw);
    } catch {
        throw new Error(`Image API returned non-JSON (HTTP ${res.status}): ${raw.slice(0, 200)}`);
    }
    if (!res.ok) {
        throw new Error(`Image generation failed: ${data.error?.message || `HTTP ${res.status}`}`);
    }

    // The image block sits in a model_output step's content; a convenience
    // field may carry it too, so both are read.
    const blocks: any[] = [];
    if (data.output_image?.data) blocks.push(data.output_image);
    for (const step of data.steps || []) {
        for (const block of step.content || []) if (block?.type === "image" && block.data) blocks.push(block);
    }
    const image = blocks[0];
    if (!image) {
        const text = (data.steps || [])
            .flatMap((s: any) => s.content || [])
            .filter((b: any) => b?.type === "text")
            .map((b: any) => b.text)
            .join(" ")
            .slice(0, 200);
        throw new Error(`Image generation returned no image${text ? `: ${text}` : " (the prompt may have been filtered)"}`);
    }
    const bin = atob(image.data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes: bytes.buffer, contentType: image.mime_type || "image/jpeg" };
}

export interface GeneratedImage {
    id: string;
    url: string;
    filename: string;
    prompt: string;
}

/**
 * Writes a photo description for a post, generates the image, stores it and
 * adds it to the business's library. `topic` is the post's subject, used when
 * the description is written; the post's own text gives the detail.
 */
export async function generatePostImage(opts: {
    locationName: string;
    businessName: string;
    summary: string;
    knowledge?: string;
}): Promise<GeneratedImage> {
    const cfg = await getImageConfig();
    if (!imageProviderReady(cfg)) {
        throw new Error(
            cfg.provider === "gemini"
                ? "Image generation is not set up: add a Gemini API key on the Settings page."
                : "Image generation is not set up: add your Cloudflare account ID and a Workers AI token on the Settings page."
        );
    }

    // The cap is checked before any work is done, so a day that is full costs
    // nothing further (not even the text model's brief).
    const used = await imagesUsedToday();
    if (used >= cfg.dailyLimit) {
        throw new Error(
            `Today's limit of ${cfg.dailyLimit} generated images is used up (${used} made). It resets at midnight UTC; the limit can be changed on the Settings page.`
        );
    }

    const prompt = await generateImagePrompt({
        businessName: opts.businessName,
        summary: opts.summary,
        knowledge: opts.knowledge,
    });
    const { bytes, contentType } = cfg.provider === "gemini" ? await geminiImage(prompt, cfg) : await cloudflareImage(prompt, cfg);
    const { url } = await uploadImage(bytes, contentType);
    await recordImageUse();

    const id = crypto.randomUUID();
    const filename = `Generated: ${opts.summary.slice(0, 60).replace(/\s+/g, " ").trim()}`;
    await queryD1(
        "INSERT INTO post_images (id, location_name, url, filename, uploaded_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?)",
        [id, opts.locationName, url, filename.slice(0, 120), new Date().toISOString(), new Date().toISOString()]
    );
    return { id, url, filename, prompt };
}
