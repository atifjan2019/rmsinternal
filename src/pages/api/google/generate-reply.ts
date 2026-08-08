import type { APIRoute } from "astro";
import { verifySession } from "../../../lib/auth";
import { generateReviewReply, aiConfigured } from "../../../lib/ai";

async function checkAuth(request: Request): Promise<boolean> {
    const cookies = request.headers.get("cookie") || "";
    const match = cookies.match(/admin_session=([^;]+)/);
    return !!(await verifySession(match ? match[1] : undefined));
}

/** Generates an AI reply draft for a review (does not post it). */
export const POST: APIRoute = async ({ request }) => {
    if (!(await checkAuth(request))) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    if (!aiConfigured()) {
        return new Response(JSON.stringify({ error: "AI_API_KEY environment variable is not set." }), { status: 400 });
    }

    try {
        const { reviewerName, starRating, comment, businessName, instructions } = await request.json();

        if (!starRating || !businessName) {
            return new Response(JSON.stringify({ error: "starRating and businessName are required" }), { status: 400 });
        }

        const reply = await generateReviewReply({
            reviewerName: reviewerName || "",
            starRating: Number(starRating),
            comment,
            businessName,
            instructions,
        });

        return new Response(JSON.stringify({ reply }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (err: any) {
        console.error("Generate reply error:", err.message);
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
};
