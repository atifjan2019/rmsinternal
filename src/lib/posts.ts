import { queryD1 } from "./storage";
import { getValidAccessToken, getCachedLocations, getAutoReplySettings } from "./google";
import { generatePostCopy, aiConfigured } from "./ai";

/**
 * Google Business Profile posts: generation, queueing and publishing.
 *
 * Posts go through a queue so nothing reaches a public listing unreviewed
 * unless that business is explicitly set to auto-publish (the hybrid model).
 */

export type PostStatus = "draft" | "published" | "failed" | "discarded";

export interface PostSettings {
    location_name: string;
    location_title: string;
    enabled: boolean;
    /** Publish without review for this business. */
    auto_publish: boolean;
    frequency_days: number;
    cta_type: string;
    cta_url: string;
    /** Themes to rotate through, one post each. */
    topics: string[];
    last_generated_at: string | null;
}

export interface QueuedPost {
    id: string;
    location_name: string;
    location_title: string;
    summary: string;
    image_url: string | null;
    cta_type: string;
    cta_url: string;
    status: PostStatus;
    gbp_post_name: string | null;
    error: string | null;
    created_at: string;
    published_at: string | null;
}

/** Call-to-action types Google accepts on a standard post. */
export const CTA_TYPES = ["CALL", "BOOK", "ORDER", "SHOP", "LEARN_MORE", "SIGN_UP", "NONE"] as const;

/** CTAs that need a destination URL; CALL uses the listing's phone number. */
export function ctaNeedsUrl(cta: string): boolean {
    return cta !== "CALL" && cta !== "NONE";
}

function rowToSettings(r: any): PostSettings {
    return {
        location_name: r.location_name,
        location_title: r.location_title || "",
        enabled: !!r.enabled,
        auto_publish: !!r.auto_publish,
        frequency_days: Number(r.frequency_days) || 7,
        cta_type: r.cta_type || "CALL",
        cta_url: r.cta_url || "",
        topics: r.topics ? JSON.parse(r.topics) : [],
        last_generated_at: r.last_generated_at || null,
    };
}

export async function getPostSettings(locationName?: string): Promise<PostSettings[]> {
    const sql = locationName
        ? "SELECT * FROM post_settings WHERE location_name = ?"
        : "SELECT * FROM post_settings";
    const { results } = await queryD1(sql, locationName ? [locationName] : []);
    return results.map(rowToSettings);
}

export async function savePostSettings(s: PostSettings): Promise<void> {
    await queryD1(
        `INSERT INTO post_settings
           (location_name, location_title, enabled, auto_publish, frequency_days, cta_type, cta_url, topics, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(location_name) DO UPDATE SET
           location_title = excluded.location_title,
           enabled        = excluded.enabled,
           auto_publish   = excluded.auto_publish,
           frequency_days = excluded.frequency_days,
           cta_type       = excluded.cta_type,
           cta_url        = excluded.cta_url,
           topics         = excluded.topics,
           updated_at     = excluded.updated_at`,
        [
            s.location_name,
            s.location_title,
            s.enabled ? 1 : 0,
            s.auto_publish ? 1 : 0,
            Math.max(1, Number(s.frequency_days) || 7),
            s.cta_type || "CALL",
            s.cta_url || "",
            JSON.stringify(s.topics || []),
            new Date().toISOString(),
        ]
    );
}

export async function listQueue(status?: PostStatus, locationName?: string): Promise<QueuedPost[]> {
    const where: string[] = [];
    const params: any[] = [];
    if (status) {
        where.push("status = ?");
        params.push(status);
    }
    if (locationName) {
        where.push("location_name = ?");
        params.push(locationName);
    }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const { results } = await queryD1(
        `SELECT * FROM post_queue ${clause} ORDER BY created_at DESC LIMIT 100`,
        params
    );
    return results as QueuedPost[];
}

export async function getQueuedPost(id: string): Promise<QueuedPost | null> {
    const { results } = await queryD1("SELECT * FROM post_queue WHERE id = ? LIMIT 1", [id]);
    return (results[0] as QueuedPost) || null;
}

export async function updateQueuedPost(id: string, fields: Record<string, any>): Promise<void> {
    const keys = Object.keys(fields);
    if (!keys.length) return;
    await queryD1(
        `UPDATE post_queue SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`,
        [...keys.map((k) => fields[k]), id]
    );
}

/** Images available to a business, least-recently-used first so posts vary. */
export async function listImages(locationName: string) {
    const { results } = await queryD1(
        "SELECT * FROM post_images WHERE location_name = ? ORDER BY COALESCE(last_used_at, '') ASC, uploaded_at ASC",
        [locationName]
    );
    return results as any[];
}

