import type { APIRoute } from "astro";
import { generateReviewReply, aiConfigured } from "../../../lib/ai";

/** Temporary diagnostic: verifies AI generation works from Vercel's servers. Protected by CRON_SECRET. */
export const GET: APIRoute = async ({ request }) => {
    const secret = import.meta.env.CRON_SECRET;
    const authHeader = request.headers.get("authorization");
    if (!secret || authHeader !== `Bearer ${secret}`) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    if (!aiConfigured()) {
        return new Response(JSON.stringify({ error: "AI_API_KEY not set" }), { status: 400 });
    }

    try {
        const reply = await generateReviewReply({
            reviewerName: "Test User",
            starRating: 5,
            comment: "Great service, very fast!",
            businessName: "Test Business",
        });
        return new Response(JSON.stringify({ ok: true, reply }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (err: any) {
        return new Response(JSON.stringify({ ok: false, error: err.message }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    }
};
