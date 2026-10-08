import React, { useState, useEffect, useCallback } from "react";
import { Card, CardHeader, ConfirmButton, EmptyState, Notice, Spinner, btn, input } from "./ui";

export interface GoogleStatus {
    connected: boolean;
    email: string | null;
    configured: boolean;
    ai: boolean;
}

export interface AutoReplySettings {
    location_name: string;
    location_title: string;
    enabled: boolean;
    templates: Record<string, string>;
    mode: "template" | "ai";
    ai_instructions: string;
    allowed_stars: number[];
}

export interface GbpLocation {
    name: string;
    title: string;
    address?: string;
    autoReply: AutoReplySettings | null;
}

export function locationId(loc: { name: string }): string {
    return loc.name.split("/").pop() || "";
}

/** The Google Reviews page: the connection, and the businesses it covers. */
export default function BusinessList() {
    const [status, setStatus] = useState<GoogleStatus | null>(null);
    const [locations, setLocations] = useState<GbpLocation[]>([]);
    const [allowed, setAllowed] = useState<string[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState("");
    const [cachedAt, setCachedAt] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [running, setRunning] = useState(false);
    const [runResult, setRunResult] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/google/status");
            const data = await res.json();
            setStatus(data);
            if (data.connected) {
                const [locRes, allowedRes] = await Promise.all([fetch("/api/google/locations"), fetch("/api/google/allowed")]);
                const locData = await locRes.json();
                if (!locRes.ok) throw new Error(locData.error || "Failed to load businesses");
                setLocations(locData.locations || []);
                setCachedAt(locData.cachedAt || null);
                const allowedData = await allowedRes.json();
                if (!allowedRes.ok) throw new Error(allowedData.error || "Failed to load your business selection");
                setAllowed(Array.isArray(allowedData.allowed) ? allowedData.allowed : null);
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
        const params = new URLSearchParams(window.location.search);
        if (params.get("google_error")) {
            setError(`Google connection failed: ${params.get("google_error")}`);
            window.history.replaceState({}, "", window.location.pathname);
        } else if (params.get("google_connected")) {
            window.history.replaceState({}, "", window.location.pathname);
        }
    }, [load]);

    async function refresh() {
        setRefreshing(true);
        setError(null);
        try {
            const res = await fetch("/api/google/locations?refresh=1");
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to refresh businesses");
            setLocations(data.locations || []);
            setCachedAt(data.cachedAt || null);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setRefreshing(false);
        }
    }

    async function disconnect() {
        await fetch("/api/google/status", { method: "DELETE" });
        setStatus((s) => (s ? { ...s, connected: false, email: null } : s));
        setLocations([]);
    }

    async function runNow() {
        setRunning(true);
        setRunResult(null);
        try {
            const res = await fetch("/api/google/auto-reply", { method: "PUT" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Auto-reply run failed");
            const total = (data.results || []).reduce((sum: number, r: any) => sum + r.replied, 0);
            const errors = (data.results || []).flatMap((r: any) => r.errors);
            setRunResult(`Replied to ${total} review${total === 1 ? "" : "s"}.${errors.length ? ` Problems: ${errors.join("; ")}` : ""}`);
        } catch (err: any) {
            setRunResult(`Error: ${err.message}`);
        } finally {
            setRunning(false);
        }
    }

    if (loading) return <Spinner />;

    if (status && !status.configured) {
        return (
            <Notice tone="warn">
                The Google API is not configured. Set <code className="font-bold">GOOGLE_CLIENT_ID</code> and <code className="font-bold">GOOGLE_CLIENT_SECRET</code> in Vercel, then redeploy.
            </Notice>
        );
    }

    if (status && !status.connected) {
        return (
            <div className="space-y-4">
                {error && <Notice tone="bad">{error}</Notice>}
                <EmptyState
                    title="Connect your Google Business Profile"
                    text="Sign in with the Google account that manages your businesses. Reviews, replies and posts all come through this connection."
                    action={<a href="/api/google/auth" className={btn.dark}>Connect Google account</a>}
                />
            </div>
        );
    }

    const visible = locations.filter((loc) => !allowed || allowed.includes(loc.name));
    const shown = visible.filter(
        (loc) => !filter.trim() || `${loc.title} ${loc.address || ""}`.toLowerCase().includes(filter.trim().toLowerCase())
    );

    return (
        <div className="space-y-6">
            {error && <Notice tone="bad" onClose={() => setError(null)}>{error}</Notice>}
            {runResult && <Notice tone={runResult.startsWith("Error") ? "bad" : "ok"} onClose={() => setRunResult(null)}>{runResult}</Notice>}

            <Card>
                <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                    <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        </span>
                        <div>
                            <p className="text-sm font-bold text-slate-900">Google connected</p>
                            <p className="text-xs text-slate-500">{status?.email || "Business Profile account"}</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={runNow} disabled={running} className={btn.primary}>
                            {running ? "Running" : "Run auto-reply now"}
                        </button>
                        <ConfirmButton className={btn.secondary} confirmLabel="Disconnect" onConfirm={disconnect}>
                            Disconnect
                        </ConfirmButton>
                    </div>
                </div>
            </Card>

            <Card>
                <CardHeader
                    title="Businesses"
                    description={`${visible.length} shown, ${visible.filter((l) => l.autoReply?.enabled).length} with auto-reply on${cachedAt ? `. List from ${new Date(cachedAt).toLocaleString()}` : ""}`}
                    actions={
                        <>
                            <a href="/reviews/select" className={btn.secondary}>Choose which to show</a>
                            <button type="button" onClick={refresh} disabled={refreshing} className={btn.secondary}>
                                {refreshing ? "Refreshing" : "Refresh from Google"}
                            </button>
                        </>
                    }
                />
                <div className="px-5 py-4">
                    <input
                        type="search"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        placeholder="Search by name or address"
                        aria-label="Search businesses"
                        className={`${input} max-w-sm`}
                    />
                </div>
                {visible.length === 0 ? (
                    <p className="px-5 pb-8 text-center text-sm text-slate-500">
                        No businesses are selected. <a href="/reviews/select" className="font-semibold underline">Choose which to show.</a>
                    </p>
                ) : shown.length === 0 ? (
                    <p className="px-5 pb-8 text-center text-sm text-slate-500">Nothing matches that search.</p>
                ) : (
                    <ul className="divide-y divide-slate-100 border-t border-slate-100">
                        {shown.map((loc) => (
                            <li key={loc.name}>
                                <a href={`/business/${locationId(loc)}`} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50">
                                    <span className="min-w-0">
                                        <span className="block truncate text-sm font-semibold text-slate-900">{loc.title}</span>
                                        <span className="block truncate text-xs text-slate-500">{loc.address || "No address"}</span>
                                    </span>
                                    <span className="flex shrink-0 items-center gap-3">
                                        {loc.autoReply?.enabled ? (
                                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">Auto-reply on</span>
                                        ) : (
                                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">Manual replies</span>
                                        )}
                                        <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                                    </span>
                                </a>
                            </li>
                        ))}
                    </ul>
                )}
            </Card>
        </div>
    );
}
