import React, { useState, useEffect, useCallback } from "react";

interface GoogleStatus {
    connected: boolean;
    email: string | null;
    configured: boolean;
    ai: boolean;
}

interface AutoReplySettings {
    location_name: string;
    location_title: string;
    enabled: boolean;
    templates: Record<string, string>;
    mode: "template" | "ai";
    ai_instructions: string;
    allowed_stars: number[];
}

interface GbpLocation {
    name: string;
    title: string;
    address?: string;
    autoReply: AutoReplySettings | null;
}

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

export default function GoogleReviews() {
    const [status, setStatus] = useState<GoogleStatus | null>(null);
    const [locations, setLocations] = useState<GbpLocation[]>([]);
    const [selectedLocation, setSelectedLocation] = useState<GbpLocation | null>(null);
    const [reviews, setReviews] = useState<GbpReview[]>([]);
    const [reviewMeta, setReviewMeta] = useState<{ averageRating?: number; totalReviewCount?: number }>({});
    const [loading, setLoading] = useState(true);
    const [reviewsLoading, setReviewsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Manual reply state
    const [replyingTo, setReplyingTo] = useState<string | null>(null);
    const [replyText, setReplyText] = useState("");
    const [replySaving, setReplySaving] = useState(false);
    const [generating, setGenerating] = useState(false);

    // Auto-reply settings state
    const [showSettings, setShowSettings] = useState(false);
    const [settingsEnabled, setSettingsEnabled] = useState(false);
    const [settingsMode, setSettingsMode] = useState<"template" | "ai">("template");
    const [aiInstructions, setAiInstructions] = useState("");
    const [allowedStars, setAllowedStars] = useState<number[]>([1, 2, 3, 4, 5]);
    const [templates, setTemplates] = useState<Record<string, string>>(DEFAULT_TEMPLATES);
    const [settingsSaving, setSettingsSaving] = useState(false);
    const [runningNow, setRunningNow] = useState(false);
    const [runResult, setRunResult] = useState<string | null>(null);

    const fetchStatus = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/google/status");
            const data = await res.json();
            setStatus(data);
            if (data.connected) {
                const locRes = await fetch("/api/google/locations");
                const locData = await locRes.json();
                if (!locRes.ok) throw new Error(locData.error || "Failed to load locations");
                setLocations(locData);
                if (locData.length === 1) selectLocation(locData[0]);
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStatus();
        const params = new URLSearchParams(window.location.search);
        if (params.get("google_error")) {
            setError(`Google connection failed: ${params.get("google_error")}`);
            window.history.replaceState({}, "", window.location.pathname);
        } else if (params.get("google_connected")) {
            window.history.replaceState({}, "", window.location.pathname);
        }
    }, [fetchStatus]);

    async function selectLocation(loc: GbpLocation) {
        setSelectedLocation(loc);
        setShowSettings(false);
        setSettingsEnabled(loc.autoReply?.enabled || false);
        setSettingsMode(loc.autoReply?.mode || "template");
        setAiInstructions(loc.autoReply?.ai_instructions || "");
        setAllowedStars(loc.autoReply?.allowed_stars?.length ? loc.autoReply.allowed_stars : [1, 2, 3, 4, 5]);
        setTemplates(
            loc.autoReply?.templates && Object.keys(loc.autoReply.templates).length > 0
                ? { ...DEFAULT_TEMPLATES, ...loc.autoReply.templates }
                : DEFAULT_TEMPLATES
        );
        setReviews([]);
        setReviewsLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/google/reviews?location=${encodeURIComponent(loc.name)}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to load reviews");
            setReviews(data.reviews || []);
            setReviewMeta({ averageRating: data.averageRating, totalReviewCount: data.totalReviewCount });
        } catch (err: any) {
            setError(err.message);
        } finally {
            setReviewsLoading(false);
        }
    }

    async function handleDisconnect() {
        if (!confirm("Disconnect the Google account? Auto-reply will stop working.")) return;
        await fetch("/api/google/status", { method: "DELETE" });
        setStatus((s) => (s ? { ...s, connected: false, email: null } : s));
        setLocations([]);
        setSelectedLocation(null);
        setReviews([]);
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
        if (!selectedLocation) return;
        setGenerating(true);
        try {
            const res = await fetch("/api/google/generate-reply", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    reviewerName: review.reviewer?.displayName || "",
                    starRating: STAR_VALUE[review.starRating] || 0,
                    comment: review.comment,
                    businessName: selectedLocation.title,
                    instructions: selectedLocation.autoReply?.ai_instructions || aiInstructions,
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
        if (!selectedLocation) return;
        setSettingsSaving(true);
        try {
            const res = await fetch("/api/google/auto-reply", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    location_name: selectedLocation.name,
                    location_title: selectedLocation.title,
                    enabled: settingsEnabled,
                    templates,
                    mode: settingsMode,
                    ai_instructions: aiInstructions,
                    allowed_stars: allowedStars,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to save settings");
            setLocations((prev) =>
                prev.map((l) =>
                    l.name === selectedLocation.name
                        ? {
                              ...l,
                              autoReply: {
                                  location_name: l.name,
                                  location_title: l.title,
                                  enabled: settingsEnabled,
                                  templates,
                                  mode: settingsMode,
                                  ai_instructions: aiInstructions,
                                  allowed_stars: allowedStars,
                              },
                          }
                        : l
                )
            );
            setShowSettings(false);
        } catch (err: any) {
            alert(`Error: ${err.message}`);
        } finally {
            setSettingsSaving(false);
        }
    }

    async function handleRunNow() {
        setRunningNow(true);
        setRunResult(null);
        try {
            const res = await fetch("/api/google/auto-reply", { method: "PUT" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Auto-reply run failed");
            const total = (data.results || []).reduce((sum: number, r: any) => sum + r.replied, 0);
            const errors = (data.results || []).flatMap((r: any) => r.errors);
            setRunResult(
                `Replied to ${total} review(s).${errors.length ? ` Errors: ${errors.join("; ")}` : ""}`
            );
            if (selectedLocation && total > 0) selectLocation(selectedLocation);
        } catch (err: any) {
            setRunResult(`Error: ${err.message}`);
        } finally {
            setRunningNow(false);
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

    // Not configured: env vars missing
    if (status && !status.configured) {
        return (
            <div className="rounded-[2rem] border border-amber-200 bg-amber-50 p-8 text-amber-800">
                <h3 className="text-lg font-bold">Google API not configured</h3>
                <p className="mt-2 text-sm">
                    Set <code className="font-bold">GOOGLE_CLIENT_ID</code> and{" "}
                    <code className="font-bold">GOOGLE_CLIENT_SECRET</code> environment variables in Vercel, then
                    redeploy.
                </p>
            </div>
        );
    }

    // Not connected: show connect button
    if (status && !status.connected) {
        return (
            <div className="rounded-[2.5rem] border-2 border-dashed border-slate-200 bg-white py-24 text-center">
                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-slate-50">
                    <svg className="h-10 w-10" viewBox="0 0 24 24">
                        <path
                            fill="#4285F4"
                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                            fill="#34A853"
                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                            fill="#FBBC05"
                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        />
                        <path
                            fill="#EA4335"
                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        />
                    </svg>
                </div>
                <h3 className="text-xl font-bold text-slate-900">Connect Google Business Profile</h3>
                <p className="mx-auto mt-2 max-w-[340px] text-slate-500">
                    Connect the Google account that manages your Business Profiles to fetch reviews and enable
                    auto-reply.
                </p>
                {error && <p className="mx-auto mt-4 max-w-md text-sm font-semibold text-red-500">{error}</p>}
                <a
                    href="/api/google/auth"
                    className="mt-10 inline-block rounded-2xl bg-slate-900 px-8 py-4 text-sm font-bold text-white transition-all hover:bg-slate-800 shadow-lg active:scale-95"
                >
                    Connect Google Account
                </a>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Connection bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-5">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50">
                        <svg className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <div>
                        <p className="text-sm font-bold text-slate-900">Google connected</p>
                        <p className="text-xs text-slate-400">{status?.email || "Business Profile account"}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleRunNow}
                        disabled={runningNow}
                        className="rounded-xl bg-[#EE314F] px-4 py-2.5 text-sm font-bold text-white transition-all hover:bg-[#d42a45] disabled:opacity-50"
                    >
                        {runningNow ? "Running..." : "Run Auto-Reply Now"}
                    </button>
                    <button
                        onClick={handleDisconnect}
                        className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-500 transition-all hover:bg-slate-50"
                    >
                        Disconnect
                    </button>
                </div>
            </div>

            {runResult && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 text-sm font-semibold text-slate-600">
                    {runResult}
                </div>
            )}

            {error && (
                <div className="rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm font-semibold text-red-600">
                    {error}
                </div>
            )}

            {/* Location picker */}
            {locations.length > 0 && (
                <div className="flex flex-wrap gap-3">
                    {locations.map((loc) => (
                        <button
                            key={loc.name}
                            onClick={() => selectLocation(loc)}
                            className={`rounded-2xl border px-5 py-3 text-left transition-all ${
                                selectedLocation?.name === loc.name
                                    ? "border-[#EE314F] bg-[#EE314F]/5 shadow-sm"
                                    : "border-slate-200 bg-white hover:border-slate-300"
                            }`}
                        >
                            <span className="flex items-center gap-2">
                                <span className="text-sm font-bold text-slate-900">{loc.title}</span>
                                {loc.autoReply?.enabled && (
                                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-green-600">
                                        Auto
                                    </span>
                                )}
                            </span>
                            {loc.address && <span className="mt-0.5 block text-xs text-slate-400">{loc.address}</span>}
                        </button>
                    ))}
                </div>
            )}

            {selectedLocation && (
                <>
                    {/* Location header + auto-reply settings toggle */}
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <h3 className="text-2xl font-bold text-slate-900">{selectedLocation.title}</h3>
                            <p className="mt-0.5 text-sm text-slate-500">
                                {reviewMeta.totalReviewCount ?? reviews.length} reviews
                                {reviewMeta.averageRating ? ` · ${reviewMeta.averageRating.toFixed(1)} average` : ""}
                            </p>
                        </div>
                        <button
                            onClick={() => setShowSettings(!showSettings)}
                            className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition-all ${
                                showSettings
                                    ? "bg-slate-100 text-slate-600"
                                    : "bg-slate-900 text-white hover:bg-slate-800"
                            }`}
                        >
                            {showSettings ? "Close Settings" : "Auto-Reply Settings"}
                        </button>
                    </div>

                    {/* Auto-reply settings */}
                    {showSettings && (
                        <div className="rounded-[2rem] border border-slate-200 bg-white p-8 relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-2 h-full bg-[#EE314F]" />
                            <div className="mb-6 flex items-center justify-between">
                                <div>
                                    <h4 className="text-lg font-bold text-slate-900">Auto-Reply Settings</h4>
                                    <p className="mt-1 text-sm text-slate-500">
                                        Choose how replies are written for this location.
                                    </p>
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

                            {/* Reply mode selector */}
                            <div className="mb-6 grid gap-3 sm:grid-cols-2">
                                <button
                                    type="button"
                                    onClick={() => setSettingsMode("ai")}
                                    className={`rounded-2xl border-2 p-4 text-left transition-all ${settingsMode === "ai"
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
                                    className={`rounded-2xl border-2 p-4 text-left transition-all ${settingsMode === "template"
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

                            {/* Star ratings auto-reply may respond to */}
                            <div className="mb-6">
                                <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                                    Reply to these ratings
                                </label>
                                <p className="mb-2 text-xs text-slate-400">
                                    Auto-reply only responds to the selected star ratings — deselect low ratings if you
                                    prefer to answer those personally.
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
                                                className={`flex items-center gap-1.5 rounded-xl border-2 px-4 py-2 text-sm font-bold transition-all ${active
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
                                        Describe the business, services, tone, and anything the AI should know or mention
                                        (e.g. "Mobile tyre fitting company in Bolton. Friendly but professional tone. For
                                        complaints, ask them to call 01204 XXXXXX. Mention we operate 24/7.")
                                    </p>
                                    <textarea
                                        value={aiInstructions}
                                        onChange={(e) => setAiInstructions(e.target.value)}
                                        rows={6}
                                        placeholder="Tell the AI about this business and what kind of replies you want..."
                                        className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-900 transition-all focus:border-[#EE314F] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#EE314F]/5"
                                    />
                                    <p className="mt-2 text-xs text-slate-400">
                                        Templates below are kept as a fallback if AI generation ever fails.
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

                            <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-5">
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

                    {/* Reviews list */}
                    {reviewsLoading ? (
                        <div className="flex items-center justify-center py-16 text-slate-400">
                            <svg className="h-6 w-6 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                            </svg>
                        </div>
                    ) : reviews.length === 0 ? (
                        <div className="rounded-3xl border border-slate-200 bg-white py-16 text-center text-slate-400">
                            No reviews found for this location.
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {reviews.map((review) => (
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

                                            {/* Existing reply */}
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
                </>
            )}
        </div>
    );
}
