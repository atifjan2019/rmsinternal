import React, { useState, useEffect, useRef, useCallback } from "react";

interface Notification {
    id: string;
    type: string;
    title: string;
    body: string;
    location_name: string;
    location_title: string;
    star_rating: number;
    reviewer: string;
    read: number;
    created_at: string;
}

function timeAgo(iso: string): string {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
}

export default function NotificationsBell() {
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState<Notification[]>([]);
    const [unread, setUnread] = useState(0);
    const wrapRef = useRef<HTMLDivElement>(null);

    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/notifications");
            if (!res.ok) return;
            const data = await res.json();
            setItems(data.notifications || []);
            setUnread(data.unread || 0);
        } catch {
            /* transient network errors are fine */
        }
    }, []);

    useEffect(() => {
        load();
        const timer = setInterval(load, 60_000);
        const onClickAway = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", onClickAway);
        return () => {
            clearInterval(timer);
            document.removeEventListener("mousedown", onClickAway);
        };
    }, [load]);

    async function toggle() {
        const opening = !open;
        setOpen(opening);
        if (opening && unread > 0) {
            setUnread(0);
            setItems((prev) => prev.map((n) => ({ ...n, read: 1 })));
            await fetch("/api/notifications", { method: "PATCH" }).catch(() => {});
        }
    }

    return (
        <div ref={wrapRef} className="relative">
            <button
                onClick={toggle}
                aria-label="Notifications"
                className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-all hover:bg-slate-50 hover:text-slate-900"
            >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {unread > 0 && (
                    <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#EE314F] px-1 text-[11px] font-bold text-white shadow">
                        {unread > 9 ? "9+" : unread}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute right-0 top-12 z-50 w-96 max-w-[90vw] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_20px_50px_-15px_rgba(0,0,0,0.15)]">
                    <div className="border-b border-slate-100 px-5 py-3.5">
                        <p className="text-sm font-bold text-slate-900">Notifications</p>
                    </div>
                    <div className="max-h-[420px] overflow-y-auto">
                        {items.length === 0 ? (
                            <p className="px-5 py-10 text-center text-sm text-slate-400">No notifications yet.</p>
                        ) : (
                            items.map((n) => {
                                const locId = (n.location_name || "").split("/").pop();
                                return (
                                    <a
                                        key={n.id}
                                        href={locId ? `/business/${locId}` : "#"}
                                        className={`block border-b border-slate-50 px-5 py-4 transition-colors hover:bg-slate-50 ${
                                            !n.read ? "bg-[#EE314F]/[0.03]" : ""
                                        }`}
                                    >
                                        <span className="flex items-start gap-3">
                                            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-base">
                                                ⭐
                                            </span>
                                            <span className="min-w-0">
                                                <span className="block text-sm font-bold text-slate-900">{n.title}</span>
                                                {n.body && (
                                                    <span className="mt-0.5 block truncate text-xs text-slate-500">{n.body}</span>
                                                )}
                                                <span className="mt-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                                                    {timeAgo(n.created_at)}
                                                </span>
                                            </span>
                                            {!n.read && <span className="ml-auto mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#EE314F]" />}
                                        </span>
                                    </a>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
