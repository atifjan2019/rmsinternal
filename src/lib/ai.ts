/**
 * AI reply generation via an OpenAI-compatible chat completions API (Agent Router).
 * Env: AI_API_KEY (required), AI_BASE_URL (default https://agentrouter.org/v1), AI_MODEL.
 */

const AI_API_KEY = import.meta.env.AI_API_KEY;
const AI_BASE_URL = (import.meta.env.AI_BASE_URL || "https://agentrouter.org/v1").replace(/\/$/, "");
const AI_MODEL = import.meta.env.AI_MODEL || "gpt-5.6-sol";
// Set when AI_BASE_URL points at our Cloudways relay (agentrouter.org WAF-blocks Vercel egress)
const AI_PROXY_KEY = import.meta.env.AI_PROXY_KEY;

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
            ...(AI_PROXY_KEY
                ? {
                      "X-Proxy-Key": AI_PROXY_KEY,
                      // Apache on the relay strips Authorization; this carries the upstream key
                      "X-Upstream-Auth": `Bearer ${AI_API_KEY}`,
                  }
                : {}),
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


export interface PostCopyRequest {
    businessName: string;
    /** The per-business knowledge base, reused from auto-reply settings. */
    knowledge?: string;
    /** Theme for this post; blank lets the model pick from the knowledge base. */
    topic?: string;
    /** Recent posts, so the model does not repeat itself. */
    avoid?: string[];
}

/**
 * Writes the body of a Google Business Profile post.
 *
 * Google rejects posts over 1500 characters and truncates in the UI at about
 * 250, so the prompt aims short and the result is hard-capped below.
 */
export async function generatePostCopy(req: PostCopyRequest): Promise<string> {
    if (!AI_API_KEY) {
        throw new Error("AI_API_KEY environment variable is not set.");
    }

    const system = [
        `You write short Google Business Profile posts for "${req.businessName}".`,
        "Rules:",
        "- Output ONLY the post text. No title, no hashtags, no markdown, no quotes around it.",
        "- 2-3 sentences, 40-70 words. Plain, concrete, useful to a local customer.",
        "- Lead with the service or offer, then the practical detail (area covered, timing, what to expect).",
        "- British English. No emoji. No ALL CAPS. No invented prices, discounts, guarantees or awards.",
        "- Never invent facts that are not in the business information below.",
        "- Do not start with 'Looking for' or 'Are you'.",
        req.knowledge ? `Business information: ${req.knowledge}` : "",
    ].filter(Boolean).join("\n");

    const user = [
        req.topic ? `Write a post about: ${req.topic}` : "Write a post about one of this business's main services.",
        req.avoid && req.avoid.length
            ? `Do not repeat these recent posts (use a different angle and different opening):\n- ${req.avoid.join("\n- ")}`
            : "",
    ].filter(Boolean).join("\n\n");

    const res = await fetch(`${AI_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${AI_API_KEY}`,
            "Content-Type": "application/json",
            "User-Agent": "claude-cli/2.0.14 (external, cli)",
            ...(AI_PROXY_KEY
                ? { "X-Proxy-Key": AI_PROXY_KEY, "X-Upstream-Auth": `Bearer ${AI_API_KEY}` }
                : {}),
        },
        body: JSON.stringify({
            model: AI_MODEL,
            messages: [
                { role: "system", content: system },
                { role: "user", content: user },
            ],
            max_tokens: 400,
            temperature: 0.8,
        }),
    });

    const raw = await res.text();
    let data: any = {};
    try {
        data = JSON.parse(raw);
    } catch {
        throw new Error(`AI API returned non-JSON (HTTP ${res.status}): ${raw.slice(0, 200)}`);
    }

    if (!res.ok) {
        throw new Error(`Post generation failed: ${data.error?.message || data.message || res.status}`);
    }

    let text = data.choices?.[0]?.message?.content?.trim();
    if (!text) {
        throw new Error(`AI returned an empty post (finish_reason: ${data.choices?.[0]?.finish_reason ?? "none"})`);
    }

    // Models occasionally wrap the line in quotes despite the instruction.
    text = text.replace(/^["\u201c]|["\u201d]$/g, "").trim();

    // Google's hard limit is 1500 characters; trim on a sentence where possible.
    if (text.length > 1400) {
        const cut = text.slice(0, 1400);
        const lastStop = cut.lastIndexOf(". ");
        text = (lastStop > 600 ? cut.slice(0, lastStop + 1) : cut).trim();
    }

    return text;
}
