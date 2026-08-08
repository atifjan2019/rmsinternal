import {
    getAutoReplySettings,
    listReviews,
    replyToReview,
    hasReplied,
    markReplied,
    STAR_VALUE,
    type GbpReview,
} from "./google";
import { aiConfigured, generateReviewReply } from "./ai";

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

                const starNum = STAR_VALUE[review.starRating] || 0;

                // Only reply to star ratings the user has allowed
                if (!settings.allowed_stars.includes(starNum)) {
                    result.skipped++;
                    continue;
                }

                const star = String(starNum);
                const template = settings.templates[star];
                const useAi = settings.mode === "ai" && aiConfigured();

                // Template mode with no template for this rating -> intentionally skip
                if (!useAi && (!template || !template.trim())) {
                    result.skipped++;
                    continue;
                }

                if (await hasReplied(review.name)) {
                    result.skipped++;
                    continue;
                }

                try {
                    let comment: string;
                    if (useAi) {
                        try {
                            comment = await generateReviewReply({
                                reviewerName: review.reviewer?.displayName || "",
                                starRating: STAR_VALUE[review.starRating] || 0,
                                comment: review.comment,
                                businessName: settings.location_title || "our business",
                                instructions: settings.ai_instructions,
                            });
                        } catch (aiErr: any) {
                            // AI failed — fall back to the template for this rating if there is one
                            if (template && template.trim()) {
                                comment = renderTemplate(template, review);
                            } else {
                                throw aiErr;
                            }
                        }
                    } else {
                        comment = renderTemplate(template!, review);
                    }
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
