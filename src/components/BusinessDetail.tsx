import React, { useState, useEffect, useCallback } from "react";
import type { GoogleStatus, GbpLocation } from "./GoogleReviews";

interface GbpReview {
    name: string;
    reviewId: string;
    reviewer: { displayName?: string; profilePhotoUrl?: string };
    starRating: "ONE" | "TWO" | "THREE" | "FOUR" | "FIVE";
    comment?: string;
    createTime: string;
    updateTime: string;
    reviewReply?: { comment: string; updateTime: string };
}

const STAR_VALUE: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

const DEFAULT_TEMPLATES: Record<string, string> = {
    "5": "Thank you so much, {name}! We really appreciate your kind words and your support. 🌟",
    "4": "Thanks for the great feedback, {name}! We're glad you had a good experience.",
    "3": "Thank you for your feedback, {name}. We're always working to improve — we hope to serve you even better next time.",
    "2": "Thank you for your honest feedback, {name}. We're sorry your experience wasn't ideal — please reach out so we can put it right.",
    "1": "We're very sorry to hear this, {name}. Please contact us directly so we can understand what went wrong and make it right.",
};

function Stars({ rating }: { rating: number }) {
    return (
        <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map((i) => (
                <svg
                    key={i}
                    className={`h-4 w-4 ${i <= rating ? "text-amber-400" : "text-slate-200"}`}
                    fill="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
            ))}
        </div>
    );
}

