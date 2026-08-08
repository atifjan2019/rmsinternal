import type { APIRoute } from "astro";
import { verifySession } from "../../../lib/auth";
import { exchangeCode, emailFromIdToken, saveTokens, getTokenRow } from "../../../lib/google";

export const GET: APIRoute = async ({ url, cookies, redirect }) => {
    const token = cookies.get("admin_session")?.value;
    if (!(await verifySession(token))) {
        return redirect("/login");
    }

    const error = url.searchParams.get("error");
    if (error) {
        return redirect(`/dashboard?google_error=${encodeURIComponent(error)}`);
    }

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const expectedState = cookies.get("google_oauth_state")?.value;
    cookies.delete("google_oauth_state", { path: "/" });

    if (!code || !state || state !== expectedState) {
        return redirect("/dashboard?google_error=invalid_state");
    }

    try {
        const redirectUri = `${url.origin}/api/google/callback`;
        const tokens = await exchangeCode(code, redirectUri);

        // With prompt=consent Google always sends a refresh_token; keep the old one as fallback
        let refreshToken = tokens.refresh_token;
        if (!refreshToken) {
            refreshToken = (await getTokenRow())?.refresh_token;
        }
        if (!refreshToken) {
            return redirect("/dashboard?google_error=no_refresh_token");
        }

        await saveTokens({
            refresh_token: refreshToken,
            access_token: tokens.access_token,
            expires_in: tokens.expires_in,
            email: emailFromIdToken(tokens.id_token),
        });

        return redirect("/dashboard?google_connected=1");
    } catch (err: any) {
        console.error("Google OAuth callback error:", err.message);
        return redirect(`/dashboard?google_error=${encodeURIComponent(err.message)}`);
    }
};
