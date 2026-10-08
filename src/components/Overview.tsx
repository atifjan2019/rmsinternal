import React, { useEffect, useState } from "react";
import { Card, CardHeader, Notice, Spinner, btn } from "./ui";
import type { GbpLocation, GoogleStatus } from "./BusinessList";

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

/** The first screen: how things stand, and the shortest way to what needs doing. */
export default function Overview() {
    const [status, setStatus] = useState<GoogleStatus | null>(null);
    const [locations, setLocations] = useState<GbpLocation[]>([]);
    const [drafts, setDrafts] = useState<QueuedPost[]>([]);
    const [links, setLinks] = useState<number>(0);
    const [unread, setUnread] = useState<number>(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            try {
                const [statusRes, linksRes, notifRes, postsRes] = await Promise.all([
                    fetch("/api/google/status"),
                    fetch("/api/links"),
                    fetch("/api/notifications"),
                    fetch("/api/posts?status=draft"),
                ]);
                const statusData = await statusRes.json();
                setStatus(statusData);
                setLinks(((await linksRes.json().catch(() => [])) as unknown[]).length);
                setUnread((await notifRes.json().catch(() => ({})))?.unread || 0);
                setDrafts(((await postsRes.json().catch(() => ({})))?.queue || []) as QueuedPost[]);
                if (statusData.connected) {
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

    const autoOn = locations.filter((l) => l.autoReply?.enabled).length;

    return (
        <div className="space-y-6">
            {error && <Notice tone="bad">{error}</Notice>}

            {status && !status.connected && (
                <Notice tone="warn">
                    Google is not connected, so reviews and posts cannot be read or written.{" "}
                    <a href="/reviews" className="font-bold underline">Connect it on the Google Reviews page.</a>
                </Notice>
            )}
            {status?.connected && !status.ai && (
                <Notice tone="warn">
                    No AI API key is set, so replies and posts cannot be written.{" "}
                    <a href="/settings" className="font-bold underline">Add one in Settings.</a>
                </Notice>
            )}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Businesses" value={locations.length} href="/reviews" hint={status?.connected ? `${autoOn} with auto-reply on` : "Google not connected"} />
                <Stat label="Posts awaiting approval" value={drafts.length} href="/posts" hint={drafts.length ? "Check and publish" : "Nothing waiting"} />
                <Stat label="Review pages" value={links} href="/review-pages" hint="Links you send to customers" />
                <Stat label="Unread notifications" value={unread} hint="New reviews and replies" />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                    <CardHeader title="Your businesses" description="Open one to read and answer its reviews." actions={<a href="/reviews" className={btn.small}>All businesses</a>} />
                    {locations.length === 0 ? (
                        <p className="px-5 py-8 text-center text-sm text-slate-500">
                            {status?.connected ? "No businesses selected yet." : "Connect Google to see your businesses."}
                        </p>
                    ) : (
                        <ul className="divide-y divide-slate-100">
                            {locations.slice(0, 6).map((loc) => (
                                <li key={loc.name}>
                                    <a href={`/business/${locationId(loc.name)}`} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-slate-50">
                                        <span className="min-w-0">
                                            <span className="block truncate text-sm font-semibold text-slate-900">{loc.title}</span>
                                            <span className="block truncate text-xs text-slate-500">{loc.address || "No address"}</span>
                                        </span>
                                        <span className="flex shrink-0 items-center gap-2">
                                            {loc.autoReply?.enabled && (
                                                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">Auto-reply on</span>
                                            )}
                                            <Chevron />
                                        </span>
                                    </a>
                                </li>
                            ))}
                        </ul>
                    )}
                </Card>

                <Card>
                    <CardHeader title="Posts awaiting approval" description="Written by the AI, waiting for you to check." actions={<a href="/posts" className={btn.small}>All posts</a>} />
                    {drafts.length === 0 ? (
                        <p className="px-5 py-8 text-center text-sm text-slate-500">Nothing waiting for approval.</p>
                    ) : (
                        <ul className="divide-y divide-slate-100">
                            {drafts.slice(0, 5).map((p) => (
                                <li key={p.id}>
                                    <a href={`/business/${locationId(p.location_name)}/posts#post-${p.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50">
                                        {p.image_url ? (
                                            <img src={p.image_url} alt="" className="h-12 w-16 shrink-0 rounded-md object-cover" />
                                        ) : (
                                            <span className="h-12 w-16 shrink-0 rounded-md bg-slate-100" />
                                        )}
                                        <span className="min-w-0">
                                            <span className="block truncate text-sm font-semibold text-slate-900">{p.location_title}</span>
                                            <span className="line-clamp-1 text-xs text-slate-500">{p.summary}</span>
                                        </span>
                                        <Chevron />
                                    </a>
                                </li>
                            ))}
                        </ul>
                    )}
                </Card>
            </div>
        </div>
    );
}

function Stat({ label, value, hint, href }: { label: string; value: number; hint?: string; href?: string }) {
    const inner = (
        <>
            <p className="text-sm font-semibold text-slate-500">{label}</p>
            <p className="mt-1 text-3xl font-bold text-slate-900">{value}</p>
            {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
        </>
    );
    return href ? (
        <a href={href} className="rounded-xl border border-slate-200 bg-white px-5 py-4 transition-colors hover:border-slate-300 hover:bg-slate-50">
            {inner}
        </a>
    ) : (
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">{inner}</div>
    );
}

function Chevron() {
    return (
        <svg className="ml-auto h-4 w-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
    );
}
