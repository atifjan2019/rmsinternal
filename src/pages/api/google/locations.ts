import type { APIRoute } from "astro";
import { verifySession } from "../../../lib/auth";
import { listLocations, getAutoReplySettings } from "../../../lib/google";

async function checkAuth(request: Request): Promise<boolean> {
    const cookies = request.headers.get("cookie") || "";
    const match = cookies.match(/admin_session=([^;]+)/);
    return !!(await verifySession(match ? match[1] : undefined));
}

export const GET: APIRoute = async ({ request }) => {
    if (!(await checkAuth(request))) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    try {
        const [locations, settings] = await Promise.all([listLocations(), getAutoReplySettings()]);
        const settingsByLocation = new Map(settings.map((s) => [s.location_name, s]));

        return new Response(
            JSON.stringify(
                locations.map((loc) => ({
                    ...loc,
                    autoReply: settingsByLocation.get(loc.name) || null,
                }))
            ),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (err: any) {
        console.error("Locations error:", err.message);
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
};
