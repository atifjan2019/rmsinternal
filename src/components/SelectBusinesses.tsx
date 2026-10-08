import React, { useEffect, useState } from "react";
import { Card, CardHeader, Notice, Spinner, btn } from "./ui";
import type { GbpLocation } from "./BusinessList";

/** Its own page: which of the Google businesses appear in the app. */
export default function SelectBusinesses() {
    const [locations, setLocations] = useState<GbpLocation[]>([]);
    const [selection, setSelection] = useState<string[]>([]);
    const [cachedAt, setCachedAt] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const [locRes, allowedRes] = await Promise.all([fetch("/api/google/locations"), fetch("/api/google/allowed")]);
                const locData = await locRes.json();
                if (!locRes.ok) throw new Error(locData.error || "Failed to load businesses");
                const allowedData = await allowedRes.json();
                if (!allowedRes.ok) throw new Error(allowedData.error || "Failed to load your selection");
                const all: GbpLocation[] = locData.locations || [];
                setLocations(all);
                setCachedAt(locData.cachedAt || null);
                setSelection(Array.isArray(allowedData.allowed) ? allowedData.allowed : all.map((l) => l.name));
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    async function refresh() {
        setRefreshing(true);
        setError(null);
        try {
            const res = await fetch("/api/google/locations?refresh=1");
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to refresh");
            setLocations(data.locations || []);
            setCachedAt(data.cachedAt || null);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setRefreshing(false);
        }
    }

    async function save() {
        setSaving(true);
        setError(null);
        setSaved(false);
        try {
            const res = await fetch("/api/google/allowed", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ allowed: selection }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to save");
            setSaved(true);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    }

    if (loading) return <Spinner />;

    return (
        <div className="space-y-6">
            {error && <Notice tone="bad" onClose={() => setError(null)}>{error}</Notice>}
            {saved && (
                <Notice tone="ok" onClose={() => setSaved(false)}>
                    Saved. <a href="/reviews" className="font-bold underline">Back to Google Reviews</a>
                </Notice>
            )}
            <Card>
                <CardHeader
                    title={`${selection.length} of ${locations.length} selected`}
                    description={cachedAt ? `List from Google, updated ${new Date(cachedAt).toLocaleString()}` : undefined}
                    actions={
                        <>
                            <button type="button" className={btn.small} onClick={refresh} disabled={refreshing}>{refreshing ? "Refreshing" : "Refresh from Google"}</button>
                            <button type="button" className={btn.small} onClick={() => setSelection(locations.map((l) => l.name))}>Select all</button>
                            <button type="button" className={btn.small} onClick={() => setSelection([])}>Clear</button>
                        </>
                    }
                />
                <ul className="divide-y divide-slate-100">
                    {locations.map((loc) => {
                        const checked = selection.includes(loc.name);
                        return (
                            <li key={loc.name}>
                                <label className="flex cursor-pointer items-center gap-3 px-5 py-3.5 hover:bg-slate-50">
                                    <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={(e) => setSelection((prev) => (e.target.checked ? [...prev, loc.name] : prev.filter((n) => n !== loc.name)))}
                                        className="h-4 w-4 accent-primary"
                                    />
                                    <span className="min-w-0">
                                        <span className="block truncate text-sm font-semibold text-slate-900">{loc.title}</span>
                                        <span className="block truncate text-xs text-slate-500">{loc.address || ""}</span>
                                    </span>
                                </label>
                            </li>
                        );
                    })}
                </ul>
                <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
                    <a href="/reviews" className={btn.ghost}>Cancel</a>
                    <button type="button" className={btn.primary} onClick={save} disabled={saving}>{saving ? "Saving" : "Save selection"}</button>
                </div>
            </Card>
        </div>
    );
}
