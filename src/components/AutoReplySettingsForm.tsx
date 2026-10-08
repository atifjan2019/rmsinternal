import React, { useEffect, useState } from "react";
import { Card, CardHeader, Notice, Spinner, Stars, btn, input, label } from "./ui";
import BusinessHeader from "./BusinessHeader";
import { useBusiness } from "./useBusiness";

const DEFAULT_TEMPLATES: Record<string, string> = {
    "5": "Thank you so much, {name}! We really appreciate your kind words and your support.",
    "4": "Thanks for the great feedback, {name}! We're glad you had a good experience.",
    "3": "Thank you for your feedback, {name}. We're always working to improve and hope to serve you even better next time.",
    "2": "Thank you for your honest feedback, {name}. We're sorry your experience wasn't ideal. Please get in touch so we can put it right.",
    "1": "We're very sorry to hear this, {name}. Please contact us directly so we can understand what went wrong and make it right.",
};

/** The auto-reply settings for one business, on their own page. */
export default function AutoReplySettingsForm({ locationId }: { locationId: string }) {
    const { status, location, loading, error: loadError } = useBusiness(locationId);
    const [enabled, setEnabled] = useState(false);
    const [mode, setMode] = useState<"template" | "ai">("template");
    const [instructions, setInstructions] = useState("");
    const [stars, setStars] = useState<number[]>([1, 2, 3, 4, 5]);
    const [templates, setTemplates] = useState<Record<string, string>>(DEFAULT_TEMPLATES);
    const [saving, setSaving] = useState(false);
    const [notice, setNotice] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

    useEffect(() => {
        if (!location) return;
        const ar = location.autoReply;
        setEnabled(ar?.enabled || false);
        setMode(ar?.mode || "template");
        setInstructions(ar?.ai_instructions || "");
        setStars(ar?.allowed_stars?.length ? ar.allowed_stars : [1, 2, 3, 4, 5]);
        setTemplates(ar?.templates && Object.keys(ar.templates).length ? { ...DEFAULT_TEMPLATES, ...ar.templates } : DEFAULT_TEMPLATES);
    }, [location]);

    async function save(e: React.FormEvent) {
        e.preventDefault();
        if (!location) return;
        setSaving(true);
        setNotice(null);
        try {
            const res = await fetch("/api/google/auto-reply", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    location_name: location.name,
                    location_title: location.title,
                    enabled,
                    templates,
                    mode,
                    ai_instructions: instructions,
                    allowed_stars: stars,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to save");
            setNotice({ tone: "ok", text: "Saved." });
        } catch (err: any) {
            setNotice({ tone: "bad", text: err.message });
        } finally {
            setSaving(false);
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

    return (
        <form onSubmit={save} className="space-y-6">
            <BusinessHeader location={location} locationId={locationId} current="auto-reply" />
            {notice && <Notice tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Notice>}

            <Card>
                <CardHeader
                    title="Automatic replies"
                    description="New reviews get a reply without you doing anything. Runs every hour."
                    actions={
                        <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
                            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 accent-primary" />
                            Switched on
                        </label>
                    }
                />
                <div className="space-y-6 px-5 py-5">
                    <fieldset>
                        <legend className={label}>How replies are written</legend>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {(
                                [
                                    { id: "ai", title: "Written by AI", text: "A fresh, personal reply for every review, using the business notes below." },
                                    { id: "template", title: "Fixed templates", text: "The same reply for each star rating, with the reviewer's name filled in." },
                                ] as const
                            ).map((opt) => (
                                <label key={opt.id} className={`flex cursor-pointer gap-3 rounded-lg border p-4 ${mode === opt.id ? "border-primary bg-primary/5" : "border-slate-200 hover:border-slate-300"}`}>
                                    <input type="radio" name="mode" value={opt.id} checked={mode === opt.id} onChange={() => setMode(opt.id)} className="mt-1 accent-primary" />
                                    <span>
                                        <span className="flex items-center gap-2 text-sm font-bold text-slate-900">
                                            {opt.title}
                                            {opt.id === "ai" && !status?.ai && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">Needs an API key</span>}
                                        </span>
                                        <span className="mt-0.5 block text-xs text-slate-500">{opt.text}</span>
                                    </span>
                                </label>
                            ))}
                        </div>
                    </fieldset>

                    <fieldset>
                        <legend className={label}>Reply to these ratings</legend>
                        <p className="mb-2 text-xs text-slate-500">Untick low ratings if you would rather answer those yourself.</p>
                        <div className="flex flex-wrap gap-2">
                            {[5, 4, 3, 2, 1].map((s) => {
                                const on = stars.includes(s);
                                return (
                                    <label key={s} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${on ? "border-primary bg-primary/5 text-slate-900" : "border-slate-200 text-slate-500"}`}>
                                        <input type="checkbox" checked={on} onChange={() => setStars((prev) => (on ? prev.filter((x) => x !== s) : [...prev, s]))} className="accent-primary" />
                                        <Stars rating={s} className="h-3.5 w-3.5" />
                                        <span className="sr-only">{s} star</span>
                                    </label>
                                );
                            })}
                        </div>
                    </fieldset>

                    {mode === "ai" ? (
                        <div>
                            <label htmlFor="instructions" className={label}>About the business, and how to reply</label>
                            <p className="mb-2 text-xs text-slate-500">
                                What you do, where, your tone, and anything replies should mention. For example: &ldquo;Mobile tyre fitting in Bolton, 24 hours. Friendly but professional. For complaints, ask them to call 01204 000000.&rdquo; Auto posts use these notes too.
                            </p>
                            <textarea id="instructions" rows={7} value={instructions} onChange={(e) => setInstructions(e.target.value)} className={input} />
                            <p className="mt-1 text-xs text-slate-500">The templates below are kept as a fallback if the AI cannot answer.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <p className="text-sm text-slate-600">
                                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-bold">{"{name}"}</code> puts in the reviewer&apos;s first name. Leave a box empty to skip that rating.
                            </p>
                            {["5", "4", "3", "2", "1"].map((s) => (
                                <div key={s}>
                                    <label htmlFor={`t${s}`} className={`${label} flex items-center gap-2`}>
                                        <Stars rating={parseInt(s)} className="h-3.5 w-3.5" /> {s}-star reviews
                                    </label>
                                    <textarea id={`t${s}`} rows={2} value={templates[s] || ""} onChange={(e) => setTemplates({ ...templates, [s]: e.target.value })} className={input} />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
                    <a href={`/business/${locationId}`} className={btn.ghost}>Back to reviews</a>
                    <button type="submit" disabled={saving} className={btn.primary}>{saving ? "Saving" : "Save settings"}</button>
                </div>
            </Card>
        </form>
    );
}
