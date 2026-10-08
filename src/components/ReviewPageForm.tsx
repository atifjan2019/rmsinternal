import React, { useEffect, useState } from "react";
import { Card, Notice, Spinner, btn, input, label } from "./ui";
import type { ReviewLink } from "./ReviewPages";

/** Creating or editing one review page. With `id`, the existing page is loaded first. */
export default function ReviewPageForm({ id }: { id?: string }) {
    const [form, setForm] = useState({ businessName: "", gmbReviewLink: "", logoUrl: "", backgroundImageUrl: "" });
    const [loading, setLoading] = useState(!!id);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;
        (async () => {
            try {
                const res = await fetch("/api/links");
                const data: ReviewLink[] = await res.json();
                const link = data.find((l) => l.id === id);
                if (!link) throw new Error("This review page no longer exists.");
                setForm({
                    businessName: link.businessName,
                    gmbReviewLink: link.gmbReviewLink,
                    logoUrl: link.logoUrl || "",
                    backgroundImageUrl: link.backgroundImageUrl || "",
                });
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        })();
    }, [id]);

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        setError(null);
        try {
            const res = await fetch(id ? `/api/links?id=${id}` : "/api/links", {
                method: id ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Could not save");
            window.location.href = "/review-pages";
        } catch (err: any) {
            setError(err.message);
            setSaving(false);
        }
    }

    if (loading) return <Spinner />;

    const field = (key: keyof typeof form) => ({
        value: form[key],
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value }),
        className: input,
    });

    return (
        <form onSubmit={submit} className="space-y-6">
            {error && <Notice tone="bad" onClose={() => setError(null)}>{error}</Notice>}
            <Card className="p-5 sm:p-6">
                <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                        <label htmlFor="businessName" className={label}>Business name</label>
                        <input id="businessName" type="text" required placeholder="Acme Removals" {...field("businessName")} />
                    </div>
                    <div>
                        <label htmlFor="gmbReviewLink" className={label}>Google review link</label>
                        <input id="gmbReviewLink" type="url" required placeholder="https://search.google.com/local/writereview?placeid=..." {...field("gmbReviewLink")} />
                        <p className="mt-1 text-xs text-slate-500">Where 5-star customers are sent. From your Business Profile: Ask for reviews.</p>
                    </div>
                    <div>
                        <label htmlFor="logoUrl" className={label}>Logo image address <span className="font-normal text-slate-400">(optional)</span></label>
                        <input id="logoUrl" type="url" placeholder="https://..." {...field("logoUrl")} />
                    </div>
                    <div>
                        <label htmlFor="backgroundImageUrl" className={label}>Background image address <span className="font-normal text-slate-400">(optional)</span></label>
                        <input id="backgroundImageUrl" type="url" placeholder="https://..." {...field("backgroundImageUrl")} />
                    </div>
                </div>
            </Card>
            <div className="flex flex-wrap justify-end gap-2">
                <a href="/review-pages" className={btn.ghost}>Cancel</a>
                <button type="submit" disabled={saving} className={btn.primary}>
                    {saving ? "Saving" : id ? "Save changes" : "Create review page"}
                </button>
            </div>
        </form>
    );
}
