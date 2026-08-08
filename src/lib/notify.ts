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

export function buildReviewEmailHtml(r: {
    reviewer: string;
    stars: number;
    comment: string;
    locationTitle: string;
    locationId?: string;
}): string {
    const starRow = [1, 2, 3, 4, 5]
        .map(
            (i) =>
                `<span style="font-size:26px;line-height:1;color:${i <= r.stars ? "#F59E0B" : "#E2E8F0"};">&#9733;</span>`
        )
        .join("");

    return `<!doctype html>
<html>
<body style="margin:0;padding:0;background-color:#F1F5F9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F1F5F9;padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

  <!-- Brand header -->
  <tr><td align="center" style="padding:0 0 24px;">
    <img src="https://rms.webspires.co.uk/favicon.png" width="44" height="44" alt="Webspires" style="display:inline-block;vertical-align:middle;border-radius:10px;">
    <span style="display:inline-block;vertical-align:middle;margin-left:10px;font-size:20px;font-weight:800;color:#0F172A;letter-spacing:-0.02em;">Review Manager</span>
    <div style="margin-top:4px;font-size:10px;font-weight:700;letter-spacing:0.2em;color:#94A3B8;text-transform:uppercase;">Webspires Systems</div>
  </td></tr>

  <!-- Card -->
  <tr><td style="background-color:#FFFFFF;border:1px solid #E2E8F0;border-radius:24px;padding:0;overflow:hidden;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="background-color:#EE314F;height:6px;font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td style="padding:36px 40px 40px;">

        <div style="font-size:11px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:#EE314F;margin-bottom:14px;">&#11088; New Review</div>

        <div style="font-size:24px;font-weight:800;color:#0F172A;letter-spacing:-0.02em;line-height:1.25;margin-bottom:6px;">
          ${r.reviewer} left a ${r.stars ? `${r.stars}-star ` : ""}review
        </div>
        ${r.locationTitle ? `<div style="font-size:14px;color:#64748B;margin-bottom:18px;">${r.locationTitle}</div>` : ""}

        <div style="margin-bottom:22px;">${starRow}</div>

        ${
            r.comment
                ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                     <tr>
                       <td width="4" style="background-color:#EE314F;border-radius:4px;font-size:0;">&nbsp;</td>
                       <td style="background-color:#F8FAFC;border-radius:0 14px 14px 0;padding:16px 20px;font-size:15px;line-height:1.6;color:#334155;font-style:italic;">
                         &ldquo;${r.comment}&rdquo;
                       </td>
                     </tr>
                   </table>`
                : ""
        }

        <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:14px;background-color:#EE314F;">
          <a href="https://rms.webspires.co.uk/business/${r.locationId || ""}" style="display:inline-block;padding:14px 30px;font-size:14px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:14px;">
            Reply to this review &rarr;
          </a>
        </td></tr></table>

        <div style="margin-top:26px;padding-top:22px;border-top:1px solid #F1F5F9;font-size:12px;line-height:1.6;color:#94A3B8;">
          If auto-reply is enabled for this business, a reply will be posted automatically about 10 minutes after the review landed.
        </div>

      </td></tr>
    </table>
  </td></tr>

  <!-- Footer -->
  <tr><td align="center" style="padding:26px 0 0;">
    <div style="font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#CBD5E1;">&copy; 2026 Webspires &middot; Review Management Pro</div>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
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
        await sendEmail(
            `${title}${locationTitle ? ` — ${locationTitle}` : ""}`,
            buildReviewEmailHtml({ reviewer, stars, comment, locationTitle, locationId })
        );
    } catch (err: any) {
        // Notifications must never break the reply pipeline
        console.error("notifyNewReview error:", err.message);
    }
}
