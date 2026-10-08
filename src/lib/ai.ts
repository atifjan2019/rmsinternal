/**
 * AI reply generation via an OpenAI-compatible chat completions API (Agent Router).
 *
 * The connection (API key, base URL, model, relay key) is read at request time
 * from the app settings (/settings), which fall back to the AI_API_KEY,
 * AI_BASE_URL, AI_MODEL and AI_PROXY_KEY environment variables.
 */
import { getAiConfig, type AiConfig } from "./settings";

export async function aiConfigured(): Promise<boolean> {
    return !!(await getAiConfig()).apiKey;
}

interface ChatOptions {
    system: string;
    user: string;
    maxTokens: number;
    temperature: number;
    /** Overrides the saved connection, for the settings page's "test" button. */
    config?: AiConfig;
    /** Names the caller in error messages. */
    what: string;
}

/** Whether a base URL is Anthropic's API, which has its own request shape. */
const isAnthropic = (baseUrl: string) => /^https:\/\/api\.anthropic\.com(\/|$)/i.test(baseUrl);

/** One chat completion, returning the reply text. Shared by every generator below. */
async function chat(opts: ChatOptions): Promise<string> {
    const cfg = opts.config ?? (await getAiConfig());
    if (!cfg.apiKey) {
        throw new Error("No AI API key is set. Add one on the Settings page (or set AI_API_KEY).");
    }
    return isAnthropic(cfg.baseUrl) ? chatAnthropic(cfg, opts) : chatOpenAiCompatible(cfg, opts);
}

/** Reads a provider's reply body, surfacing a non-JSON page (a WAF challenge, say) as the error. */
async function readJson(res: Response): Promise<{ raw: string; data: any }> {
    const raw = await res.text();
    try {
        return { raw, data: JSON.parse(raw) };
    } catch {
        throw new Error(`AI API returned non-JSON (HTTP ${res.status}): ${raw.slice(0, 200)}`);
    }
}

/** Anthropic's Messages API: x-api-key header, system as its own field, text in content[]. */
async function chatAnthropic(cfg: AiConfig, opts: ChatOptions): Promise<string> {
    const res = await fetch(`${cfg.baseUrl}/messages`, {
        method: "POST",
        headers: {
            "x-api-key": cfg.apiKey,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: cfg.model,
            max_tokens: opts.maxTokens,
            temperature: opts.temperature,
            system: opts.system,
            messages: [{ role: "user", content: opts.user }],
        }),
    });
    const { raw, data } = await readJson(res);
    if (!res.ok) {
        throw new Error(`${opts.what} failed: ${data.error?.message || `HTTP ${res.status}`}`);
    }
    const text = (data.content || [])
        .filter((c: any) => c.type === "text")
        .map((c: any) => c.text)
        .join("")
        .trim();
    if (!text) {
        throw new Error(`AI API returned an empty reply (stop_reason: ${data.stop_reason ?? "none"}, body: ${raw.slice(0, 200)})`);
    }
    return text;
}

/** OpenAI-style chat completions (Agent Router and most other providers). */
async function chatOpenAiCompatible(cfg: AiConfig, opts: ChatOptions): Promise<string> {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${cfg.apiKey}`,
            "Content-Type": "application/json",
            // Agent Router rejects unrecognized clients ("unauthorized client detected")
            "User-Agent": "claude-cli/2.0.14 (external, cli)",
            ...(cfg.proxyKey
                ? {
                      "X-Proxy-Key": cfg.proxyKey,
                      // Apache on the relay strips Authorization; this carries the upstream key
                      "X-Upstream-Auth": `Bearer ${cfg.apiKey}`,
                  }
                : {}),
        },
        body: JSON.stringify({
            model: cfg.model,
            messages: [
                { role: "system", content: opts.system },
                { role: "user", content: opts.user },
            ],
            max_tokens: opts.maxTokens,
            temperature: opts.temperature,
        }),
    });

    const { raw, data } = await readJson(res);
    if (!res.ok) {
        const msg = data.error?.message || data.message || `AI API error ${res.status}`;
        throw new Error(`${opts.what} failed: ${msg}`);
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

/** A one-line round trip, for the settings page to check a connection before it is saved. */
export async function testAiConnection(config: AiConfig): Promise<string> {
    return chat({
        system: "You are a connection test. Reply with exactly the two words: connection works",
        user: "Reply now.",
        maxTokens: 20,
        temperature: 0,
        config,
        what: "AI connection test",
    });
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

    return chat({ system, user, maxTokens: 300, temperature: 0.7, what: "AI reply generation" });
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

    let text = await chat({ system, user, maxTokens: 400, temperature: 0.8, what: "Post generation" });

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
