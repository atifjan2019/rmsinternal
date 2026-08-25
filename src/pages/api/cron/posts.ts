import type { APIRoute } from "astro";
import { runPostSchedule } from "../../../lib/posts";

/**
 * Scheduled post generation. Businesses set to auto-publish go live in this
 * pass; the rest land in the dashboard queue for approval.
 * Protected by CRON_SECRET, same as the auto-reply cron.
 */
export const GET: APIRoute = async ({ request, url }) => {
    const secret = import.meta.env.CRON_SECRET;
    const authHeader = request.headers.get("authorization");

    if (!secret || authHeader !== `Bearer ${secret}`) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    try {
        // ?force=1 ignores the per-business frequency, for manual runs.
        const results = await runPostSchedule(url.searchParams.get("force") === "1");
        const generated = results.reduce((n, r) => n + r.generated, 0);
        const published = results.reduce((n, r) => n + r.published, 0);
        console.log(`Posts cron: generated ${generated}, published ${published}`, JSON.stringify(results));
        return new Response(JSON.stringify({ generated, published, results }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (err: any) {
        console.error("Posts cron error:", err.message);
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
};
