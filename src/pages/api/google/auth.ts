import type { APIRoute } from "astro";
import { verifySession } from "../../../lib/auth";
import { getAuthUrl } from "../../../lib/google";

export const GET: APIRoute = async ({ request, url, cookies, redirect }) => {
    const token = cookies.get("admin_session")?.value;
    if (!(await verifySession(token))) {
        return redirect("/login");
    }

    const state = crypto.randomUUID();
    cookies.set("google_oauth_state", state, {
        path: "/",
        httpOnly: true,
        secure: url.protocol === "https:",
        maxAge: 600,
        sameSite: "lax",
    });

    const redirectUri = `${url.origin}/api/google/callback`;
    return redirect(getAuthUrl(redirectUri, state));
};
