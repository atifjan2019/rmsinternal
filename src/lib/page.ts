import type { AstroGlobal } from "astro";
import { verifySession } from "./auth";

/**
 * The signed-in admin for a page, or null. Every admin page calls this and
 * redirects to /login on null, so the check lives in one place.
 */
export async function pageUser(Astro: AstroGlobal) {
    const cookie = Astro.cookies.get("admin_session")?.value;
    return verifySession(cookie);
}

/** Where to send someone back to after signing in. */
export function loginUrl(Astro: AstroGlobal): string {
    const next = Astro.url.pathname + Astro.url.search;
    return next && next !== "/" ? `/login?next=${encodeURIComponent(next)}` : "/login";
}
