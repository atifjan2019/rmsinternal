import type { APIRoute } from "astro";
import { verifySession } from "../../../lib/auth";
import { queryD1 } from "../../../lib/storage";
import { uploadImage, deleteImage, keyFromUrl, r2Configured, r2ConfigError, ALLOWED_IMAGE_TYPES } from "../../../lib/r2";
import { listImages } from "../../../lib/posts";

async function checkAuth(request: Request): Promise<boolean> {
    const cookies = request.headers.get("cookie") || "";
    const match = cookies.match(/admin_session=([^;]+)/);
    return !!(await verifySession(match ? match[1] : undefined));
}

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const unauthorized = () => json({ error: "Unauthorized" }, 401);

// Vercel caps a serverless request body at 4.5MB; anything larger never reaches
// this handler, so reject just below that with a message the user can act on.
const MAX_BYTES = 4 * 1024 * 1024;

/** Image library for one business. */
export const GET: APIRoute = async ({ request, url }) => {
    if (!(await checkAuth(request))) return unauthorized();

    const location = url.searchParams.get("location");
    if (!location) return json({ error: "location is required" }, 400);

    try {
        const images = await listImages(location);
        return json({ images, configured: r2Configured(), configError: r2ConfigError() });
    } catch (err: any) {
        return json({ error: err.message }, 500);
    }
};

/** Uploads one image into a business's library. */
export const POST: APIRoute = async ({ request, url }) => {
    if (!(await checkAuth(request))) return unauthorized();

    if (!r2Configured()) return json({ error: r2ConfigError() }, 400);

    const location = url.searchParams.get("location");
    if (!location) return json({ error: "location is required" }, 400);

    try {
        const form = await request.formData();
        const file = form.get("file");

        if (!(file instanceof File)) return json({ error: "No file uploaded" }, 400);
        if (file.size === 0) return json({ error: "File is empty" }, 400);
        if (file.size > MAX_BYTES) return json({ error: "Image is larger than 4MB" }, 413);
        if (!ALLOWED_IMAGE_TYPES[file.type]) {
            return json({ error: `Unsupported type ${file.type || "unknown"} — use JPEG, PNG or WebP.` }, 415);
        }

        const bytes = await file.arrayBuffer();
        const { url: publicUrl } = await uploadImage(bytes, file.type);

        const id = crypto.randomUUID();
        await queryD1(
            "INSERT INTO post_images (id, location_name, url, filename, uploaded_at) VALUES (?, ?, ?, ?, ?)",
            [id, location, publicUrl, file.name.slice(0, 120), new Date().toISOString()]
        );

        return json({ image: { id, location_name: location, url: publicUrl, filename: file.name } });
    } catch (err: any) {
        console.error("Image upload error:", err.message);
        return json({ error: err.message }, 500);
    }
};

/** Removes an image from the library and from storage. */
export const DELETE: APIRoute = async ({ request, url }) => {
    if (!(await checkAuth(request))) return unauthorized();

    const id = url.searchParams.get("id");
    if (!id) return json({ error: "id is required" }, 400);

    try {
        const { results } = await queryD1("SELECT url FROM post_images WHERE id = ? LIMIT 1", [id]);
        const row = results[0];
        if (!row) return json({ error: "Image not found" }, 404);

        // Drop the row first: a stale object in the bucket is harmless, a row
        // pointing at a deleted object would break any post that used it.
        await queryD1("DELETE FROM post_images WHERE id = ?", [id]);

        // Unqueued drafts still referencing this image would fail to publish —
        // Google fetches the URL and it is about to 404. Published posts keep
        // theirs: Google rehosted a copy at publish time.
        await queryD1("UPDATE post_queue SET image_url = NULL WHERE image_url = ? AND status = 'draft'", [
            row.url,
        ]);

        const key = keyFromUrl(row.url);
        if (key) {
            try {
                await deleteImage(key);
            } catch (err: any) {
                console.error("R2 delete failed (row already removed):", err.message);
            }
        }

        return json({ message: "Deleted" });
    } catch (err: any) {
        return json({ error: err.message }, 500);
    }
};
