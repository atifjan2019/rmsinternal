import type { APIRoute } from "astro";
import { verifySession } from "../../../lib/auth";
import { listLocations, getAutoReplySettings, getCachedLocations, cacheLocations } from "../../../lib/google";

async function checkAuth(request: Request): Promise<boolean> {
    const cookies = request.headers.get("cookie") || "";
    const match = cookies.match(/admin_session=([^;]+)/);
    return !!(await verifySession(match ? match[1] : undefined));
}

export const GET: APIRoute = async ({ request, url }) => {
    if (!(await checkAuth(request))) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    try {
        const forceRefresh = url.searchParams.get("refresh") === "1";

        // Serve from D1 cache unless a refresh is requested — the Google location
        // listing is slow (one request per account) and rarely changes
        let locations;
        let cachedAt: string | null = null;
        if (!forceRefresh) {
            const cached = await getCachedLocations();
            if (cached) {
                locations = cached.locations;
                cachedAt = cached.updatedAt;
            }
        }
        if (!locations) {
            locations = await listLocations();
            await cacheLocations(locations);
            cachedAt = new Date().toISOString();
        }

        const settings = await getAutoReplySettings();
        const settingsByLocation = new Map(settings.map((s) => [s.location_name, s]));

        return new Response(
            JSON.stringify({
                cachedAt,
                locations: locations.map((loc) => ({
                    ...loc,
                    autoReply: settingsByLocation.get(loc.name) || null,
                })),
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (err: any) {
        console.error("Locations error:", err.message);
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
};
