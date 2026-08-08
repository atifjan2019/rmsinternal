import { queryD1 } from "./storage";

/**
 * Google Business Profile integration.
 *
 * Uses three Google APIs (all must be enabled on the Cloud project):
 *  - My Business Account Management API  (list accounts)
 *  - My Business Business Information API (list locations)
 *  - Google My Business API v4            (reviews: list + reply)
 *
 * OAuth scope: https://www.googleapis.com/auth/business.manage
 */

const GOOGLE_CLIENT_ID = import.meta.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = import.meta.env.GOOGLE_CLIENT_SECRET;

const OAUTH_SCOPE = "https://www.googleapis.com/auth/business.manage openid email";
const TOKEN_ROW_ID = "primary"; // single-admin app: one connected Google account

export interface GoogleTokenRow {
    id: string;
    email: string | null;
    refresh_token: string;
    access_token: string | null;
    expires_at: number | null;
    created_at: string;
}

export function assertGoogleConfigured() {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET environment variables are not set.");
    }
}

// ---------- OAuth ----------

export function getAuthUrl(redirectUri: string, state: string): string {
    assertGoogleConfigured();
    const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: OAUTH_SCOPE,
        access_type: "offline",
        prompt: "consent", // always return a refresh_token
        state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCode(code: string, redirectUri: string) {
    assertGoogleConfigured();
    const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            code,
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
        }),
    });
    const data = await res.json();
    if (!res.ok) {
        throw new Error(`Token exchange failed: ${data.error_description || data.error || res.status}`);
    }
    return data as {
        access_token: string;
        refresh_token?: string;
        expires_in: number;
        id_token?: string;
    };
}

/** Decode the email from an id_token (no signature check needed — token came from Google directly). */
export function emailFromIdToken(idToken: string | undefined): string | null {
    if (!idToken) return null;
    try {
        const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8"));
        return payload.email || null;
    } catch {
        return null;
    }
}

// ---------- Token storage (D1) ----------

export async function saveTokens(tokens: {
    refresh_token: string;
    access_token: string;
    expires_in: number;
    email: string | null;
}) {
    await queryD1(
        `INSERT INTO google_tokens (id, email, refresh_token, access_token, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           email = excluded.email,
           refresh_token = excluded.refresh_token,
           access_token = excluded.access_token,
           expires_at = excluded.expires_at`,
        [
            TOKEN_ROW_ID,
            tokens.email,
            tokens.refresh_token,
            tokens.access_token,
            Date.now() + tokens.expires_in * 1000,
            new Date().toISOString(),
        ]
    );
}

export async function getTokenRow(): Promise<GoogleTokenRow | null> {
    const { results } = await queryD1("SELECT * FROM google_tokens WHERE id = ? LIMIT 1", [TOKEN_ROW_ID]);
    return (results[0] as GoogleTokenRow) || null;
}

export async function deleteTokens() {
    await queryD1("DELETE FROM google_tokens WHERE id = ?", [TOKEN_ROW_ID]);
}

/** Returns a valid access token, refreshing via the stored refresh_token when expired. */
export async function getValidAccessToken(): Promise<string> {
    const row = await getTokenRow();
    if (!row) throw new Error("Google account not connected.");

    // 60s safety margin before expiry
    if (row.access_token && row.expires_at && row.expires_at > Date.now() + 60_000) {
        return row.access_token;
    }

    assertGoogleConfigured();
    const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            refresh_token: row.refresh_token,
            grant_type: "refresh_token",
        }),
    });
    const data = await res.json();
    if (!res.ok) {
        if (data.error === "invalid_grant") {
            // Refresh token revoked/expired — force a reconnect
            await deleteTokens();
            throw new Error("Google access was revoked. Please reconnect your Google account.");
        }
        throw new Error(`Token refresh failed: ${data.error_description || data.error || res.status}`);
    }

    await queryD1("UPDATE google_tokens SET access_token = ?, expires_at = ? WHERE id = ?", [
        data.access_token,
        Date.now() + data.expires_in * 1000,
        TOKEN_ROW_ID,
    ]);
    return data.access_token;
}

// ---------- Google Business Profile API ----------

async function gbpFetch(url: string, init: RequestInit = {}) {
    const token = await getValidAccessToken();
    const res = await fetch(url, {
        ...init,
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            ...(init.headers || {}),
        },
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) {
        const msg = data.error?.message || `Google API error ${res.status}`;
        // Default GBP quota is 0 until Google approves API access for the project
        if (res.status === 429 || (res.status === 403 && /quota|rate/i.test(msg))) {
            throw new Error(
                "Google Business Profile API quota exceeded. If you just set this up, your project may still be waiting for GBP API access approval from Google."
            );
        }
        throw new Error(msg);
    }
    return data;
}

export interface GbpLocation {
    /** Full reviews path: accounts/{aid}/locations/{lid} */
    name: string;
    title: string;
    address?: string;
}

