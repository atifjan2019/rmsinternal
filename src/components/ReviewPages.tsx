import React, { useEffect, useState } from "react";
import { Card, ConfirmButton, EmptyState, Notice, Spinner, btn } from "./ui";

export interface ReviewLink {
    id: string;
    slug: string;
    businessName: string;
    gmbReviewLink: string;
    logoUrl?: string;
    backgroundImageUrl?: string;
    createdAt: string;
}

/** The list of review pages: each has its own link to send to customers. */
export default function ReviewPages() {
    const [links, setLinks] = useState<ReviewLink[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState<string | null>(null);
    const [origin, setOrigin] = useState("");

    async function load() {
        try {
            const res = await fetch("/api/links");
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to load review pages");
            setLinks(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        setOrigin(window.location.origin);
        load();
    }, []);

    async function copy(slug: string) {
        try {
            await navigator.clipboard.writeText(`${origin}/review/${slug}`);
            setCopied(slug);
            setTimeout(() => setCopied(null), 2000);
        } catch {
            setError("Could not copy. Select the address and copy it by hand.");
        }
    }

    async function remove(id: string) {
        const res = await fetch(`/api/links?id=${id}`, { method: "DELETE" });
        if (res.ok) setLinks((l) => l.filter((x) => x.id !== id));
        else setError((await res.json().catch(() => ({})))?.error || "Could not delete the page");
    }

    if (loading) return <Spinner />;

    return (
        <div className="space-y-6">
            {error && <Notice tone="bad" onClose={() => setError(null)}>{error}</Notice>}
            {links.length === 0 ? (
                <EmptyState
                    title="No review pages yet"
                    text="A review page sends happy customers to Google and collects private feedback from unhappy ones."
                    action={<a href="/review-pages/new" className={btn.primary}>Create a review page</a>}
                />
            ) : (
                <Card>
                    <ul className="divide-y divide-slate-100">
                        {links.map((link) => (
                            <li key={link.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                                <div className="flex min-w-0 flex-1 items-center gap-4">
                                    {link.logoUrl ? (
                                        <img src={link.logoUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover ring-1 ring-slate-200" />
                                    ) : (
                                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm font-bold text-slate-400">
                                            {link.businessName.charAt(0)}
                                        </span>
                                    )}
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold text-slate-900">{link.businessName}</p>
                                        <p className="truncate text-xs text-slate-500">
                                            {origin}/review/{link.slug} · created {new Date(link.createdAt).toLocaleDateString()}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <button type="button" onClick={() => copy(link.slug)} className={btn.small}>
                                        {copied === link.slug ? "Copied" : "Copy link"}
                                    </button>
                                    <a href={`/review/${link.slug}`} target="_blank" rel="noopener noreferrer" className={btn.small}>Open</a>
                                    <a href={`/review-pages/${link.id}`} className={btn.small}>Edit</a>
                                    <ConfirmButton className={`${btn.small} text-red-600`} confirmLabel="Delete" onConfirm={() => remove(link.id)}>
                                        Delete
                                    </ConfirmButton>
                                </div>
                            </li>
                        ))}
                    </ul>
                </Card>
            )}
        </div>
    );
}
