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

export const IMAGE_SETTING_KEYS = ["IMAGE_PROVIDER", "IMAGE_API_KEY", "IMAGE_MODEL", "CF_AI_ACCOUNT_ID", "CF_AI_TOKEN"] as const;
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
    };
    const defaults: Record<string, string> = { IMAGE_PROVIDER: "cloudflare", IMAGE_MODEL: "" };
    const pick = (key: (typeof IMAGE_SETTING_KEYS)[number]): [string, Source] =>
        saved[key] ? [saved[key], "saved"] : env[key] ? [env[key], "env"] : defaults[key] ? [defaults[key], "default"] : ["", "none"];
    const [provider, s1] = pick("IMAGE_PROVIDER");
    const [apiKey, s2] = pick("IMAGE_API_KEY");
    const [model, s3] = pick("IMAGE_MODEL");
    const [cfAccountId, s4] = pick("CF_AI_ACCOUNT_ID");
    const [cfToken, s5] = pick("CF_AI_TOKEN");
    const p: ImageProvider = provider === "gemini" ? "gemini" : "cloudflare";
    return {
        provider: p,
        apiKey,
        model: model || (p === "gemini" ? DEFAULT_MODEL : CF_MODEL),
        cfAccountId,
        cfToken,
        source: { IMAGE_PROVIDER: s1, IMAGE_API_KEY: s2, IMAGE_MODEL: model ? s3 : "default", CF_AI_ACCOUNT_ID: s4, CF_AI_TOKEN: s5 },
    };
}

/** Whether the chosen provider has what it needs. */
export function imageProviderReady(cfg: ImageConfig): boolean {
    return cfg.provider === "gemini" ? !!cfg.apiKey : !!(cfg.cfAccountId && cfg.cfToken);
}

export async function imagesConfigured(): Promise<boolean> {
    return imageProviderReady(await getImageConfig());
}

/** One image from Cloudflare Workers AI (FLUX.1 schnell): free daily allowance, JPEG back as base64. */
async function cloudflareImage(prompt: string, cfg: ImageConfig): Promise<{ bytes: ArrayBuffer; contentType: string }> {
    const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(cfg.cfAccountId)}/ai/run/${cfg.model}`,
        {
            method: "POST",
            headers: { Authorization: `Bearer ${cfg.cfToken}`, "Content-Type": "application/json" },
            // The model takes up to 2048 characters; 8 steps is its best quality.
            body: JSON.stringify({ prompt: prompt.slice(0, 2000), steps: 8 }),
        }
    );
    const raw = await res.text();
    let data: any = {};
    try {
        data = JSON.parse(raw);
    } catch {
        throw new Error(`Image API returned non-JSON (HTTP ${res.status}): ${raw.slice(0, 200)}`);
    }
    if (!res.ok || data.success === false) {
        const msg = data.errors?.map((e: any) => e.message).join("; ") || `HTTP ${res.status}`;
        throw new Error(`Image generation failed: ${msg}`);
    }
    const b64 = data.result?.image || data.image;
    if (!b64) throw new Error(`Image generation returned no image: ${raw.slice(0, 200)}`);
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes: bytes.buffer, contentType: "image/jpeg" };
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

    const prompt = await generateImagePrompt({
        businessName: opts.businessName,
        summary: opts.summary,
        knowledge: opts.knowledge,
    });
    const { bytes, contentType } = cfg.provider === "gemini" ? await geminiImage(prompt, cfg) : await cloudflareImage(prompt, cfg);
    const { url } = await uploadImage(bytes, contentType);

    const id = crypto.randomUUID();
    const filename = `Generated: ${opts.summary.slice(0, 60).replace(/\s+/g, " ").trim()}`;
    await queryD1(
        "INSERT INTO post_images (id, location_name, url, filename, uploaded_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?)",
        [id, opts.locationName, url, filename.slice(0, 120), new Date().toISOString(), new Date().toISOString()]
    );
    return { id, url, filename, prompt };
}
