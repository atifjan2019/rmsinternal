import React, { useState, useEffect, useCallback } from "react";

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

interface Props {
    manageOpen: boolean;
    onCloseManage: () => void;
}

export default function GoogleReviews({ manageOpen, onCloseManage }: Props) {
    const [status, setStatus] = useState<GoogleStatus | null>(null);
    const [locations, setLocations] = useState<GbpLocation[]>([]);
    const [allowed, setAllowed] = useState<string[] | null>(null);
    const [manageSelection, setManageSelection] = useState<string[]>([]);
    const [manageSaving, setManageSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [locationFilter, setLocationFilter] = useState("");
    const [locationsCachedAt, setLocationsCachedAt] = useState<string | null>(null);
    const [refreshingLocations, setRefreshingLocations] = useState(false);
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
                const [locRes, allowedRes] = await Promise.all([
                    fetch("/api/google/locations"),
                    fetch("/api/google/allowed"),
                ]);
                const locData = await locRes.json();
                if (!locRes.ok) throw new Error(locData.error || "Failed to load locations");
                setLocations(locData.locations || []);
                setLocationsCachedAt(locData.cachedAt || null);
                const allowedData = await allowedRes.json();
                setAllowed(allowedData.allowed || null);
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

    // Seed the manage panel's selection each time it opens
    useEffect(() => {
        if (manageOpen) {
            setManageSelection(allowed ?? locations.map((l) => l.name));
        }
    }, [manageOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    async function saveManageSelection() {
        setManageSaving(true);
        try {
            const res = await fetch("/api/google/allowed", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ allowed: manageSelection }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to save");
            setAllowed(manageSelection);
            onCloseManage();
        } catch (err: any) {
            alert(`Error: ${err.message}`);
        } finally {
            setManageSaving(false);
        }
    }

    async function refreshLocations() {
        setRefreshingLocations(true);
        setError(null);
        try {
            const res = await fetch("/api/google/locations?refresh=1");
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to refresh locations");
            setLocations(data.locations || []);
            setLocationsCachedAt(data.cachedAt || null);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setRefreshingLocations(false);
        }
    }

    async function handleDisconnect() {
        if (!confirm("Disconnect the Google account? Auto-reply will stop working.")) return;
        await fetch("/api/google/status", { method: "DELETE" });
        setStatus((s) => (s ? { ...s, connected: false, email: null } : s));
        setLocations([]);
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
            setRunResult(`Replied to ${total} review(s).${errors.length ? ` Errors: ${errors.join("; ")}` : ""}`);
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

    if (status && !status.connected) {
        return (
            <div className="rounded-[2.5rem] border-2 border-dashed border-slate-200 bg-white py-24 text-center">
                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-slate-50">
                    <svg className="h-10 w-10" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
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

    const visibleLocations = locations.filter((loc) => !allowed || allowed.includes(loc.name));

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

            {/* Select businesses panel (opened from the header) */}
            {manageOpen && (
                <div className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-8">
                    <div className="absolute left-0 top-0 h-full w-2 bg-[#EE314F]" />
                    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h3 className="text-lg font-bold text-slate-900">Select Businesses</h3>
                            <p className="text-sm text-slate-500">
                                Choose which businesses appear on your dashboard. {manageSelection.length} of{" "}
                                {locations.length} selected.
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setManageSelection(locations.map((l) => l.name))}
                                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50"
                            >
                                Select All
                            </button>
                            <button
                                onClick={() => setManageSelection([])}
                                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50"
                            >
                                Clear
                            </button>
                        </div>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {locations.map((loc) => {
                            const checked = manageSelection.includes(loc.name);
                            return (
                                <label
                                    key={loc.name}
                                    className={`flex cursor-pointer items-center gap-3 rounded-2xl border-2 p-3.5 transition-all ${
                                        checked
                                            ? "border-[#EE314F] bg-[#EE314F]/5"
                                            : "border-slate-100 bg-slate-50/50 hover:border-slate-200"
                                    }`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={(e) =>
                                            setManageSelection((prev) =>
                                                e.target.checked
                                                    ? [...prev, loc.name]
                                                    : prev.filter((n) => n !== loc.name)
                                            )
                                        }
                                        className="h-4 w-4 shrink-0 accent-[#EE314F]"
                                    />
                                    <span className="min-w-0">
                                        <span className="block truncate text-sm font-bold text-slate-900">{loc.title}</span>
                                        <span className="block truncate text-xs text-slate-400">{loc.address || ""}</span>
                                    </span>
                                </label>
                            );
                        })}
                    </div>

                    <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-5">
                        <button
                            onClick={onCloseManage}
                            className="rounded-xl px-6 py-3 text-sm font-semibold text-slate-500 hover:bg-slate-100"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={saveManageSelection}
                            disabled={manageSaving}
                            className="rounded-xl bg-[#EE314F] px-8 py-3 text-sm font-bold text-white transition-all hover:bg-[#d42a45] disabled:opacity-50"
                        >
                            {manageSaving ? "Saving..." : "Save Selection"}
                        </button>
                    </div>
                </div>
            )}

            {/* Locations grid */}
            {visibleLocations.length > 0 && (
                <div className="rounded-[2rem] border border-slate-200 bg-white p-6">
                    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h3 className="text-lg font-bold text-slate-900">Your Businesses</h3>
                            <p className="text-sm text-slate-400">
                                {visibleLocations.length} shown ·{" "}
                                {visibleLocations.filter((l) => l.autoReply?.enabled).length} with auto-reply on
                                {locationsCachedAt && ` · list updated ${new Date(locationsCachedAt).toLocaleString()}`}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={refreshLocations}
                                disabled={refreshingLocations}
                                title="Fetch the latest location list from Google"
                                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition-all hover:bg-slate-50 disabled:opacity-50"
                            >
                                <svg
                                    className={`h-4 w-4 ${refreshingLocations ? "animate-spin" : ""}`}
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={2}
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                {refreshingLocations ? "Refreshing..." : "Refresh"}
                            </button>
                            <div className="relative">
                                <svg
                                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={2}
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <input
                                    type="text"
                                    value={locationFilter}
                                    onChange={(e) => setLocationFilter(e.target.value)}
                                    placeholder="Search..."
                                    className="w-44 rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder-slate-400 transition-all focus:border-[#EE314F] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#EE314F]/5"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {visibleLocations
                            .filter(
                                (loc) =>
                                    !locationFilter.trim() ||
                                    (loc.title + " " + (loc.address || ""))
                                        .toLowerCase()
                                        .includes(locationFilter.trim().toLowerCase())
                            )
                            .map((loc) => (
                                <a
                                    key={loc.name}
                                    href={`/business/${locationId(loc)}`}
                                    className="group flex flex-col rounded-2xl border-2 border-slate-100 bg-slate-50/50 p-4 text-left transition-all hover:border-[#EE314F]/40 hover:bg-white hover:shadow-md"
                                >
                                    <span className="flex w-full items-start justify-between gap-2">
                                        <span className="truncate text-sm font-bold text-slate-900 group-hover:text-[#EE314F]">
                                            {loc.title}
                                        </span>
                                        {loc.autoReply?.enabled && (
                                            <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-green-600">
                                                Auto
                                            </span>
                                        )}
                                    </span>
                                    <span className="mt-1 truncate text-xs text-slate-400">{loc.address || "No address"}</span>
                                    <span className="mt-3 flex items-center gap-1 text-xs font-bold text-slate-400 group-hover:text-[#EE314F]">
                                        Manage reviews
                                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                        </svg>
                                    </span>
                                </a>
                            ))}
                    </div>
                </div>
            )}

            {visibleLocations.length === 0 && locations.length > 0 && (
                <div className="rounded-3xl border border-slate-200 bg-white py-16 text-center text-slate-400">
                    No businesses selected. Use <span className="font-bold">Select Businesses</span> in the header to
                    choose which ones appear here.
                </div>
            )}
        </div>
    );
}
