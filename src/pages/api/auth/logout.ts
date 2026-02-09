import type { APIRoute } from "astro";

export const POST: APIRoute = async ({ request }) => {
    const headers = new Headers();
    headers.append(
        "Set-Cookie",
        "admin_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0"
    );

    return new Response(JSON.stringify({ success: true }), { status: 200, headers });
};
