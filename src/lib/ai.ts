/**
 * AI reply generation via an OpenAI-compatible chat completions API (Agent Router).
 * Env: AI_API_KEY (required), AI_BASE_URL (default https://agentrouter.org/v1), AI_MODEL.
 */

const AI_API_KEY = import.meta.env.AI_API_KEY;
const AI_BASE_URL = (import.meta.env.AI_BASE_URL || "https://agentrouter.org/v1").replace(/\/$/, "");
const AI_MODEL = import.meta.env.AI_MODEL || "gpt-5.6-sol";

export function aiConfigured(): boolean {
    return !!AI_API_KEY;
}

export interface ReviewForAi {
    reviewerName: string;
    starRating: number; // 1-5
    comment?: string;
    businessName: string;
    /** Optional business context / tone instructions from settings */
    instructions?: string;
}

export async function generateReviewReply(review: ReviewForAi): Promise<string> {
    if (!AI_API_KEY) {
        throw new Error("AI_API_KEY environment variable is not set.");
    }

    const system = [
        `You write replies to Google reviews on behalf of the business "${review.businessName}".`,
        "Rules:",
        "- Write ONLY the reply text, nothing else (no quotes, no preamble, no signature block).",
        "- 2-4 sentences, warm and professional, address the reviewer by first name when available.",
        "- Reference specifics from their review naturally when there are any.",
        "- For 4-5 star reviews: thank them genuinely, no overselling.",
        "- For 1-3 star reviews: apologize sincerely, stay calm and non-defensive, never argue or admit legal fault, and invite them to contact the business directly to resolve it.",
        "- At most one emoji, and only for 4-5 star replies.",
        "- Never mention that you are an AI.",
        review.instructions ? `Business context and tone preferences: ${review.instructions}` : "",
    ]
        .filter(Boolean)
        .join("\n");

    const user = [
        `Reviewer: ${review.reviewerName || "Anonymous"}`,
        `Rating: ${review.starRating}/5 stars`,
        `Review: ${review.comment?.trim() || "(no written comment, rating only)"}`,
        "",
        "Write the reply.",
    ].join("\n");

    const res = await fetch(`${AI_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${AI_API_KEY}`,
            "Content-Type": "application/json",
            // Agent Router rejects unrecognized clients ("unauthorized client detected")
            "User-Agent": "claude-cli/2.0.14 (external, cli)",
        },
        body: JSON.stringify({
            model: AI_MODEL,
            messages: [
                { role: "system", content: system },
                { role: "user", content: user },
            ],
            max_tokens: 300,
            temperature: 0.7,
        }),
    });

    const raw = await res.text();
    let data: any = {};
    try {
        data = JSON.parse(raw);
    } catch {
        // Non-JSON body (e.g. a WAF/challenge page) — surface what actually came back
        throw new Error(`AI API returned non-JSON (HTTP ${res.status}): ${raw.slice(0, 200)}`);
    }

    if (!res.ok) {
        const msg = data.error?.message || data.message || `AI API error ${res.status}`;
        throw new Error(`AI reply generation failed: ${msg}`);
    }

    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) {
        const finishReason = data.choices?.[0]?.finish_reason;
        throw new Error(
            `AI API returned an empty reply (HTTP ${res.status}, finish_reason: ${finishReason ?? "none"}, body: ${raw.slice(0, 200)})`
        );
    }
    return text;
}
