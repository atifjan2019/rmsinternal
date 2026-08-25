/**
 * Post image storage on Cloudflare R2.
 *
 * The bucket is public because Google fetches a post's image anonymously.
 * Writes go through a small Worker holding the R2 binding (see the
 * rms-post-images worker), so no S3 keys need to live in this app — only the
 * shared upload key.
 */

const UPLOAD_URL = (import.meta.env.R2_UPLOAD_URL || "").replace(/\/$/, "");
const UPLOAD_KEY = import.meta.env.R2_UPLOAD_KEY;
const PUBLIC_URL = (import.meta.env.R2_PUBLIC_URL || "").replace(/\/$/, "");

export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
};

export function r2Configured(): boolean {
    return !!(UPLOAD_URL && UPLOAD_KEY && PUBLIC_URL);
}

export function r2ConfigError(): string | null {
    if (r2Configured()) return null;
    const missing = [
        !UPLOAD_URL && "R2_UPLOAD_URL",
        !UPLOAD_KEY && "R2_UPLOAD_KEY",
        !PUBLIC_URL && "R2_PUBLIC_URL",
    ].filter(Boolean);
    return `Image storage not configured — missing ${missing.join(", ")}.`;
}

/** Uploads bytes and returns the public URL Google will fetch. */
export async function uploadImage(
    bytes: ArrayBuffer,
    contentType: string
): Promise<{ url: string; key: string }> {
    if (!r2Configured()) throw new Error(r2ConfigError()!);

    const ext = ALLOWED_IMAGE_TYPES[contentType];
    if (!ext) throw new Error(`Unsupported image type: ${contentType}. Use JPEG, PNG or WebP.`);

    // Key is minted here, never taken from the client; the Worker enforces this shape.
    const key = `posts/${crypto.randomUUID()}.${ext}`;

    const res = await fetch(`${UPLOAD_URL}/${key}`, {
        method: "PUT",
        headers: {
            "x-upload-key": UPLOAD_KEY,
            "Content-Type": contentType,
        },
        body: bytes,
    });

    if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`Image upload failed (HTTP ${res.status}): ${detail.slice(0, 200)}`);
    }

    return { url: `${PUBLIC_URL}/${key}`, key };
}

export async function deleteImage(key: string): Promise<void> {
    if (!r2Configured()) throw new Error(r2ConfigError()!);

    const res = await fetch(`${UPLOAD_URL}/${key}`, {
        method: "DELETE",
        headers: { "x-upload-key": UPLOAD_KEY },
    });

    if (!res.ok && res.status !== 404) {
        throw new Error(`Image delete failed (HTTP ${res.status})`);
    }
}

/** Derives the storage key back from a stored public URL. */
export function keyFromUrl(url: string): string | null {
    if (!PUBLIC_URL || !url.startsWith(PUBLIC_URL + "/")) return null;
    return decodeURIComponent(url.slice(PUBLIC_URL.length + 1));
}
