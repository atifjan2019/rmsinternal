import type { APIRoute } from "astro";
import { verifySession } from "../../../lib/auth";
import { getAutoReplySettings, saveAutoReplySettings } from "../../../lib/google";
import { runAutoReply } from "../../../lib/autoreply";

async function checkAuth(request: Request): Promise<boolean> {
    const cookies = request.headers.get("cookie") || "";
    const match = cookies.match(/admin_session=([^;]+)/);
    return !!(await verifySession(match ? match[1] : undefined));
}

export const GET: APIRoute = async ({ request }) => {
    if (!(await checkAuth(request))) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const settings = await getAutoReplySettings();
    return new Response(JSON.stringify(settings), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
};

export const POST: APIRoute = async ({ request }) => {
    if (!(await checkAuth(request))) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    try {
        const body = await request.json();
        const { location_name, location_title, enabled, templates } = body;

        if (!location_name) {
            return new Response(JSON.stringify({ error: "location_name is required" }), { status: 400 });
        }

        await saveAutoReplySettings({
            location_name,
            location_title: location_title || "",
            enabled: !!enabled,
            templates: templates || {},
        });

        return new Response(JSON.stringify({ message: "Settings saved" }), { status: 200 });
    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
};

/** Manual "run now" trigger from the dashboard. */
export const PUT: APIRoute = async ({ request }) => {
    if (!(await checkAuth(request))) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    try {
        const results = await runAutoReply();
        return new Response(JSON.stringify({ results }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
};
