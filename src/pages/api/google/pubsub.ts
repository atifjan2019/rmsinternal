import type { APIRoute } from "astro";
import { runAutoReply, MIN_REVIEW_AGE_MINUTES } from "../../../lib/autoreply";

/**
 * Google Cloud Pub/Sub push endpoint for Business Profile review notifications.
 * Google pushes NEW_REVIEW the moment a review lands; we respond 503 until the
 * message is 10 minutes old, and the subscription's 600s retry delay redelivers
 * it right when the reply window opens. Secured by the ?token= query secret
 * baked into the push subscription URL.
 */
export const POST: APIRoute = async ({ request, url }) => {
    const secret = import.meta.env.PUBSUB_TOKEN;
    if (!secret || url.searchParams.get("token") !== secret) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    try {
        const body = await request.json();
        const raw = body?.message?.data
            ? Buffer.from(body.message.data, "base64").toString("utf8")
            : "{}";
        const event = JSON.parse(raw);

        // Event shape: { notificationType, review: "accounts/../locations/../reviews/..", location: "accounts/../locations/.." }
        const type = event.notificationType;
        if (type !== "NEW_REVIEW" && type !== "UPDATED_REVIEW") {
            // Ack everything else so Pub/Sub doesn't retry
            return new Response(JSON.stringify({ ignored: type || "unknown" }), { status: 200 });
        }

        // Defer until the review is 10 minutes old — Pub/Sub redelivers on non-2xx
        const publishTime = body?.message?.publishTime ? new Date(body.message.publishTime).getTime() : 0;
        const ageMs = Date.now() - publishTime;
        if (publishTime && ageMs < MIN_REVIEW_AGE_MINUTES * 60_000) {
            return new Response(JSON.stringify({ retry: "too fresh, redeliver later" }), { status: 503 });
        }

        const locationName: string | undefined =
            event.location || (event.review ? event.review.split("/reviews/")[0] : undefined);

        console.log(`Pub/Sub ${type} for ${locationName}`);
        const results = await runAutoReply(locationName);
        return new Response(JSON.stringify({ results }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (err: any) {
        console.error("Pub/Sub webhook error:", err.message);
        // Return 200 anyway: a poison message must not retry forever; the hourly cron is the safety net
        return new Response(JSON.stringify({ error: err.message }), { status: 200 });
    }
};
