import React, { useState, useEffect } from "react";

interface ReviewLink {
    id: string;
    slug: string;
    businessName: string;
    gmbReviewLink: string;
    logoUrl?: string;
    backgroundImageUrl?: string;
    createdAt: string;
}

export default function Dashboard() {
    const [links, setLinks] = useState<ReviewLink[]>([]);
    const [businessName, setBusinessName] = useState("");
    const [gmbReviewLink, setGmbReviewLink] = useState("");
    const [logoUrl, setLogoUrl] = useState("");
    const [backgroundImageUrl, setBackgroundImageUrl] = useState("");
    const [loading, setLoading] = useState(false);
    const [copySuccess, setCopySuccess] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [baseUrl, setBaseUrl] = useState("");

    useEffect(() => {
        setBaseUrl(window.location.origin);
        fetchLinks();
    }, []);

    async function fetchLinks() {
        const res = await fetch("/api/links");
        const data = await res.json();
        setLinks(data);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);

        try {
            const url = editingId ? `/api/links?id=${editingId}` : "/api/links";
            const method = editingId ? "PATCH" : "POST";

            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    businessName,
                    gmbReviewLink,
                    logoUrl,
                    backgroundImageUrl,
                }),
            });

            if (res.ok) {
                setBusinessName("");
                setGmbReviewLink("");
                setLogoUrl("");
                setBackgroundImageUrl("");
                setShowForm(false);
                setEditingId(null);
                fetchLinks();
            } else {
                const data = await res.json();
                alert(`Error: ${data.error || 'Failed to save link'}`);
            }
        } catch (error) {
            console.error(`Failed to ${editingId ? 'update' : 'create'} link:`, error);
        } finally {
            setLoading(false);
        }
    }

    function handleEdit(link: ReviewLink) {
        setBusinessName(link.businessName);
        setGmbReviewLink(link.gmbReviewLink);
        setLogoUrl(link.logoUrl || "");
        setBackgroundImageUrl(link.backgroundImageUrl || "");
        setEditingId(link.id);
        setShowForm(true);
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    async function handleDelete(id: string) {
        if (!confirm("Are you sure you want to delete this review link?")) return;

        try {
            const res = await fetch(`/api/links?id=${id}`, { method: "DELETE" });
            if (res.ok) {
                await fetchLinks();
            } else {
                const data = await res.json();
                alert(`Error: ${data.error || 'Failed to delete link'}`);
            }
        } catch (error) {
            console.error("Delete error:", error);
            alert("An unexpected error occurred while deleting.");
        }
    }

    function copyToClipboard(slug: string) {
        const url = `${baseUrl}/review/${slug}`;
        navigator.clipboard.writeText(url);
        setCopySuccess(slug);
        setTimeout(() => setCopySuccess(null), 2000);
    }

    return (
        <div className="min-h-screen bg-[#F8FAFC] font-sans selection:bg-[#EE314F]/10 selection:text-[#EE314F]">
            {/* Premium Header */}
            <header className="sticky top-0 z-50 glass border-b border-slate-200/60 transition-all">
                <div className="mx-auto max-w-6xl px-6 py-4 sm:px-8">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EE314F] text-white shadow-lg shadow-[#EE314F]/20">
                                <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                                </svg>
                            </div>
                            <div>
                                <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                                    Review Manager
                                </h1>
                                <p className="hidden text-xs font-medium text-slate-400 sm:block uppercase tracking-wider">
                                    Webspires Systems
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => {
                                if (showForm) {
                                    setEditingId(null);
                                    setBusinessName("");
                                    setGmbReviewLink("");
                                    setLogoUrl("");
                                    setBackgroundImageUrl("");
                                }
                                setShowForm(!showForm);
                            }}
                            className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition-all shadow-sm ${showForm
                                ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                : "bg-slate-900 text-white hover:bg-slate-800 hover:shadow-md active:scale-[0.98]"
                                }`}
                        >
                            {showForm ? "Cancel" : "Create New Link"}
                        </button>
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-6xl px-6 py-12 sm:px-8">
                {/* Animated Form */}
                {showForm && (
                    <div className="mb-12 animate-slide-up">
                        <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.06)] overflow-hidden relative">
                            <div className="absolute top-0 left-0 w-2 h-full bg-[#EE314F]" />
                            <form onSubmit={handleSubmit} className="space-y-8">
                                <div className="grid gap-8 sm:grid-cols-2">
                                    <div className="space-y-6">
                                        <div>
                                            <label className="mb-2 block text-sm font-semibold text-slate-700">
                                                Business Name
                                            </label>
                                            <input
                                                type="text"
                                                value={businessName}
                                                onChange={(e) => setBusinessName(e.target.value)}
                                                placeholder="e.g. Acme Corporation"
                                                required
                                                className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3.5 text-slate-900 placeholder-slate-400 transition-all focus:border-[#EE314F] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#EE314F]/5"
                                            />
                                        </div>

                                        <div>
                                            <label className="mb-2 block text-sm font-semibold text-slate-700">
                                                Google Review URL
                                            </label>
                                            <input
                                                type="url"
                                                value={gmbReviewLink}
                                                onChange={(e) => setGmbReviewLink(e.target.value)}
                                                placeholder="https://search.google.com/local/writereview?placeid=..."
                                                required
                                                className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3.5 text-slate-900 placeholder-slate-400 transition-all focus:border-[#EE314F] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#EE314F]/5"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-6">
                                        <div>
                                            <label className="mb-2 block text-sm font-semibold text-slate-700">
                                                Logo URL <span className="text-slate-300">(optional)</span>
                                            </label>
                                            <input
                                                type="url"
                                                value={logoUrl}
                                                onChange={(e) => setLogoUrl(e.target.value)}
                                                placeholder="https://..."
                                                className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3.5 text-slate-900 placeholder-slate-400 transition-all focus:border-[#EE314F] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#EE314F]/5"
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-2 block text-sm font-semibold text-slate-700">
                                                Background Image URL <span className="text-slate-300">(optional)</span>
                                            </label>
                                            <input
                                                type="url"
                                                value={backgroundImageUrl}
                                                onChange={(e) => setBackgroundImageUrl(e.target.value)}
                                                placeholder="https://..."
                                                className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3.5 text-slate-900 placeholder-slate-400 transition-all focus:border-[#EE314F] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#EE314F]/5"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center justify-end gap-4 pt-4 border-t border-slate-100">
                                    <button
                                        type="button"
                                        onClick={() => setShowForm(false)}
                                        className="rounded-xl px-6 py-3 text-sm font-semibold text-slate-500 transition-colors hover:bg-slate-100"
                                    >
                                        Discard
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="relative rounded-xl bg-[#EE314F] px-8 py-3 text-sm font-bold text-white transition-all hover:bg-[#d42a45] hover:shadow-lg hover:shadow-[#EE314F]/20 active:scale-95 disabled:opacity-50 overflow-hidden"
                                    >
                                        {loading ? (editingId ? "Updating..." : "Creating...") : (editingId ? "Update Link" : "Generate Review Page")}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Dash Summary */}
                <div className="mb-8 flex items-end justify-between">
                    <div>
                        <h2 className="text-3xl font-bold text-slate-900">Active Pages</h2>
                        <p className="mt-1 text-slate-500">Manage your generated review pages</p>
                    </div>
                    <div className="rounded-xl bg-white border border-slate-200 px-4 py-2 shadow-sm">
                        <span className="text-sm font-bold text-slate-900">{links.length}</span>
                        <span className="ml-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Total</span>
                    </div>
                </div>

                {/* Empty State */}
                {links.length === 0 ? (
                    <div className="rounded-[2.5rem] border-2 border-dashed border-slate-200 bg-white py-24 text-center animate-fade-in transition-standard hover:border-slate-300">
                        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-slate-50 text-slate-300">
                            <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                            </svg>
                        </div>
                        <h3 className="text-xl font-bold text-slate-900">No review pages yet</h3>
                        <p className="mx-auto mt-2 max-w-[280px] text-slate-500">
                            Create your first professional review page to start gathering feedback.
                        </p>
                        <button
                            onClick={() => setShowForm(true)}
                            className="mt-10 rounded-2xl bg-[#EE314F] px-8 py-4 text-sm font-bold text-white transition-all hover:bg-[#d42a45] shadow-lg shadow-[#EE314F]/20 active:scale-95"
                        >
                            Create Your First Link
                        </button>
                    </div>
                ) : (
                    /* Premium List Grid */
                    <div className="grid gap-4 sm:grid-cols-1">
                        {links.map((link) => (
                            <div
                                key={link.id}
                                className="group relative rounded-3xl border border-slate-200 bg-white p-5 transition-all hover:border-[#EE314F]/30 hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.08)] active:scale-[0.995]"
                            >
                                <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                                    {/* Business Branding */}
                                    <div className="flex items-center gap-5 flex-1">
                                        {link.logoUrl ? (
                                            <div className="relative">
                                                <div className="absolute -inset-1 rounded-2xl bg-gradient-to-tr from-[#EE314F]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                                <img
                                                    src={link.logoUrl}
                                                    alt={link.businessName}
                                                    className="relative h-16 w-16 rounded-2xl object-cover ring-1 ring-slate-100"
                                                />
                                            </div>
                                        ) : (
                                            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-50 text-slate-200 group-hover:text-[#EE314F]/30 transition-colors">
                                                <svg className="h-8 w-8" fill="currentColor" viewBox="0 0 24 24">
                                                    <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                                                </svg>
                                            </div>
                                        )}
                                        <div className="min-w-0">
                                            <h3 className="font-bold text-slate-900 truncate group-hover:text-[#EE314F] transition-colors">
                                                {link.businessName}
                                            </h3>
                                            <div className="mt-1.5 flex flex-wrap items-center gap-3">
                                                <code className="rounded-lg bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-500 border border-slate-100">
                                                    {link.slug}
                                                </code>
                                                <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest hidden sm:block">
                                                    Created {new Date(link.createdAt).toLocaleDateString()}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Dynamic Action Toolbar */}
                                    <div className="flex items-center gap-2 border-t border-slate-50 pt-4 sm:border-0 sm:pt-0">
                                        <button
                                            onClick={() => copyToClipboard(link.slug)}
                                            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${copySuccess === link.slug
                                                ? "bg-green-50 text-green-600 border border-green-100"
                                                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:border-slate-300"
                                                }`}
                                        >
                                            {copySuccess === link.slug ? (
                                                <>
                                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                    </svg>
                                                    <span>Copied</span>
                                                </>
                                            ) : (
                                                <>
                                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                    </svg>
                                                    <span>Copy Link</span>
                                                </>
                                            )}
                                        </button>

                                        <button
                                            onClick={() => handleEdit(link)}
                                            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition-all hover:bg-slate-50 hover:text-slate-900"
                                        >
                                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                            </svg>
                                        </button>

                                        <a
                                            href={`/review/${link.slug}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition-all hover:bg-slate-50 hover:text-slate-900"
                                        >
                                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                            </svg>
                                        </a>

                                        <button
                                            onClick={() => handleDelete(link.id)}
                                            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-100 text-slate-300 transition-all hover:bg-red-50 hover:text-red-500 hover:border-red-100"
                                        >
                                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>

            {/* Subtle Footer */}
            <footer className="mx-auto max-w-6xl px-8 py-12 border-t border-slate-100">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                    <p className="text-xs font-bold text-slate-300 uppercase tracking-[0.2em]">
                        © 2026 Webspires · Review Management Pro
                    </p>
                    <div className="flex items-center gap-6">
                        <a href="#" className="text-xs font-bold text-slate-400 hover:text-[#EE314F] transition-colors uppercase tracking-widest">Docs</a>
                        <a href="#" className="text-xs font-bold text-slate-400 hover:text-[#EE314F] transition-colors uppercase tracking-widest">Support</a>
                    </div>
                </div>
            </footer>
        </div>
    );
}
