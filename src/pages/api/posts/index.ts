import type { APIRoute } from "astro";
import { verifySession } from "../../../lib/auth";
import {
    listQueue,
    getPostSettings,
    savePostSettings,
    generatePostFor,
    publishPost,
    updateQueuedPost,
    editPublishedPost,
    deletePost,
    ctaNeedsUrl,
    type PostStatus,
} from "../../../lib/posts";

async function checkAuth(request: Request): Promise<boolean> {
    const cookies = request.headers.get("cookie") || "";
    const match = cookies.match(/admin_session=([^;]+)/);
    return !!(await verifySession(match ? match[1] : undefined));
}

const unauthorized = () => new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Queue + settings for the posts screen. */
export const GET: APIRoute = async ({ request, url }) => {
    if (!(await checkAuth(request))) return unauthorized();

    try {
        const status = (url.searchParams.get("status") || undefined) as PostStatus | undefined;
        const location = url.searchParams.get("location") || undefined;
        const [queue, settings] = await Promise.all([listQueue(status, location), getPostSettings()]);
        return json({ queue, settings });
    } catch (err: any) {
        return json({ error: err.message }, 500);
    }
};

/**
 * Actions on the posts system.
 * generate  — draft a post now for one business
 * publish   — push a queued post live
 * settings  — save per-business configuration
 * update         — edit a draft's text/image/CTA
 * edit-published — change the text/button of a post already live on Google
 * delete         — remove a post (from Google too, if published)
 * discard        — drop a draft
 */
export const POST: APIRoute = async ({ request }) => {
    if (!(await checkAuth(request))) return unauthorized();

    try {
        const body = await request.json();
        const action = body.action;

        if (action === "generate") {
            if (!body.location_name) return json({ error: "location_name is required" }, 400);
            const post = await generatePostFor(body.location_name);
            if (!post) return json({ error: "This business has no post settings saved yet." }, 400);
            return json({ post });
        }

        if (action === "publish") {
            if (!body.id) return json({ error: "id is required" }, 400);
            const post = await publishPost(body.id);
            return json({ post });
        }

        if (action === "update") {
            if (!body.id) return json({ error: "id is required" }, 400);
            const fields: Record<string, any> = {};
            if (typeof body.summary === "string") fields.summary = body.summary;
            if (typeof body.cta_type === "string") fields.cta_type = body.cta_type;
            if (typeof body.cta_url === "string") fields.cta_url = body.cta_url;
            if (body.image_url === null || typeof body.image_url === "string") fields.image_url = body.image_url;
            await updateQueuedPost(body.id, fields);
            return json({ message: "Updated" });
        }

        if (action === "edit-published") {
            if (!body.id) return json({ error: "id is required" }, 400);
            const post = await editPublishedPost(body.id, {
                summary: typeof body.summary === "string" ? body.summary : undefined,
                cta_type: typeof body.cta_type === "string" ? body.cta_type : undefined,
                cta_url: typeof body.cta_url === "string" ? body.cta_url : undefined,
            });
            return json({ post });
        }

        if (action === "delete") {
            if (!body.id) return json({ error: "id is required" }, 400);
            await deletePost(body.id);
            return json({ message: "Deleted" });
        }

        if (action === "discard") {
            if (!body.id) return json({ error: "id is required" }, 400);
            await updateQueuedPost(body.id, { status: "discarded" });
            return json({ message: "Discarded" });
        }

        if (action === "settings") {
            if (!body.location_name) return json({ error: "location_name is required" }, 400);

            // Caught here rather than at publish time: on an auto-publishing
            // business a missing URL would fail every scheduled post silently.
            const cta = body.cta_type || "CALL";
            if (ctaNeedsUrl(cta) && !String(body.cta_url || "").trim()) {
                return json({ error: `The "${cta}" button needs a destination URL.` }, 400);
            }

            await savePostSettings({
                location_name: body.location_name,
                location_title: body.location_title || "",
                enabled: !!body.enabled,
                auto_publish: !!body.auto_publish,
                frequency_days: Number(body.frequency_days) || 7,
                cta_type: body.cta_type || "CALL",
                cta_url: body.cta_url || "",
                topics: Array.isArray(body.topics) ? body.topics.filter((t: any) => typeof t === "string" && t.trim()) : [],
                last_generated_at: null,
            });
            return json({ message: "Settings saved" });
        }

        return json({ error: "Unknown action" }, 400);
    } catch (err: any) {
        console.error("Posts API error:", err.message);
        return json({ error: err.message }, 500);
    }
};
