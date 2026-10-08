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

export const IMAGE_SETTING_KEYS = ["IMAGE_API_KEY", "IMAGE_MODEL"] as const;
// The cheapest current image model (about 3p an image); posts need nothing more.
const DEFAULT_MODEL = "gemini-3.1-flash-lite-image";

export interface ImageConfig {
    apiKey: string;
    model: string;
    source: { IMAGE_API_KEY: "saved" | "env" | "none"; IMAGE_MODEL: "saved" | "env" | "default" };
}

export async function getImageConfig(): Promise<ImageConfig> {
    let saved: Record<string, string> = {};
    try {
        saved = await getSettings(IMAGE_SETTING_KEYS);
    } catch (err) {
        console.error("app_settings read failed, using environment:", (err as Error).message);
    }
    const envKey = import.meta.env.IMAGE_API_KEY || "";
    const envModel = import.meta.env.IMAGE_MODEL || "";
    return {
        apiKey: saved.IMAGE_API_KEY || envKey,
        model: saved.IMAGE_MODEL || envModel || DEFAULT_MODEL,
        source: {
            IMAGE_API_KEY: saved.IMAGE_API_KEY ? "saved" : envKey ? "env" : "none",
            IMAGE_MODEL: saved.IMAGE_MODEL ? "saved" : envModel ? "env" : "default",
        },
    };
}

export async function imagesConfigured(): Promise<boolean> {
    return !!(await getImageConfig()).apiKey;
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
    if (!cfg.apiKey) {
        throw new Error("Image generation is not set up: add a Gemini API key on the Settings page.");
    }

    const prompt = await generateImagePrompt({
        businessName: opts.businessName,
        summary: opts.summary,
        knowledge: opts.knowledge,
    });
    const { bytes, contentType } = await geminiImage(prompt, cfg);
    const { url } = await uploadImage(bytes, contentType);

    const id = crypto.randomUUID();
    const filename = `Generated: ${opts.summary.slice(0, 60).replace(/\s+/g, " ").trim()}`;
    await queryD1(
        "INSERT INTO post_images (id, location_name, url, filename, uploaded_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?)",
        [id, opts.locationName, url, filename.slice(0, 120), new Date().toISOString(), new Date().toISOString()]
    );
    return { id, url, filename, prompt };
}
