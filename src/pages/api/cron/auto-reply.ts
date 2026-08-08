import type { APIRoute } from "astro";
import { runAutoReply } from "../../../lib/autoreply";

/**
 * Scheduled auto-reply pass. Triggered by Vercel Cron (see vercel.json).
 * Protected by CRON_SECRET — Vercel sends it as "Authorization: Bearer <CRON_SECRET>".
 */
export const GET: APIRoute = async ({ request }) => {
    const secret = import.meta.env.CRON_SECRET;
    const authHeader = request.headers.get("authorization");

    if (!secret || authHeader !== `Bearer ${secret}`) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    try {
        const results = await runAutoReply();
        const totalReplied = results.reduce((sum, r) => sum + r.replied, 0);
        console.log(`Auto-reply cron: replied to ${totalReplied} review(s)`, JSON.stringify(results));
        return new Response(JSON.stringify({ results }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (err: any) {
        console.error("Auto-reply cron error:", err.message);
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
};
