import type { APIRoute } from "astro";
import { verifySession } from "../../../lib/auth";
import { queryD1 } from "../../../lib/storage";

async function checkAuth(request: Request): Promise<boolean> {
    const cookies = request.headers.get("cookie") || "";
    const match = cookies.match(/admin_session=([^;]+)/);
    return !!(await verifySession(match ? match[1] : undefined));
}

const KEY = "allowed_locations";

/** Which business locations are shown in the dashboard. null/absent = all of them. */
export const GET: APIRoute = async ({ request }) => {
    if (!(await checkAuth(request))) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const { results } = await queryD1("SELECT value FROM kv_cache WHERE key = ? LIMIT 1", [KEY]);
    let allowed: string[] | null = null;
    if (results[0]) {
        try {
            allowed = JSON.parse(results[0].value);
        } catch {
            allowed = null;
        }
    }
    return new Response(JSON.stringify({ allowed }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
};

export const POST: APIRoute = async ({ request }) => {
    if (!(await checkAuth(request))) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    try {
        const { allowed } = await request.json();
        if (!Array.isArray(allowed)) {
            return new Response(JSON.stringify({ error: "allowed must be an array of location names" }), { status: 400 });
        }
        await queryD1(
            `INSERT INTO kv_cache (key, value, updated_at) VALUES (?, ?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
            [KEY, JSON.stringify(allowed), new Date().toISOString()]
        );
        return new Response(JSON.stringify({ message: "Saved" }), { status: 200 });
    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
};
