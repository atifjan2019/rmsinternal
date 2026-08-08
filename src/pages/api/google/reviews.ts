import type { APIRoute } from "astro";
import { verifySession } from "../../../lib/auth";
import { listReviews, replyToReview, hasReplied } from "../../../lib/google";

async function checkAuth(request: Request): Promise<boolean> {
    const cookies = request.headers.get("cookie") || "";
    const match = cookies.match(/admin_session=([^;]+)/);
    return !!(await verifySession(match ? match[1] : undefined));
}

// Reviews live under accounts/{aid}/locations/{lid}/reviews/{rid}
const LOCATION_RE = /^accounts\/[^/]+\/locations\/[^/]+$/;
const REVIEW_RE = /^accounts\/[^/]+\/locations\/[^/]+\/reviews\/[^/]+$/;

export const GET: APIRoute = async ({ request, url }) => {
    if (!(await checkAuth(request))) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const location = url.searchParams.get("location");
    if (!location || !LOCATION_RE.test(location)) {
        return new Response(JSON.stringify({ error: "Valid location parameter is required" }), { status: 400 });
    }

    try {
        const pageToken = url.searchParams.get("pageToken") || undefined;
        const data = await listReviews(location, pageToken);
        return new Response(JSON.stringify(data), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (err: any) {
        console.error("Reviews fetch error:", err.message);
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
};

export const POST: APIRoute = async ({ request }) => {
    if (!(await checkAuth(request))) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    try {
        const { reviewName, comment } = await request.json();
        if (!reviewName || !REVIEW_RE.test(reviewName) || !comment?.trim()) {
            return new Response(JSON.stringify({ error: "reviewName and comment are required" }), { status: 400 });
        }

        await replyToReview(reviewName, comment.trim());
        return new Response(JSON.stringify({ message: "Reply posted" }), { status: 200 });
    } catch (err: any) {
        console.error("Reply error:", err.message);
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
};
