import React, { useEffect, useState } from "react";
import { Card, CardHeader, EmptyState, Notice, Spinner, btn } from "./ui";
import type { GbpLocation } from "./BusinessList";

interface PostSettings {
    location_name: string;
    enabled: boolean;
    auto_publish: boolean;
    last_generated_at: string | null;
}
interface QueuedPost {
    id: string;
    location_name: string;
    location_title: string;
    summary: string;
    image_url: string | null;
    status: string;
    created_at: string;
}

const locationId = (name: string) => name.split("/").pop() || "";

/** The Auto Posts page: every business's posting status, and everything waiting for approval. */
export default function PostsOverview() {
    const [locations, setLocations] = useState<GbpLocation[]>([]);
    const [settings, setSettings] = useState<PostSettings[]>([]);
    const [drafts, setDrafts] = useState<QueuedPost[]>([]);
    const [connected, setConnected] = useState(true);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            try {
                const [statusRes, postsRes] = await Promise.all([fetch("/api/google/status"), fetch("/api/posts")]);
                const status = await statusRes.json();
                setConnected(!!status.connected);
                const posts = await postsRes.json();
                if (!postsRes.ok) throw new Error(posts.error || "Failed to load posts");
                setSettings(posts.settings || []);
                setDrafts((posts.queue || []).filter((p: QueuedPost) => p.status === "draft"));
                if (status.connected) {
                    const [locRes, allowedRes] = await Promise.all([fetch("/api/google/locations"), fetch("/api/google/allowed")]);
                    const locData = await locRes.json();
                    const allowed = (await allowedRes.json().catch(() => ({})))?.allowed;
                    const all: GbpLocation[] = locData.locations || [];
                    setLocations(Array.isArray(allowed) ? all.filter((l) => allowed.includes(l.name)) : all);
                }
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    if (loading) return <Spinner />;

    return (
        <div className="space-y-6">
            {error && <Notice tone="bad" onClose={() => setError(null)}>{error}</Notice>}
            {!connected && (
                <EmptyState title="Google is not connected" text="Posts go to your Google Business Profile, so connect Google first." action={<a href="/reviews" className={btn.dark}>Go to Google Reviews</a>} />
            )}

            {drafts.length > 0 && (
                <Card>
                    <CardHeader title={`Waiting for approval (${drafts.length})`} description="Written by the AI. Open one to check the text and picture, then publish." />
                    <ul className="divide-y divide-slate-100">
                        {drafts.map((p) => (
                            <li key={p.id}>
                                <a href={`/business/${locationId(p.location_name)}/posts#post-${p.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50">
                                    {p.image_url ? (
                                        <img src={p.image_url} alt="" className="h-14 w-20 shrink-0 rounded-md object-cover" />
                                    ) : (
                                        <span className="flex h-14 w-20 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[10px] text-slate-400">No picture</span>
                                    )}
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-sm font-semibold text-slate-900">{p.location_title}</span>
                                        <span className="line-clamp-2 text-sm text-slate-600">{p.summary}</span>
                                        <span className="mt-0.5 block text-xs text-slate-400">Written {new Date(p.created_at).toLocaleString()}</span>
                                    </span>
                                    <span className={btn.small}>Review</span>
                                </a>
                            </li>
                        ))}
                    </ul>
                </Card>
            )}

            {connected && (
                <Card>
                    <CardHeader title="Businesses" description="Open one to set up its posts, write one now, or manage its pictures." />
                    {locations.length === 0 ? (
                        <p className="px-5 py-8 text-center text-sm text-slate-500">
                            No businesses selected. <a href="/reviews/select" className="font-semibold underline">Choose which to show.</a>
                        </p>
                    ) : (
                        <ul className="divide-y divide-slate-100">
                            {locations.map((loc) => {
                                const s = settings.find((x) => x.location_name === loc.name);
                                const pending = drafts.filter((d) => d.location_name === loc.name).length;
                                return (
                                    <li key={loc.name}>
                                        <a href={`/business/${locationId(loc.name)}/posts`} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50">
                                            <span className="min-w-0">
                                                <span className="block truncate text-sm font-semibold text-slate-900">{loc.title}</span>
                                                <span className="block text-xs text-slate-500">
                                                    {s?.last_generated_at ? `Last post ${new Date(s.last_generated_at).toLocaleDateString()}` : "No posts yet"}
                                                    {pending ? ` · ${pending} waiting for approval` : ""}
                                                </span>
                                            </span>
                                            <span className="flex shrink-0 items-center gap-3">
                                                {s?.enabled ? (
                                                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${s.auto_publish ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                                                        {s.auto_publish ? "Publishes automatically" : "Needs approval"}
                                                    </span>
                                                ) : (
                                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">Not set up</span>
                                                )}
                                                <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                                            </span>
                                        </a>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </Card>
            )}
        </div>
    );
}