/**
 * Generates one post for a business and queues it. Returns the queued row, or
 * null when the business has nothing to generate from.
 */
export async function generatePostFor(locationName: string): Promise<QueuedPost | null> {
    const settings = (await getPostSettings(locationName))[0];
    if (!settings) return null;
    if (!(await aiConfigured())) throw new Error("AI is not configured: add an API key on the Settings page.");

    // The knowledge base written for review replies describes the business, so
    // posts reuse it rather than asking for the same details twice.
    const autoReply = (await getAutoReplySettings(locationName))[0];
    const knowledge = autoReply?.ai_instructions || "";

    // Rotate topics by how many posts we've already made for this business.
    const priorAll = await listQueue(undefined, locationName);
    const topics = settings.topics.length ? settings.topics : [""];
    const topic = topics[priorAll.length % topics.length];

    const recentSummaries = priorAll.slice(0, 6).map((p) => p.summary);

    const summary = await generatePostCopy({
        businessName: settings.location_title,
        knowledge,
        topic,
        avoid: recentSummaries,
    });

    // Least-recently-used image, so a small library still rotates.
    const images = await listImages(locationName);
    const image = images[0] || null;
    if (image) {
        await queryD1("UPDATE post_images SET last_used_at = ? WHERE id = ?", [
            new Date().toISOString(),
            image.id,
        ]);
    }

    const post: QueuedPost = {
        id: crypto.randomUUID(),
        location_name: locationName,
        location_title: settings.location_title,
        summary,
        image_url: image ? image.url : null,
        cta_type: settings.cta_type,
        cta_url: settings.cta_url,
        status: "draft",
        gbp_post_name: null,
        error: null,
        created_at: new Date().toISOString(),
        published_at: null,
    };

    await queryD1(
        `INSERT INTO post_queue (id, location_name, location_title, summary, image_url, cta_type, cta_url, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
        [post.id, post.location_name, post.location_title, post.summary, post.image_url, post.cta_type, post.cta_url, post.created_at]
    );

    await queryD1("UPDATE post_settings SET last_generated_at = ? WHERE location_name = ?", [
        post.created_at,
        locationName,
    ]);

    return post;
}

/** Publishes a queued post to Google. Records the outcome either way. */
export async function publishPost(id: string): Promise<QueuedPost> {
    const post = await getQueuedPost(id);
    if (!post) throw new Error("Post not found.");
    if (post.status === "published") throw new Error("This post has already been published.");
    if (!post.summary?.trim()) throw new Error("Post has no text.");

    const body: any = {
        languageCode: "en",
        summary: post.summary.trim(),
        topicType: "STANDARD",
    };

    if (post.cta_type && post.cta_type !== "NONE") {
        body.callToAction = { actionType: post.cta_type };
        if (ctaNeedsUrl(post.cta_type)) {
            if (!post.cta_url) throw new Error(`${post.cta_type} needs a destination URL.`);
            body.callToAction.url = post.cta_url;
        }
    }

    // Google fetches and rehosts the image, so it must be publicly reachable.
    if (post.image_url) {
        body.media = [{ mediaFormat: "PHOTO", sourceUrl: post.image_url }];
    }

    const token = await getValidAccessToken();
    const res = await fetch(`https://mybusiness.googleapis.com/v4/${post.location_name}/localPosts`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "User-Agent": "claude-cli/2.0.14 (external, cli)",
        },
        body: JSON.stringify(body),
    });

    const text = await res.text();
    let data: any = {};
    try {
        data = JSON.parse(text);
    } catch {
        /* fall through to the error below */
    }

    if (!res.ok) {
        const message = data?.error?.message || `Google rejected the post (HTTP ${res.status})`;
        await updateQueuedPost(id, { status: "failed", error: message });
        throw new Error(message);
    }

    await updateQueuedPost(id, {
        status: "published",
        gbp_post_name: data.name || null,
        error: null,
        published_at: new Date().toISOString(),
    });

    return (await getQueuedPost(id))!;
}

export interface PostRunResult {
    location: string;
    generated: number;
    published: number;
    skipped: string | null;
    errors: string[];
}

/**
 * One scheduled pass: generates for any enabled business that is due, and
 * publishes immediately only where the business opted into auto-publish.
 */
