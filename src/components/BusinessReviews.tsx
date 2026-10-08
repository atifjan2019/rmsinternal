import React, { useState, useEffect, useCallback } from "react";
import { Card, Notice, Spinner, Stars, btn, input } from "./ui";
import BusinessHeader from "./BusinessHeader";
import { useBusiness } from "./useBusiness";
import type { GbpLocation } from "./BusinessList";

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
const PER_PAGE = 10;

/** A business's reviews: the ones waiting for a reply first, then the answered ones. */
export default function BusinessReviews({ locationId, initialView }: { locationId: string; initialView: "new" | "replied" }) {
    const { status, location, loading, error: loadError } = useBusiness(locationId);
    const [reviews, setReviews] = useState<GbpReview[]>([]);
    const [meta, setMeta] = useState<{ averageRating?: number; totalReviewCount?: number }>({});
    const [reviewsLoading, setReviewsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [view, setView] = useState<"new" | "replied">(initialView);
    const [page, setPage] = useState(1);
    const [nextPageToken, setNextPageToken] = useState<string | undefined>();
    const [loadingMore, setLoadingMore] = useState(false);

    const [replyingTo, setReplyingTo] = useState<string | null>(null);
    const [replyText, setReplyText] = useState("");
    const [replySaving, setReplySaving] = useState(false);
    const [generating, setGenerating] = useState(false);

    const loadReviews = useCallback(async (loc: GbpLocation) => {
        setReviewsLoading(true);
        try {
            const res = await fetch(`/api/google/reviews?location=${encodeURIComponent(loc.name)}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to load reviews");
            setReviews(data.reviews || []);
            setNextPageToken(data.nextPageToken);
            setMeta({ averageRating: data.averageRating, totalReviewCount: data.totalReviewCount });
        } catch (err: any) {
            setError(err.message);
        } finally {
            setReviewsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (location) loadReviews(location);
    }, [location, loadReviews]);

    // The view is part of the address, so it survives a refresh and the Back button.
    function switchView(next: "new" | "replied") {
        setView(next);
        setPage(1);
        const url = new URL(window.location.href);
        if (next === "replied") url.searchParams.set("view", "replied");
        else url.searchParams.delete("view");
        window.history.replaceState({}, "", url);
    }

    async function loadMore() {
        if (!location || !nextPageToken) return;
        setLoadingMore(true);
        try {
            const res = await fetch(`/api/google/reviews?location=${encodeURIComponent(location.name)}&pageToken=${encodeURIComponent(nextPageToken)}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to load more reviews");
            setReviews((prev) => [...prev, ...(data.reviews || [])]);
            setNextPageToken(data.nextPageToken);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoadingMore(false);
        }
    }

    async function postReply(reviewName: string) {
        if (!replyText.trim()) return;
        setReplySaving(true);
        setError(null);
        try {
            const res = await fetch("/api/google/reviews", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reviewName, comment: replyText }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to post the reply");
            setReviews((prev) =>
                prev.map((r) => (r.name === reviewName ? { ...r, reviewReply: { comment: replyText.trim(), updateTime: new Date().toISOString() } } : r))
            );
            setReplyingTo(null);
            setReplyText("");
        } catch (err: any) {
            setError(err.message);
        } finally {
            setReplySaving(false);
        }
    }

    async function generate(review: GbpReview) {
        if (!location) return;
        setGenerating(true);
        setError(null);
        try {
            const res = await fetch("/api/google/generate-reply", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    reviewerName: review.reviewer?.displayName || "",
                    starRating: STAR_VALUE[review.starRating] || 0,
                    comment: review.comment,
                    businessName: location.title,
                    instructions: location.autoReply?.ai_instructions || "",
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to write a reply");
            setReplyText(data.reply);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setGenerating(false);
        }
    }

    if (loading) return <Spinner />;
    if (!location) {
        return (
            <Notice tone="bad">
                {loadError || "Business not found."} <a href="/reviews" className="font-bold underline">Back to Google Reviews</a>
            </Notice>
        );
    }

    const newReviews = reviews.filter((r) => !r.reviewReply);
    const replied = reviews.filter((r) => !!r.reviewReply);
    const list = view === "new" ? newReviews : replied;
    const totalPages = Math.max(1, Math.ceil(list.length / PER_PAGE));
    const currentPage = Math.min(page, totalPages);
    const paged = list.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);
    const summary = `${meta.totalReviewCount ?? reviews.length} reviews${meta.averageRating ? `, ${meta.averageRating.toFixed(1)} average` : ""}`;

    return (
        <div className="space-y-6">
            <BusinessHeader location={location} locationId={locationId} current="reviews" meta={summary} />
            {error && <Notice tone="bad" onClose={() => setError(null)}>{error}</Notice>}

            {reviewsLoading ? (
                <Spinner label="Loading reviews" />
            ) : reviews.length === 0 ? (
                <Card className="px-6 py-14 text-center text-sm text-slate-500">No reviews found for this business.</Card>
            ) : (
                <>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1" role="tablist" aria-label="Reviews">
                            {(["new", "replied"] as const).map((v) => (
                                <button
                                    key={v}
                                    type="button"
                                    role="tab"
                                    aria-selected={view === v}
                                    onClick={() => switchView(v)}
                                    className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold ${view === v ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"}`}
                                >
                                    {v === "new" ? "Needs a reply" : "Replied"}
                                    <span className={`rounded-full px-2 py-0.5 text-xs ${view === v ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}>
                                        {v === "new" ? newReviews.length : replied.length}
                                    </span>
                                </button>
                            ))}
                        </div>
                        {location.autoReply?.enabled ? (
                            <span className="text-xs font-semibold text-emerald-700">Auto-reply is on for this business</span>
                        ) : (
                            <a href={`/business/${locationId}/auto-reply`} className="text-xs font-semibold text-slate-600 underline underline-offset-2 hover:text-slate-900">
                                Auto-reply is off. Set it up
                            </a>
                        )}
                    </div>

                    {list.length === 0 ? (
                        <Card className="px-6 py-14 text-center text-sm text-slate-500">
                            {view === "new" ? "All caught up: every review has a reply." : "No replied reviews yet."}
                        </Card>
                    ) : (
                        <div className="space-y-3">
                            {paged.map((review) => {
                                const stars = STAR_VALUE[review.starRating] || 0;
                                const name = review.reviewer?.displayName || "Anonymous";
                                const open = replyingTo === review.name;
                                return (
                                    <Card key={review.name} className="p-5">
                                        <div className="flex items-start gap-4">
                                            {review.reviewer?.profilePhotoUrl ? (
                                                <img src={review.reviewer.profilePhotoUrl} alt="" className="h-10 w-10 rounded-full object-cover" referrerPolicy="no-referrer" />
                                            ) : (
                                                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-500">{name.charAt(0)}</span>
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                                    <span className="text-sm font-bold text-slate-900">{name}</span>
                                                    <Stars rating={stars} />
                                                    <span className="text-xs text-slate-500">{new Date(review.createTime).toLocaleDateString()}</span>
                                                </div>
                                                {review.comment && <p className="mt-2 text-sm leading-relaxed text-slate-700">{review.comment}</p>}

                                                {!open && review.reviewReply && (
                                                    <div className="mt-4 rounded-lg bg-slate-50 p-4">
                                                        <div className="flex items-center justify-between">
                                                            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Your reply</p>
                                                            <button type="button" className="text-xs font-semibold text-primary hover:underline" onClick={() => { setReplyingTo(review.name); setReplyText(review.reviewReply!.comment); }}>
                                                                Edit reply
                                                            </button>
                                                        </div>
                                                        <p className="mt-1.5 text-sm text-slate-700">{review.reviewReply.comment}</p>
                                                    </div>
                                                )}
                                                {open && (
                                                    <div className="mt-4 space-y-3">
                                                        <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={3} autoFocus placeholder="Write your reply" className={input} aria-label="Your reply" />
                                                        <div className="flex flex-wrap gap-2">
                                                            <button type="button" onClick={() => postReply(review.name)} disabled={replySaving || !replyText.trim()} className={btn.dark}>
                                                                {replySaving ? "Posting" : review.reviewReply ? "Update reply" : "Post reply"}
                                                            </button>
                                                            {status?.ai && (
                                                                <button type="button" onClick={() => generate(review)} disabled={generating} className={btn.secondary}>
                                                                    {generating ? "Writing" : "Write with AI"}
                                                                </button>
                                                            )}
                                                            <button type="button" className={btn.ghost} onClick={() => { setReplyingTo(null); setReplyText(""); }}>Cancel</button>
                                                        </div>
                                                    </div>
                                                )}
                                                {!open && !review.reviewReply && (
                                                    <button type="button" className={`${btn.small} mt-3`} onClick={() => { setReplyingTo(review.name); setReplyText(""); }}>
                                                        Reply
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </Card>
                                );
                            })}
                        </div>
                    )}

                    {(totalPages > 1 || nextPageToken) && (
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <button type="button" className={btn.small} onClick={() => setPage(currentPage - 1)} disabled={currentPage <= 1}>Previous</button>
                                <span className="text-sm text-slate-600">Page {currentPage} of {totalPages}</span>
                                <button type="button" className={btn.small} onClick={() => setPage(currentPage + 1)} disabled={currentPage >= totalPages}>Next</button>
                            </div>
                            {nextPageToken && (
                                <button type="button" className={btn.small} onClick={loadMore} disabled={loadingMore}>
                                    {loadingMore ? "Loading" : "Load older reviews from Google"}
                                </button>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