/** Lists all locations across all accounts the connected user can manage. */
export async function listLocations(): Promise<GbpLocation[]> {
    const accountsData = await gbpFetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts");
    const accounts: any[] = accountsData.accounts || [];

    const locations: GbpLocation[] = [];
    for (const account of accounts) {
        let pageToken: string | undefined;
        do {
            const params = new URLSearchParams({
                readMask: "name,title,storefrontAddress",
                pageSize: "100",
            });
            if (pageToken) params.set("pageToken", pageToken);
            const data = await gbpFetch(
                `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?${params.toString()}`
            );
            for (const loc of data.locations || []) {
                const addr = loc.storefrontAddress;
                locations.push({
                    // loc.name is "locations/{lid}" — prefix with the account for the v4 reviews API
                    name: `${account.name}/${loc.name}`,
                    title: loc.title || "(untitled)",
                    address: addr ? [addr.addressLines?.join(", "), addr.locality, addr.postalCode].filter(Boolean).join(", ") : undefined,
                });
            }
            pageToken = data.nextPageToken;
        } while (pageToken);
    }
    return locations;
}

export interface GbpReview {
    /** Full path: accounts/{aid}/locations/{lid}/reviews/{rid} */
    name: string;
    reviewId: string;
    reviewer: { displayName?: string; profilePhotoUrl?: string };
    starRating: "ONE" | "TWO" | "THREE" | "FOUR" | "FIVE";
    comment?: string;
    createTime: string;
    updateTime: string;
    reviewReply?: { comment: string; updateTime: string };
}

export const STAR_VALUE: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

export async function listReviews(locationName: string, pageToken?: string): Promise<{
    reviews: GbpReview[];
    averageRating?: number;
    totalReviewCount?: number;
    nextPageToken?: string;
}> {
    const params = new URLSearchParams({ pageSize: "50", orderBy: "updateTime desc" });
    if (pageToken) params.set("pageToken", pageToken);
    const data = await gbpFetch(
        `https://mybusiness.googleapis.com/v4/${locationName}/reviews?${params.toString()}`
    );
    return {
        reviews: (data.reviews || []).map((r: any) => ({ ...r, name: `${locationName}/reviews/${r.reviewId}` })),
        averageRating: data.averageRating,
        totalReviewCount: data.totalReviewCount,
        nextPageToken: data.nextPageToken,
    };
}

export async function replyToReview(reviewName: string, comment: string) {
    return gbpFetch(`https://mybusiness.googleapis.com/v4/${reviewName}/reply`, {
        method: "PUT",
        body: JSON.stringify({ comment }),
    });
}

// ---------- Auto-reply settings (D1) ----------

export interface AutoReplySettings {
    location_name: string;
    location_title: string;
    enabled: boolean;
    /** Star rating (1-5) -> reply template. "{name}" is replaced with the reviewer's first name. */
    templates: Record<string, string>;
    /** "template" = fixed templates per star rating, "ai" = AI-generated replies */
    mode: "template" | "ai";
    /** Business context / tone instructions passed to the AI */
    ai_instructions: string;
    /** Star ratings (1-5) auto-reply is allowed to respond to */
    allowed_stars: number[];
}

export async function getAutoReplySettings(locationName?: string): Promise<AutoReplySettings[]> {
    const sql = locationName
        ? "SELECT * FROM auto_reply_settings WHERE location_name = ?"
        : "SELECT * FROM auto_reply_settings";
    const { results } = await queryD1(sql, locationName ? [locationName] : []);
    return results.map((r: any) => ({
        location_name: r.location_name,
        location_title: r.location_title || "",
        enabled: !!r.enabled,
        templates: r.templates ? JSON.parse(r.templates) : {},
        mode: r.mode === "ai" ? "ai" : "template",
        ai_instructions: r.ai_instructions || "",
        allowed_stars: r.allowed_stars ? JSON.parse(r.allowed_stars) : [1, 2, 3, 4, 5],
    }));
}

export async function saveAutoReplySettings(s: AutoReplySettings) {
    await queryD1(
        `INSERT INTO auto_reply_settings (location_name, location_title, enabled, templates, mode, ai_instructions, allowed_stars, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(location_name) DO UPDATE SET
           location_title = excluded.location_title,
           enabled = excluded.enabled,
           templates = excluded.templates,
           mode = excluded.mode,
           ai_instructions = excluded.ai_instructions,
           allowed_stars = excluded.allowed_stars,
           updated_at = excluded.updated_at`,
        [
            s.location_name,
            s.location_title,
            s.enabled ? 1 : 0,
            JSON.stringify(s.templates),
            s.mode === "ai" ? "ai" : "template",
            s.ai_instructions || "",
            JSON.stringify(s.allowed_stars?.length ? s.allowed_stars : [1, 2, 3, 4, 5]),
            new Date().toISOString(),
        ]
    );
}

export async function hasReplied(reviewName: string): Promise<boolean> {
    const { results } = await queryD1("SELECT review_name FROM replied_reviews WHERE review_name = ? LIMIT 1", [reviewName]);
    return results.length > 0;
}

export async function markReplied(review: GbpReview, locationName: string, comment: string) {
    await queryD1(
        `INSERT INTO replied_reviews (review_name, location_name, star_rating, reply_comment, replied_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(review_name) DO UPDATE SET reply_comment = excluded.reply_comment, replied_at = excluded.replied_at`,
        [review.name, locationName, review.starRating, comment, new Date().toISOString()]
    );
}
