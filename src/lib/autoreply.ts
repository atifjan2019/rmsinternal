import {
    getAutoReplySettings,
    listReviews,
    replyToReview,
    hasReplied,
    markReplied,
    STAR_VALUE,
    type GbpReview,
} from "./google";

export interface AutoReplyResult {
    location: string;
    checked: number;
    replied: number;
    skipped: number;
    errors: string[];
}

function renderTemplate(template: string, review: GbpReview): string {
    const firstName = (review.reviewer?.displayName || "").trim().split(/\s+/)[0] || "there";
    return template.replaceAll("{name}", firstName);
}

/**
 * Runs one auto-reply pass over every location with auto-reply enabled.
 * Replies only to reviews that have no owner reply yet and that we haven't replied to before.
 */
export async function runAutoReply(): Promise<AutoReplyResult[]> {
    const allSettings = (await getAutoReplySettings()).filter((s) => s.enabled);
    const results: AutoReplyResult[] = [];

    for (const settings of allSettings) {
        const result: AutoReplyResult = {
            location: settings.location_title || settings.location_name,
            checked: 0,
            replied: 0,
            skipped: 0,
            errors: [],
        };

        try {
            // First page (50 newest by updateTime) is enough for a recurring pass
            const { reviews } = await listReviews(settings.location_name);
            for (const review of reviews) {
                result.checked++;

                if (review.reviewReply) {
                    result.skipped++;
                    continue;
                }

                const star = String(STAR_VALUE[review.starRating] || 0);
                const template = settings.templates[star];
                if (!template || !template.trim()) {
                    result.skipped++;
                    continue;
                }

                if (await hasReplied(review.name)) {
                    result.skipped++;
                    continue;
                }

                try {
                    const comment = renderTemplate(template, review);
                    await replyToReview(review.name, comment);
                    await markReplied(review, settings.location_name, comment);
                    result.replied++;
                } catch (err: any) {
                    result.errors.push(`${review.reviewer?.displayName || review.reviewId}: ${err.message}`);
                }
            }
        } catch (err: any) {
            result.errors.push(err.message);
        }

        results.push(result);
    }

    return results;
}
