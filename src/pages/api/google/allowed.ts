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

    // A failed read must not look like "nothing saved": queryD1 swallows D1
    // errors and returns success:false, and the caller treats null as "show
    // everything", which would let the picker overwrite a real selection.
    try {
        const { results, success } = await queryD1(
            "SELECT value FROM kv_cache WHERE key = ? LIMIT 1",
            [KEY]
        );

        if (!success) {
            return new Response(
                JSON.stringify({ error: "Could not read the saved selection." }),
                { status: 500, headers: { "Content-Type": "application/json" } }
            );
        }

        let allowed: string[] | null = null;
        if (results[0]) {
            try {
                const parsed = JSON.parse(results[0].value);
                if (Array.isArray(parsed)) allowed = parsed;
            } catch {
                allowed = null;
            }
        }

        return new Response(JSON.stringify({ allowed }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (err: any) {
        return new Response(
            JSON.stringify({ error: err.message || "Could not read the saved selection." }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
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
