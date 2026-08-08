import type { APIRoute } from "astro";
import { verifySession } from "../../../lib/auth";
import { getTokenRow, deleteTokens } from "../../../lib/google";

async function checkAuth(request: Request): Promise<boolean> {
    const cookies = request.headers.get("cookie") || "";
    const match = cookies.match(/admin_session=([^;]+)/);
    return !!(await verifySession(match ? match[1] : undefined));
}

export const GET: APIRoute = async ({ request }) => {
    if (!(await checkAuth(request))) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const row = await getTokenRow();
    return new Response(
        JSON.stringify({
            connected: !!row,
            email: row?.email || null,
            configured: !!(import.meta.env.GOOGLE_CLIENT_ID && import.meta.env.GOOGLE_CLIENT_SECRET),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
    );
};

export const DELETE: APIRoute = async ({ request }) => {
    if (!(await checkAuth(request))) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    await deleteTokens();
    return new Response(JSON.stringify({ message: "Disconnected" }), { status: 200 });
};