export default function BusinessDetail({ locationId }: { locationId: string }) {
    const [status, setStatus] = useState<GoogleStatus | null>(null);
    const [location, setLocation] = useState<GbpLocation | null>(null);
    const [reviews, setReviews] = useState<GbpReview[]>([]);
    const [reviewMeta, setReviewMeta] = useState<{ averageRating?: number; totalReviewCount?: number }>({});
    const [loading, setLoading] = useState(true);
    const [reviewsLoading, setReviewsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [replyingTo, setReplyingTo] = useState<string | null>(null);
    const [replyText, setReplyText] = useState("");
    const [replySaving, setReplySaving] = useState(false);
    const [generating, setGenerating] = useState(false);

    const [reviewTab, setReviewTab] = useState<"new" | "replied">("new");
    const [page, setPage] = useState(1);
    const [nextPageToken, setNextPageToken] = useState<string | undefined>(undefined);
    const [loadingMore, setLoadingMore] = useState(false);
    const PER_PAGE = 10;

    const [showSettings, setShowSettings] = useState(false);
    const [settingsEnabled, setSettingsEnabled] = useState(false);
    const [settingsMode, setSettingsMode] = useState<"template" | "ai">("template");
    const [aiInstructions, setAiInstructions] = useState("");
    const [allowedStars, setAllowedStars] = useState<number[]>([1, 2, 3, 4, 5]);
    const [templates, setTemplates] = useState<Record<string, string>>(DEFAULT_TEMPLATES);
    const [settingsSaving, setSettingsSaving] = useState(false);
    const [settingsSaved, setSettingsSaved] = useState(false);

    const loadReviews = useCallback(async (loc: GbpLocation) => {
        setReviewsLoading(true);
        try {
            const res = await fetch(`/api/google/reviews?location=${encodeURIComponent(loc.name)}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to load reviews");
            setReviews(data.reviews || []);
            setNextPageToken(data.nextPageToken);
            setReviewMeta({ averageRating: data.averageRating, totalReviewCount: data.totalReviewCount });
        } catch (err: any) {
            setError(err.message);
        } finally {
            setReviewsLoading(false);
        }
    }, []);

    useEffect(() => {
        (async () => {
            try {
                const [statusRes, locRes] = await Promise.all([
                    fetch("/api/google/status"),
                    fetch("/api/google/locations"),
                ]);
                const statusData = await statusRes.json();
                setStatus(statusData);
                const locData = await locRes.json();
                if (!locRes.ok) throw new Error(locData.error || "Failed to load business");
                const loc = (locData.locations || []).find((l: GbpLocation) =>
                    l.name.endsWith(`/locations/${locationId}`)
                );
                if (!loc) throw new Error("Business not found. Try refreshing the list on the dashboard.");
                setLocation(loc);
                setSettingsEnabled(loc.autoReply?.enabled || false);
                setSettingsMode(loc.autoReply?.mode || "template");
                setAiInstructions(loc.autoReply?.ai_instructions || "");
                setAllowedStars(
                    loc.autoReply?.allowed_stars?.length ? loc.autoReply.allowed_stars : [1, 2, 3, 4, 5]
                );
                setTemplates(
                    loc.autoReply?.templates && Object.keys(loc.autoReply.templates).length > 0
                        ? { ...DEFAULT_TEMPLATES, ...loc.autoReply.templates }
                        : DEFAULT_TEMPLATES
                );
                loadReviews(loc);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        })();
    }, [locationId, loadReviews]);

    async function loadMoreFromGoogle() {
        if (!location || !nextPageToken) return;
        setLoadingMore(true);
        try {
            const res = await fetch(
                `/api/google/reviews?location=${encodeURIComponent(location.name)}&pageToken=${encodeURIComponent(nextPageToken)}`
            );
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to load more reviews");
            setReviews((prev) => [...prev, ...(data.reviews || [])]);
            setNextPageToken(data.nextPageToken);
        } catch (err: any) {
            alert(`Error: ${err.message}`);
        } finally {
            setLoadingMore(false);
        }
    }

    async function handleReply(reviewName: string) {
        if (!replyText.trim()) return;
        setReplySaving(true);
        try {
            const res = await fetch("/api/google/reviews", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reviewName, comment: replyText }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to post reply");
            setReviews((prev) =>
                prev.map((r) =>
                    r.name === reviewName
                        ? { ...r, reviewReply: { comment: replyText.trim(), updateTime: new Date().toISOString() } }
                        : r
                )
            );
            setReplyingTo(null);
            setReplyText("");
        } catch (err: any) {
            alert(`Error: ${err.message}`);
        } finally {
            setReplySaving(false);
        }
    }

    async function handleGenerateAi(review: GbpReview) {
        if (!location) return;
        setGenerating(true);
        try {
            const res = await fetch("/api/google/generate-reply", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    reviewerName: review.reviewer?.displayName || "",
                    starRating: STAR_VALUE[review.starRating] || 0,
                    comment: review.comment,
                    businessName: location.title,
                    instructions: aiInstructions,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to generate reply");
            setReplyText(data.reply);
        } catch (err: any) {
            alert(`Error: ${err.message}`);
        } finally {
            setGenerating(false);
        }
    }

    async function handleSaveSettings() {
        if (!location) return;
        setSettingsSaving(true);
        setSettingsSaved(false);
        try {
            const res = await fetch("/api/google/auto-reply", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    location_name: location.name,
                    location_title: location.title,
                    enabled: settingsEnabled,
                    templates,
                    mode: settingsMode,
                    ai_instructions: aiInstructions,
                    allowed_stars: allowedStars,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to save settings");
            setSettingsSaved(true);
            setTimeout(() => setSettingsSaved(false), 2500);
        } catch (err: any) {
            alert(`Error: ${err.message}`);
        } finally {
            setSettingsSaving(false);
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24 text-slate-400">
                <svg className="h-8 w-8 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
            </div>
        );
    }

    if (!location) {
        return (
            <div className="rounded-3xl border border-red-100 bg-red-50 p-8 text-center text-sm font-semibold text-red-600">
                {error || "Business not found."}
                <div className="mt-4">
                    <a href="/dashboard" className="font-bold text-slate-600 underline">
                        Back to dashboard
                    </a>
                </div>
            </div>
        );
    }

    const newReviews = reviews.filter((r) => !r.reviewReply);
    const repliedReviews = reviews.filter((r) => !!r.reviewReply);
    const tabReviews = reviewTab === "new" ? newReviews : repliedReviews;
    const totalPages = Math.max(1, Math.ceil(tabReviews.length / PER_PAGE));
    const currentPage = Math.min(page, totalPages);
    const pagedReviews = tabReviews.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

    return (
        <div className="space-y-6">
            {/* Business header */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                    <a
                        href="/dashboard"
                        className="mb-2 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400 transition-colors hover:text-[#EE314F]"
                    >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                        </svg>
                        All Businesses
                    </a>
                    <h2 className="truncate text-3xl font-bold text-slate-900">{location.title}</h2>
                    <p className="mt-1 text-sm text-slate-500">
                        {location.address ? `${location.address} · ` : ""}
                        {reviewMeta.totalReviewCount ?? reviews.length} reviews
                        {reviewMeta.averageRating ? ` · ${reviewMeta.averageRating.toFixed(1)} average` : ""}
                    </p>
                </div>
                <button
                    onClick={() => setShowSettings(!showSettings)}
                    className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition-all ${
                        showSettings ? "bg-slate-100 text-slate-600" : "bg-slate-900 text-white hover:bg-slate-800"
                    }`}
                >
                    {showSettings ? "Close Settings" : "Auto-Reply Settings"}
                </button>
            </div>

            {error && (
                <div className="rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm font-semibold text-red-600">
                    {error}
                </div>
            )}

            {/* Auto-reply settings */}
            {showSettings && (
                <div className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-8">
                    <div className="absolute left-0 top-0 h-full w-2 bg-[#EE314F]" />
                    <div className="mb-6 flex items-center justify-between">
                        <div>
                            <h4 className="text-lg font-bold text-slate-900">Auto-Reply Settings</h4>
                            <p className="mt-1 text-sm text-slate-500">Choose how replies are written for this business.</p>
                        </div>
                        <label className="flex cursor-pointer items-center gap-3">
                            <span className="text-sm font-bold text-slate-700">Enabled</span>
                            <input
                                type="checkbox"
                                checked={settingsEnabled}
                                onChange={(e) => setSettingsEnabled(e.target.checked)}
                                className="h-5 w-5 accent-[#EE314F]"
                            />
                        </label>
                    </div>

                    {/* Mode selector */}
                    <div className="mb-6 grid gap-3 sm:grid-cols-2">
                        <button
                            type="button"
                            onClick={() => setSettingsMode("ai")}
                            className={`rounded-2xl border-2 p-4 text-left transition-all ${
                                settingsMode === "ai"
                                    ? "border-[#EE314F] bg-[#EE314F]/5"
                                    : "border-slate-200 bg-white hover:border-slate-300"
                            }`}
                        >
                            <span className="flex items-center gap-2 text-sm font-bold text-slate-900">
                                ✨ AI-Generated Replies
                                {!status?.ai && (
                                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-600">
                                        Needs API key
                                    </span>
                                )}
                            </span>
                            <span className="mt-1 block text-xs text-slate-500">
                                Unique, personalized reply written for every review using your knowledge base.
                            </span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setSettingsMode("template")}
                            className={`rounded-2xl border-2 p-4 text-left transition-all ${
                                settingsMode === "template"
                                    ? "border-[#EE314F] bg-[#EE314F]/5"
                                    : "border-slate-200 bg-white hover:border-slate-300"
                            }`}
                        >
                            <span className="block text-sm font-bold text-slate-900">📝 Fixed Templates</span>
                            <span className="mt-1 block text-xs text-slate-500">
                                Same reply per star rating, with {"{name}"} personalization.
                            </span>
                        </button>
                    </div>

                    {/* Star ratings filter */}
                    <div className="mb-6">
                        <label className="mb-1.5 block text-sm font-semibold text-slate-700">Reply to these ratings</label>
                        <p className="mb-2 text-xs text-slate-400">
                            Auto-reply only responds to the selected star ratings — deselect low ratings if you prefer to
                            answer those personally.
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {[5, 4, 3, 2, 1].map((star) => {
                                const active = allowedStars.includes(star);
                                return (
                                    <button
                                        key={star}
                                        type="button"
                                        onClick={() =>
                                            setAllowedStars((prev) =>
                                                active ? prev.filter((s) => s !== star) : [...prev, star]
                                            )
                                        }
                                        className={`flex items-center gap-1.5 rounded-xl border-2 px-4 py-2 text-sm font-bold transition-all ${
                                            active
                                                ? "border-[#EE314F] bg-[#EE314F]/5 text-slate-900"
                                                : "border-slate-200 bg-white text-slate-400 hover:border-slate-300"
                                        }`}
                                    >
                                        <svg
                                            className={`h-4 w-4 ${active ? "text-amber-400" : "text-slate-300"}`}
                                            fill="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                                        </svg>
                                        {star}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {settingsMode === "ai" ? (
                        <div>
                            <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                                Knowledge Base — about your business &amp; how to reply
                            </label>
                            <p className="mb-2 text-xs text-slate-400">
                                Describe the business, services, tone, and anything the AI should know or mention (e.g.
                                "Mobile tyre fitting company in Bolton. Friendly but professional tone. For complaints,
                                ask them to call 01204 XXXXXX. Mention we operate 24/7.")
                            </p>
                            <textarea
                                value={aiInstructions}
                                onChange={(e) => setAiInstructions(e.target.value)}
                                rows={6}
                                placeholder="Tell the AI about this business and what kind of replies you want..."
                                className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-900 transition-all focus:border-[#EE314F] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#EE314F]/5"
                            />
                            <p className="mt-2 text-xs text-slate-400">
                                Templates are kept as a fallback if AI generation ever fails.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <p className="text-sm text-slate-500">
                                Use <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-bold">{"{name}"}</code>{" "}
                                to insert the reviewer's first name. Leave a template empty to skip that rating.
                            </p>
                            {["5", "4", "3", "2", "1"].map((star) => (
                                <div key={star}>
                                    <label className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-slate-700">
                                        <Stars rating={parseInt(star)} />
                                        <span>{star}-star reviews</span>
                                    </label>
                                    <textarea
                                        value={templates[star] || ""}
                                        onChange={(e) => setTemplates({ ...templates, [star]: e.target.value })}
                                        rows={2}
                                        className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-900 transition-all focus:border-[#EE314F] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#EE314F]/5"
                                    />
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-5">
                        {settingsSaved && <span className="text-sm font-bold text-green-600">Saved ✓</span>}
                        <button
                            onClick={handleSaveSettings}
                            disabled={settingsSaving}
                            className="rounded-xl bg-[#EE314F] px-8 py-3 text-sm font-bold text-white transition-all hover:bg-[#d42a45] disabled:opacity-50"
                        >
                            {settingsSaving ? "Saving..." : "Save Settings"}
                        </button>
                    </div>
                </div>
            )}

            {/* Reviews */}
            {reviewsLoading ? (
                <div className="flex items-center justify-center py-16 text-slate-400">
                    <svg className="h-6 w-6 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                </div>
            ) : reviews.length === 0 ? (
                <div className="rounded-3xl border border-slate-200 bg-white py-16 text-center text-slate-400">
                    No reviews found for this business.
                </div>
            ) : (
                <>
                {/* Review tabs */}
                <div className="inline-flex rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
                    <button
                        onClick={() => {
                            setReviewTab("new");
                            setPage(1);
                        }}
                        className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition-all ${
                            reviewTab === "new" ? "bg-slate-900 text-white shadow" : "text-slate-500 hover:text-slate-900"
                        }`}
                    >
                        New Reviews
                        <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                                reviewTab === "new" ? "bg-white/20 text-white" : "bg-[#EE314F]/10 text-[#EE314F]"
                            }`}
                        >
                            {newReviews.length}
                        </span>
                    </button>
                    <button
                        onClick={() => {
                            setReviewTab("replied");
                            setPage(1);
                        }}
                        className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition-all ${
                            reviewTab === "replied"
                                ? "bg-slate-900 text-white shadow"
                                : "text-slate-500 hover:text-slate-900"
                        }`}
                    >
                        Replied
                        <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                                reviewTab === "replied" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                            }`}
                        >
                            {repliedReviews.length}
                        </span>
                    </button>
                </div>

                {tabReviews.length === 0 ? (
                    <div className="rounded-3xl border border-slate-200 bg-white py-16 text-center text-slate-400">
                        {reviewTab === "new"
                            ? "All caught up — every review has a reply. 🎉"
                            : "No replied reviews yet."}
                    </div>
                ) : (
                <div className="space-y-4">
                    {pagedReviews.map((review) => (
                        <div key={review.name} className="rounded-3xl border border-slate-200 bg-white p-6">
                            <div className="flex items-start gap-4">
                                {review.reviewer?.profilePhotoUrl ? (
                                    <img
                                        src={review.reviewer.profilePhotoUrl}
                                        alt=""
                                        className="h-11 w-11 rounded-full object-cover"
                                        referrerPolicy="no-referrer"
                                    />
                                ) : (
                                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 font-bold text-slate-400">
                                        {(review.reviewer?.displayName || "?").charAt(0)}
                                    </div>
                                )}
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-3">
                                        <span className="font-bold text-slate-900">
                                            {review.reviewer?.displayName || "Anonymous"}
                                        </span>
                                        <Stars rating={STAR_VALUE[review.starRating] || 0} />
                                        <span className="text-xs text-slate-400">
                                            {new Date(review.createTime).toLocaleDateString()}
                                        </span>
                                    </div>
                                    {review.comment && (
                                        <p className="mt-2 text-sm leading-relaxed text-slate-600">{review.comment}</p>
                                    )}

                                    {review.reviewReply ? (
                                        <div className="mt-4 rounded-2xl bg-slate-50 p-4">
                                            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                                                Your reply
                                            </p>
                                            <p className="mt-1.5 text-sm text-slate-600">{review.reviewReply.comment}</p>
                                        </div>
                                    ) : replyingTo === review.name ? (
                                        <div className="mt-4 space-y-3">
                                            <textarea
                                                value={replyText}
                                                onChange={(e) => setReplyText(e.target.value)}
                                                rows={3}
                                                autoFocus
                                                placeholder="Write your reply..."
                                                className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-900 transition-all focus:border-[#EE314F] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#EE314F]/5"
                                            />
                                            <div className="flex flex-wrap gap-2">
                                                <button
                                                    onClick={() => handleReply(review.name)}
                                                    disabled={replySaving || !replyText.trim()}
                                                    className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-bold text-white transition-all hover:bg-slate-800 disabled:opacity-50"
                                                >
                                                    {replySaving ? "Posting..." : "Post Reply"}
                                                </button>
                                                {status?.ai && (
                                                    <button
                                                        onClick={() => handleGenerateAi(review)}
                                                        disabled={generating}
                                                        className="rounded-xl border border-[#EE314F]/30 bg-[#EE314F]/5 px-5 py-2 text-sm font-bold text-[#EE314F] transition-all hover:bg-[#EE314F]/10 disabled:opacity-50"
                                                    >
                                                        {generating ? "Generating..." : "✨ Generate with AI"}
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => {
                                                        setReplyingTo(null);
                                                        setReplyText("");
                                                    }}
                                                    className="rounded-xl px-5 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => {
                                                setReplyingTo(review.name);
                                                setReplyText("");
                                            }}
                                            className="mt-3 text-sm font-bold text-[#EE314F] hover:underline"
                                        >
                                            Reply
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                )}

                {/* Pagination */}
                {(totalPages > 1 || nextPageToken) && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setPage(currentPage - 1)}
                                disabled={currentPage <= 1}
                                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition-all hover:bg-slate-50 disabled:opacity-40"
                            >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                                </svg>
                            </button>
                            <span className="text-sm font-semibold text-slate-600">
                                Page {currentPage} of {totalPages}
                            </span>
                            <button
                                onClick={() => setPage(currentPage + 1)}
                                disabled={currentPage >= totalPages}
                                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition-all hover:bg-slate-50 disabled:opacity-40"
                            >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                </svg>
                            </button>
                        </div>
                        {nextPageToken && (
                            <button
                                onClick={loadMoreFromGoogle}
                                disabled={loadingMore}
                                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition-all hover:bg-slate-50 disabled:opacity-50"
                            >
                                {loadingMore ? "Loading..." : "Load older reviews from Google"}
                            </button>
                        )}
                    </div>
                )}
                </>
            )}
        </div>
    );
}
