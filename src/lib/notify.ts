import nodemailer from "nodemailer";
import { queryD1 } from "./storage";
import { getReview, getCachedLocations, STAR_VALUE } from "./google";

/**
 * New-review notifications: a row in D1 (for the dashboard bell) plus an
 * email via SMTP_* env credentials. Keyed by review name so redeliveries
 * of the same Pub/Sub event never double-notify.
 */

const NOTIFY_EMAIL = import.meta.env.NOTIFY_EMAIL || "webspires@gmail.com";

function smtpConfigured(): boolean {
    return !!(import.meta.env.SMTP_HOST && import.meta.env.SMTP_USER && import.meta.env.SMTP_PASS);
}

async function sendEmail(subject: string, html: string) {
    if (!smtpConfigured()) {
        console.warn("SMTP not configured; skipping notification email");
        return;
    }
    const port = parseInt(import.meta.env.SMTP_PORT || "587", 10);
    const transport = nodemailer.createTransport({
        host: import.meta.env.SMTP_HOST,
        port,
        secure: port === 465,
        auth: { user: import.meta.env.SMTP_USER, pass: import.meta.env.SMTP_PASS },
    });
    await transport.sendMail({
        from: import.meta.env.SMTP_FROM || import.meta.env.SMTP_USER,
        to: NOTIFY_EMAIL,
        subject,
        html,
    });
}

/** Records + emails a new-review notification. Idempotent per review. Never throws. */
export async function notifyNewReview(reviewName: string, locationName?: string) {
    try {
        // Reserve the notification id first — zero changes means we already notified
        const { changes } = await queryD1(
            "INSERT INTO notifications (id, type, title, body, location_name, read, created_at) VALUES (?, 'new_review', 'New review', '', ?, 0, ?) ON CONFLICT(id) DO NOTHING",
            [reviewName, locationName || "", new Date().toISOString()]
        );
        if (!changes) return;

        // Enrich with review details + location title (best effort)
        let review: any = null;
        try {
            review = await getReview(reviewName);
        } catch (err: any) {
            console.error("notify: failed to fetch review:", err.message);
        }

        let locationTitle = "";
        try {
            const cached = await getCachedLocations();
            locationTitle = cached?.locations.find((l) => l.name === locationName)?.title || "";
        } catch {
            /* cache miss is fine */
        }

        const stars = review ? STAR_VALUE[review.starRating] || 0 : 0;
        const reviewer = review?.reviewer?.displayName || "A customer";
        const comment = review?.comment || "";
        const title = `New ${stars ? `${stars}-star ` : ""}review from ${reviewer}`;
        const body = [locationTitle, comment].filter(Boolean).join(" — ").slice(0, 300);

        await queryD1(
            "UPDATE notifications SET title = ?, body = ?, location_title = ?, star_rating = ?, reviewer = ? WHERE id = ?",
            [title, body, locationTitle, stars, reviewer, reviewName]
        );

        const locationId = (locationName || "").split("/").pop();
        const starRow = stars ? "⭐".repeat(stars) : "";
        await sendEmail(
            `${title}${locationTitle ? ` — ${locationTitle}` : ""}`,
            `<div style="font-family:sans-serif;max-width:520px">
                <h2 style="margin:0 0 4px">${title}</h2>
                ${locationTitle ? `<p style="margin:0 0 12px;color:#64748b">${locationTitle}</p>` : ""}
                ${starRow ? `<p style="font-size:20px;margin:0 0 12px">${starRow}</p>` : ""}
                ${comment ? `<blockquote style="margin:0 0 16px;padding:12px 16px;background:#f8fafc;border-left:4px solid #EE314F;border-radius:8px">${comment}</blockquote>` : ""}
                <p><a href="https://rms.webspires.co.uk/business/${locationId}" style="background:#EE314F;color:#fff;padding:10px 20px;border-radius:10px;text-decoration:none;font-weight:bold">Open in Review Manager</a></p>
                <p style="color:#94a3b8;font-size:12px">Auto-reply will answer this review ~10 minutes after it landed if enabled for this business.</p>
            </div>`
        );
    } catch (err: any) {
        // Notifications must never break the reply pipeline
        console.error("notifyNewReview error:", err.message);
    }
}
