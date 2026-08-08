import type { APIRoute } from "astro";
import { verifySession } from "../../lib/auth";
import { queryD1 } from "../../lib/storage";

async function checkAuth(request: Request): Promise<boolean> {
    const cookies = request.headers.get("cookie") || "";
    const match = cookies.match(/admin_session=([^;]+)/);
    return !!(await verifySession(match ? match[1] : undefined));
}

export const GET: APIRoute = async ({ request }) => {
    if (!(await checkAuth(request))) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const { results } = await queryD1(
        "SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50"
    );
    const unread = results.filter((n: any) => !n.read).length;

    return new Response(JSON.stringify({ notifications: results, unread }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
};

/** Marks all notifications as read. */
export const PATCH: APIRoute = async ({ request }) => {
    if (!(await checkAuth(request))) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    await queryD1("UPDATE notifications SET read = 1 WHERE read = 0");
    return new Response(JSON.stringify({ message: "Marked read" }), { status: 200 });
};