export async function runPostSchedule(force = false): Promise<PostRunResult[]> {
    const all = (await getPostSettings()).filter((s) => s.enabled);
    const out: PostRunResult[] = [];

    for (const s of all) {
        const r: PostRunResult = {
            location: s.location_title || s.location_name,
            generated: 0,
            published: 0,
            skipped: null,
            errors: [],
        };

        try {
            // Never post twice in a day for the same business, even when forced.
            // Cloud Scheduler retries a run that returns non-2xx, and a retry
            // after a partial success would otherwise publish a duplicate.
            if (s.last_generated_at?.slice(0, 10) === new Date().toISOString().slice(0, 10)) {
                r.skipped = "already posted today";
                out.push(r);
                continue;
            }

            if (!force && s.last_generated_at) {
                const dueAt = new Date(s.last_generated_at).getTime() + s.frequency_days * 86400_000;
                if (Date.now() < dueAt) {
                    r.skipped = `next due ${new Date(dueAt).toISOString().slice(0, 10)}`;
                    out.push(r);
                    continue;
                }
            }

            const post = await generatePostFor(s.location_name);
            if (!post) {
                r.skipped = "no settings";
                out.push(r);
                continue;
            }
            r.generated = 1;

            if (s.auto_publish) {
                try {
                    await publishPost(post.id);
                    r.published = 1;
                } catch (err: any) {
                    r.errors.push(`publish: ${err.message}`);
                }
            }
        } catch (err: any) {
            r.errors.push(err.message);
        }

        out.push(r);
    }

    return out;
}


/**
 * Edits a post that is already live on Google.
 *
 * Only the text and the button can be changed: Google does not accept media
 * changes on an existing local post, so swapping the image means deleting the
 * post and publishing a new one.
 */
export async function editPublishedPost(
    id: string,
    fields: { summary?: string; cta_type?: string; cta_url?: string }
): Promise<QueuedPost> {
    const post = await getQueuedPost(id);
    if (!post) throw new Error("Post not found.");
    if (post.status !== "published" || !post.gbp_post_name) {
        throw new Error("This post is not published, so edit the draft instead.");
    }

    const summary = (fields.summary ?? post.summary).trim();
    if (!summary) throw new Error("Post text cannot be empty.");

    const ctaType = fields.cta_type ?? post.cta_type;
    const ctaUrl = fields.cta_url ?? post.cta_url;

    const body: any = { languageCode: "en", summary };
    const masks = ["summary"];

    if (ctaType && ctaType !== "NONE") {
        body.callToAction = { actionType: ctaType };
        if (ctaNeedsUrl(ctaType)) {
            if (!ctaUrl) throw new Error(`${ctaType} needs a destination URL.`);
            body.callToAction.url = ctaUrl;
        }
        masks.push("callToAction");
    }

    const token = await getValidAccessToken();
    const res = await fetch(
        `https://mybusiness.googleapis.com/v4/${post.gbp_post_name}?updateMask=${masks.join(",")}`,
        {
            method: "PATCH",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
                "User-Agent": "claude-cli/2.0.14 (external, cli)",
            },
            body: JSON.stringify(body),
        }
    );

    const text = await res.text();
    let data: any = {};
    try {
        data = JSON.parse(text);
    } catch {
        /* handled below */
    }

    if (!res.ok) {
        throw new Error(data?.error?.message || `Google rejected the edit (HTTP ${res.status})`);
    }

    await updateQueuedPost(id, { summary, cta_type: ctaType, cta_url: ctaUrl, error: null });
    return (await getQueuedPost(id))!;
}

/**
 * Removes a post. A published post is deleted from Google first — if that
 * fails the row is kept, so the listing and the dashboard cannot disagree.
 */
export async function deletePost(id: string): Promise<void> {
    const post = await getQueuedPost(id);
    if (!post) throw new Error("Post not found.");

    if (post.status === "published" && post.gbp_post_name) {
        const token = await getValidAccessToken();
        const res = await fetch(`https://mybusiness.googleapis.com/v4/${post.gbp_post_name}`, {
            method: "DELETE",
            headers: {
                Authorization: `Bearer ${token}`,
                "User-Agent": "claude-cli/2.0.14 (external, cli)",
            },
        });

        // 404 means it is already gone from Google, which is the desired end state.
        if (!res.ok && res.status !== 404) {
            const detail = await res.text().catch(() => "");
            let message = `Google refused to delete the post (HTTP ${res.status})`;
            try {
                const parsed = JSON.parse(detail);
                if (parsed?.error?.message) message = parsed.error.message;
            } catch {
                /* keep the generic message */
            }
            await updateQueuedPost(id, { error: message });
            throw new Error(message);
        }
    }

    await queryD1("DELETE FROM post_queue WHERE id = ?", [id]);
}
