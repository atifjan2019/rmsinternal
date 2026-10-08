import React, { useState, useEffect, useCallback, useRef } from "react";
import type { GbpLocation } from "./BusinessList";
import { Card, CardHeader, ConfirmButton, Notice, Spinner, btn, input, label } from "./ui";

interface PostSettings {
    location_name: string;
    location_title: string;
    enabled: boolean;
    auto_publish: boolean;
    frequency_days: number;
    cta_type: string;
    cta_url: string;
    topics: string[];
    last_generated_at: string | null;
}

interface QueuedPost {
    id: string;
    location_name: string;
    location_title: string;
    summary: string;
    image_url: string | null;
    cta_type: string;
    cta_url: string;
    status: "draft" | "published" | "failed" | "discarded";
    gbp_post_name: string | null;
    error: string | null;
    created_at: string;
    published_at: string | null;
}

interface PostImage {
    id: string;
    location_name: string;
    url: string;
    filename: string;
}

const CTA_OPTIONS = [
    { value: "CALL", label: "Call" },
    { value: "LEARN_MORE", label: "Learn more" },
    { value: "BOOK", label: "Book" },
    { value: "ORDER", label: "Order online" },
    { value: "SHOP", label: "Shop" },
    { value: "SIGN_UP", label: "Sign up" },
    { value: "NONE", label: "No button" },
];

const ctaNeedsUrl = (cta: string) => cta !== "CALL" && cta !== "NONE";

const emptySettings = (loc: GbpLocation): PostSettings => ({
    location_name: loc.name,
    location_title: loc.title,
    enabled: false,
    auto_publish: false,
    frequency_days: 7,
    cta_type: "CALL",
    cta_url: "",
    topics: [],
    last_generated_at: null,
});

export default function PostsManager({
    locations,
    singleLocation,
}: {
    locations: GbpLocation[];
    /** When set, the picker is hidden and this business is shown directly. */
    singleLocation?: GbpLocation;
}) {
    const [selected, setSelected] = useState<GbpLocation | null>(null);
    const [settings, setSettings] = useState<PostSettings | null>(null);
    const [allSettings, setAllSettings] = useState<PostSettings[]>([]);
    const [queue, setQueue] = useState<QueuedPost[]>([]);
    const [images, setImages] = useState<PostImage[]>([]);
    const [imagesConfigured, setImagesConfigured] = useState(true);
    const [imagesGenerate, setImagesGenerate] = useState(false);
    const [imageError, setImageError] = useState<string | null>(null);

    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [editing, setEditing] = useState<Record<string, string>>({});
    // Writing a post happens in stages; this drives the progress bar.
    const [writing, setWriting] = useState<{ stage: string; percent: number } | null>(null);
    // Which draft shows its image picker.
    const [picking, setPicking] = useState<string | null>(null);
    const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
    const [dragging, setDragging] = useState(false);
    const [confirmingImage, setConfirmingImage] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/posts");
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to load posts");
            setQueue(data.queue || []);
            setAllSettings(data.settings || []);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    // On a business page there is nothing to pick — open straight into it.
    useEffect(() => {
        if (!singleLocation || loading) return;
        if (selected?.name === singleLocation.name) return;
        selectLocation(singleLocation);
        // selectLocation is stable enough for this one-shot setup.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [singleLocation, loading, allSettings]);

    const loadImages = useCallback(async (locationName: string) => {
        try {
            const res = await fetch(`/api/posts/images?location=${encodeURIComponent(locationName)}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to load images");
            setImages(data.images || []);
            setImagesConfigured(!!data.configured);
            setImagesGenerate(!!data.generate);
            setImageError(data.configError || null);
        } catch (err: any) {
            setImageError(err.message);
        }
    }, []);

    function selectLocation(loc: GbpLocation) {
        setSelected(loc);
        setError(null);
        setNotice(null);
        const existing = allSettings.find((s) => s.location_name === loc.name);
        setSettings(existing ? { ...existing } : emptySettings(loc));
        loadImages(loc.name);
    }

    async function post(body: any, label: string) {
        setBusy(label);
        setError(null);
        setNotice(null);
        try {
            const res = await fetch("/api/posts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Request failed");
            return data;
        } catch (err: any) {
            setError(err.message);
            return null;
        } finally {
            setBusy(null);
        }
    }

    async function saveSettings() {
        if (!settings) return;
        if (ctaNeedsUrl(settings.cta_type) && !settings.cta_url.trim()) {
            setError(`The "${settings.cta_type}" button needs a destination URL.`);
            return;
        }
        const data = await post({ action: "settings", ...settings }, "settings");
        if (data) {
            setNotice("Settings saved.");
            await load();
        }
    }

    async function generateNow() {
        if (!settings) return;
        setWriting({ stage: "Writing the post", percent: 15 });
        // The bar creeps forward while the model works, so a 10-second wait does not look stuck.
        const creep = setInterval(() => setWriting((w) => (w && w.percent < 85 ? { ...w, percent: w.percent + 2 } : w)), 400);
        try {
            const data = await post({ action: "generate", location_name: settings.location_name }, "generate");
            if (!data?.post) return;
            const made: QueuedPost = data.post;
            // A business with photos gets one from its library at once. Otherwise,
            // when image generation is on, a picture is made for this post now.
            if (!made.image_url && imagesGenerate) {
                setWriting({ stage: "Making the picture", percent: 55 });
                const img = await post({ action: "generate-image", id: made.id }, "generate");
                if (img?.image) made.image_url = img.image.url;
            }
            setWriting({ stage: "Done", percent: 100 });
            await load();
            if (settings) loadImages(settings.location_name);
            setNotice("Your post is ready below. Check it, change anything you like, then publish.");
            setTimeout(() => document.getElementById(`post-${made.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
        } finally {
            clearInterval(creep);
            setTimeout(() => setWriting(null), 600);
        }
    }

    async function publish(id: string) {
        const data = await post({ action: "publish", id }, `publish:${id}`);
        if (data) {
            setNotice("Published to Google.");
            await load();
        }
    }

    async function saveDraft(p: QueuedPost) {
        const summary = editing[p.id] ?? p.summary;
        const data = await post({ action: "update", id: p.id, summary }, `save:${p.id}`);
        if (data) {
            setNotice("Draft saved.");
            setEditing((e) => {
                const next = { ...e };
                delete next[p.id];
                return next;
            });
            await load();
        }
    }

    async function editPublished(p: QueuedPost) {
        const summary = editing[p.id] ?? p.summary;
        if (!summary.trim()) {
            setError("Post text cannot be empty.");
            return;
        }
        const data = await post({ action: "edit-published", id: p.id, summary }, `editlive:${p.id}`);
        if (data) {
            setNotice("Post updated on Google.");
            setEditing((e) => {
                const next = { ...e };
                delete next[p.id];
                return next;
            });
            await load();
        }
    }

    async function removePost(p: QueuedPost) {
        const live = p.status === "published";
        const data = await post({ action: "delete", id: p.id }, `del:${p.id}`);
        if (data) {
            setNotice(live ? "Post deleted from Google." : "Post removed.");
            await load();
        }
    }

    async function generateImage(p: QueuedPost) {
        const data = await post(
            { action: "generate-image", id: p.id, summary: editing[p.id] ?? p.summary },
            `genimg:${p.id}`
        );
        if (!data) return;
        setQueue((q) => q.map((x) => (x.id === p.id ? { ...x, image_url: data.image.url } : x)));
        if (settings) loadImages(settings.location_name);
        setNotice("Image made and attached. It is in the library too, so later posts can use it.");
    }

    async function attachImage(p: QueuedPost, url: string | null) {
        const data = await post({ action: "update", id: p.id, image_url: url }, `img:${p.id}`);
        if (data) await load();
    }

    async function uploadImages(fileList: File[]) {
        let files = fileList;
        if (!selected || files.length === 0) return;

        setBusy("upload");
        setError(null);
        setNotice(null);
        setUploadProgress({ done: 0, total: files.length });

        const failures: string[] = [];
        let uploaded = 0;

        // Checked here as well as on the server: Vercel rejects a body over
        // 4.5MB before our handler runs, which surfaces as an opaque error.
        const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
        const tooBig = files.filter((f) => f.size > MAX_UPLOAD_BYTES);
        files = files.filter((f) => f.size <= MAX_UPLOAD_BYTES);
        for (const f of tooBig) {
            failures.push(`${f.name}: larger than 4MB (${(f.size / 1024 / 1024).toFixed(1)}MB)`);
        }

        if (files.length === 0) {
            setUploadProgress(null);
            setBusy(null);
            if (fileRef.current) fileRef.current.value = "";
            setError(
                `Nothing uploaded — ${failures.length} file${failures.length === 1 ? " is" : "s are"} over the 4MB limit. Resize and try again.`
            );
            return;
        }

        setUploadProgress({ done: 0, total: files.length });

        // Sequential: a batch of large photos in parallel is a good way to hit
        // the function's memory and body limits.
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            setUploadProgress({ done: i, total: files.length });

            try {
                const form = new FormData();
                form.append("file", file);
                const res = await fetch(`/api/posts/images?location=${encodeURIComponent(selected.name)}`, {
                    method: "POST",
                    body: form,
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Upload failed");
                uploaded++;
            } catch (err: any) {
                // Keep going: one rejected file should not lose the rest.
                failures.push(`${file.name}: ${err.message}`);
            }
        }

        setUploadProgress(null);
        setBusy(null);
        if (fileRef.current) fileRef.current.value = "";

        await loadImages(selected.name);

        if (uploaded > 0) {
            setNotice(`${uploaded} image${uploaded === 1 ? "" : "s"} uploaded.`);
        }
        if (failures.length) {
            setError(
                `${failures.length} file${failures.length === 1 ? "" : "s"} could not be uploaded — ` +
                    failures.slice(0, 4).join("; ") +
                    (failures.length > 4 ? ` (and ${failures.length - 4} more)` : "")
            );
        }
    }

    async function deleteImage(id: string) {
        try {
            const res = await fetch(`/api/posts/images?id=${encodeURIComponent(id)}`, { method: "DELETE" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Delete failed");
            if (selected) await loadImages(selected.name);
        } catch (err: any) {
            setError(err.message);
        }
    }

    if (loading) return <Spinner />;

    const visibleQueue = selected ? queue.filter((p) => p.location_name === selected.name) : queue;
    const drafts = visibleQueue.filter((p) => p.status === "draft");
    const history = visibleQueue.filter((p) => p.status === "published" || p.status === "failed");

    return (
        <div className="space-y-6">
            {error && <Notice tone="bad" onClose={() => setError(null)}>{error}</Notice>}
            {notice && <Notice tone="ok" onClose={() => setNotice(null)}>{notice}</Notice>}

            {settings && selected && (
                <>
                    {/* Settings */}
                    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-8">
                        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h4 className="text-lg font-bold text-slate-900">{selected.title}</h4>
                                <p className="mt-1 text-sm text-slate-500">
                                    Posts are written from the business notes on the Auto-reply page.
                                </p>
                            </div>
                            <label className="flex cursor-pointer items-center gap-3">
                                <span className="text-sm font-bold text-slate-700">Switched on</span>
                                <input
                                    type="checkbox"
                                    checked={settings.enabled}
                                    onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
                                    className="h-5 w-5 accent-primary"
                                />
                            </label>
                        </div>

                        <div className="grid gap-5 sm:grid-cols-2">
                            <div>
                                <label className="mb-1.5 block text-sm font-semibold text-slate-700">How often</label>
                                <select
                                    value={settings.frequency_days}
                                    onChange={(e) => setSettings({ ...settings, frequency_days: Number(e.target.value) })}
                                    className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm focus:border-primary focus:bg-white focus:outline-none"
                                >
                                    <option value={3}>Every 3 days</option>
                                    <option value={7}>Weekly</option>
                                    <option value={14}>Every 2 weeks</option>
                                    <option value={30}>Monthly</option>
                                </select>
                            </div>

                            <div>
                                <label className="mb-1.5 block text-sm font-semibold text-slate-700">Button</label>
                                <select
                                    value={settings.cta_type}
                                    onChange={(e) => setSettings({ ...settings, cta_type: e.target.value })}
                                    className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm focus:border-primary focus:bg-white focus:outline-none"
                                >
                                    {CTA_OPTIONS.map((o) => (
                                        <option key={o.value} value={o.value}>
                                            {o.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {ctaNeedsUrl(settings.cta_type) && (
                                <div className="sm:col-span-2">
                                    <label className="mb-1.5 block text-sm font-semibold text-slate-700">Button link</label>
                                    <input
                                        type="url"
                                        value={settings.cta_url}
                                        onChange={(e) => setSettings({ ...settings, cta_url: e.target.value })}
                                        placeholder="https://..."
                                        className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm focus:border-primary focus:bg-white focus:outline-none"
                                    />
                                </div>
                            )}

                            <div className="sm:col-span-2">
                                <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                                    Topics to rotate through
                                </label>
                                <p className="mb-2 text-xs text-slate-400">
                                    One per line. Each post takes the next topic in turn. Leave empty and the AI picks
                                    from your knowledge base.
                                </p>
                                <textarea
                                    rows={4}
                                    value={settings.topics.join("\n")}
                                    onChange={(e) =>
                                        setSettings({ ...settings, topics: e.target.value.split("\n") })
                                    }
                                    placeholder={"Emergency callout\nTyre brands we fit\nAreas we cover"}
                                    className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm focus:border-primary focus:bg-white focus:outline-none"
                                />
                            </div>

                            <div className="sm:col-span-2">
                                <label className="flex cursor-pointer items-start gap-3 rounded-lg border-2 border-slate-100 p-4">
                                    <input
                                        type="checkbox"
                                        checked={settings.auto_publish}
                                        onChange={(e) => setSettings({ ...settings, auto_publish: e.target.checked })}
                                        className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
                                    />
                                    <span>
                                        <span className="block text-sm font-bold text-slate-900">
                                            Publish automatically for this business
                                        </span>
                                        <span className="mt-0.5 block text-xs text-slate-500">
                                            Off (recommended to start): posts wait here for your approval. On: they go
                                            live on Google as soon as they're written.
                                        </span>
                                    </span>
                                </label>
                            </div>
                        </div>

                        {writing && (
                            <div className="mt-6 rounded-lg border border-primary/20 bg-primary/5 px-5 py-4" role="status">
                                <div className="flex items-center justify-between text-sm font-semibold text-slate-800">
                                    <span>{writing.stage}&hellip;</span>
                                    <span className="text-xs text-slate-500">{writing.percent}%</span>
                                </div>
                                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white">
                                    <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${writing.percent}%` }} />
                                </div>
                                <p className="mt-2 text-xs text-slate-500">
                                    First the text, then a matching picture. About 10 to 30 seconds.
                                </p>
                            </div>
                        )}

                        <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 pt-5">
                            <button
                                onClick={generateNow}
                                disabled={busy === "generate"}
                                className="rounded-xl border border-primary/30 bg-primary/5 px-5 py-3 text-sm font-bold text-primary transition-all hover:bg-primary/10 disabled:opacity-50"
                            >
                                {busy === "generate" ? "Writing" : "Write a post now"}
                            </button>
                            <button
                                onClick={saveSettings}
                                disabled={busy === "settings"}
                                className="rounded-xl bg-primary px-8 py-3 text-sm font-bold text-white transition-all hover:bg-primary-hover disabled:opacity-50"
                            >
                                {busy === "settings" ? "Saving" : "Save settings"}
                            </button>
                        </div>
                    </div>

                    {/* Image library */}
                    <div
                        onDragOver={(e) => {
                            e.preventDefault();
                            setDragging(true);
                        }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={(e) => {
                            e.preventDefault();
                            setDragging(false);
                            const files = Array.from(e.dataTransfer.files || []).filter((f) =>
                                f.type.startsWith("image/")
                            );
                            if (files.length) uploadImages(files);
                        }}
                        className={`rounded-xl border bg-white p-6 transition-colors ${
                            dragging ? "border-primary bg-primary/5" : "border-slate-200"
                        }`}
                    >
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h4 className="text-lg font-bold text-slate-900">Image library</h4>
                                <p className="text-sm text-slate-500">
                                    Select or drag in several at once. Posts use the least recently used image, so a few photos keep things varied.
                                </p>
                            </div>
                            <>
                                <input
                                    ref={fileRef}
                                    type="file"
                                    multiple
                                    accept="image/jpeg,image/png,image/webp"
                                    className="hidden"
                                    onChange={(e) => {
                                        const files = Array.from(e.target.files || []);
                                        if (files.length) uploadImages(files);
                                    }}
                                />
                                <button
                                    onClick={() => fileRef.current?.click()}
                                    disabled={busy === "upload" || !imagesConfigured}
                                    className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 transition-all hover:bg-slate-50 disabled:opacity-50"
                                >
                                    {uploadProgress
                                        ? `Uploading ${uploadProgress.done + 1} of ${uploadProgress.total}...`
                                        : "Upload images"}
                                </button>
                            </>
                        </div>

                        {imageError && (
                            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                                {imageError}
                            </div>
                        )}

                        {uploadProgress && (
                            <div className="mb-4">
                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                                    <div
                                        className="h-full rounded-full bg-primary transition-all"
                                        style={{ width: `${Math.round((uploadProgress.done / uploadProgress.total) * 100)}%` }}
                                    />
                                </div>
                                <p className="mt-1.5 text-xs text-slate-400">
                                    Uploading {uploadProgress.done + 1} of {uploadProgress.total}&hellip;
                                </p>
                            </div>
                        )}

                        {images.length === 0 ? (
                            <p className="py-8 text-center text-sm text-slate-400">
                                No images yet — drag photos here or use Upload images. Posts work without one, but
                                perform better with a photo.
                            </p>
                        ) : (
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                                {images.map((img) => (
                                    <div key={img.id} className="group relative overflow-hidden rounded-lg border border-slate-200">
                                        <img src={img.url} alt={img.filename} className="aspect-square w-full object-cover" />
                                        <button
                                            onClick={() => (confirmingImage === img.id ? deleteImage(img.id) : setConfirmingImage(img.id))}
                                            onBlur={() => setConfirmingImage(null)}
                                            title={confirmingImage === img.id ? "Press again to delete" : "Delete image"}
                                            aria-label={confirmingImage === img.id ? "Press again to delete this image" : "Delete image"}
                                            className={`absolute right-1.5 top-1.5 flex h-7 items-center justify-center rounded-md px-1.5 text-xs font-semibold transition-opacity ${confirmingImage === img.id ? "w-auto bg-red-600 text-white opacity-100" : "w-7 bg-white/90 text-slate-500 opacity-0 hover:text-red-600 group-hover:opacity-100 focus:opacity-100"}`}
                                        >
                                            {confirmingImage === img.id ? "Delete?" : null}
                                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M4 7h16" />
                                            </svg>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* Drafts awaiting approval */}
            {drafts.length > 0 && (
                <div className="space-y-4">
                    <h4 className="text-lg font-bold text-slate-900">
                        Waiting for approval <span className="text-slate-400">({drafts.length})</span>
                    </h4>
                    {drafts.map((p) => {
                        const isEditing = editing[p.id] !== undefined;
                        return (
                        <div key={p.id} id={`post-${p.id}`} className="rounded-xl border border-slate-200 bg-white p-6 scroll-mt-6">
                            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                                <span className="text-sm font-bold text-slate-900">{p.location_title}</span>
                                <span className="text-xs text-slate-400">
                                    Written {new Date(p.created_at).toLocaleString()}
                                </span>
                            </div>

                            <div className="flex flex-col gap-5 sm:flex-row">
                                {/* The picture, as Google will show it, with its own controls. */}
                                <div className="w-full shrink-0 sm:w-64">
                                    {p.image_url ? (
                                        <img
                                            src={p.image_url}
                                            alt=""
                                            className="aspect-[4/3] w-full rounded-lg border border-slate-200 object-cover"
                                        />
                                    ) : (
                                        <div className="flex aspect-[4/3] w-full items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-400">
                                            No picture
                                        </div>
                                    )}
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {imagesGenerate && (
                                            <button
                                                onClick={() => generateImage(p)}
                                                disabled={busy === `genimg:${p.id}`}
                                                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                            >
                                                {busy === `genimg:${p.id}` ? "Making" : p.image_url ? "New picture" : "Make a picture"}
                                            </button>
                                        )}
                                        {images.length > 0 && (
                                            <button
                                                onClick={() => setPicking(picking === p.id ? null : p.id)}
                                                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                            >
                                                {picking === p.id ? "Close" : "Choose from library"}
                                            </button>
                                        )}
                                        {p.image_url && (
                                            <button
                                                onClick={() => attachImage(p, null)}
                                                disabled={busy === `img:${p.id}`}
                                                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-400 hover:bg-slate-100"
                                            >
                                                Remove
                                            </button>
                                        )}
                                    </div>
                                    {picking === p.id && (
                                        <div className="mt-2 grid grid-cols-3 gap-2">
                                            {images.map((img) => (
                                                <button
                                                    key={img.id}
                                                    onClick={() => { attachImage(p, img.url); setPicking(null); }}
                                                    title={img.filename}
                                                    className={`overflow-hidden rounded-lg border-2 ${p.image_url === img.url ? "border-primary" : "border-transparent hover:border-slate-300"}`}
                                                >
                                                    <img src={img.url} alt={img.filename} className="aspect-square w-full object-cover" />
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* The text: shown as it will read, or a box when being changed. */}
                                <div className="min-w-0 flex-1">
                                    {isEditing ? (
                                        <textarea
                                            rows={5}
                                            autoFocus
                                            value={editing[p.id]}
                                            onChange={(e) => setEditing({ ...editing, [p.id]: e.target.value })}
                                            className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-900 focus:border-primary focus:bg-white focus:outline-none"
                                        />
                                    ) : (
                                        <p className="whitespace-pre-wrap rounded-lg bg-slate-50/70 px-4 py-3 text-sm leading-relaxed text-slate-900">{p.summary}</p>
                                    )}
                                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                                        <span>{(editing[p.id] ?? p.summary).length} characters</span>
                                        <span>·</span>
                                        <span>Button: {CTA_OPTIONS.find((c) => c.value === p.cta_type)?.label || p.cta_type}</span>
                                    </div>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {isEditing ? (
                                            <>
                                                <button
                                                    onClick={() => saveDraft(p)}
                                                    disabled={busy === `save:${p.id}` || editing[p.id] === p.summary}
                                                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                                                >
                                                    {busy === `save:${p.id}` ? "Saving" : "Save text"}
                                                </button>
                                                <button
                                                    onClick={() => setEditing((e) => { const n = { ...e }; delete n[p.id]; return n; })}
                                                    className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100"
                                                >
                                                    Cancel
                                                </button>
                                            </>
                                        ) : (
                                            <button
                                                onClick={() => setEditing({ ...editing, [p.id]: p.summary })}
                                                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                            >
                                                Change text
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                                <ConfirmButton className={btn.primary} confirmLabel="Publish now" onConfirm={() => publish(p.id)} disabled={busy === `publish:${p.id}`}>
                                    {busy === `publish:${p.id}` ? "Publishing" : "Publish to Google"}
                                </ConfirmButton>
                                <ConfirmButton className={btn.ghost} confirmLabel="Delete" onConfirm={() => removePost(p)} disabled={busy === `del:${p.id}`}>
                                    {busy === `del:${p.id}` ? "Deleting" : "Delete"}
                                </ConfirmButton>
                            </div>
                        </div>
                        );
                    })}
                </div>
            )}

            {/* History */}
            {history.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white p-6">
                    <h4 className="text-lg font-bold text-slate-900">Recent posts</h4>
                    <p className="mb-4 mt-1 text-sm text-slate-500">
                        Text and button can be changed after publishing. To change the image, delete the post and
                        publish a new one: Google does not allow swapping it.
                    </p>
                    <div className="space-y-3">
                        {history.slice(0, 15).map((p) => {
                            const isEditing = editing[p.id] !== undefined;
                            return (
                                <div key={p.id} className="border-b border-slate-50 pb-4 last:border-0">
                                    <div className="flex items-start gap-3">
                                        <span
                                            className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                                p.status === "published"
                                                    ? "bg-green-100 text-green-700"
                                                    : "bg-red-100 text-red-700"
                                            }`}
                                        >
                                            {p.status}
                                        </span>

                                        <div className="min-w-0 flex-1">
                                            {isEditing ? (
                                                <textarea
                                                    rows={4}
                                                    value={editing[p.id]}
                                                    onChange={(e) => setEditing({ ...editing, [p.id]: e.target.value })}
                                                    className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-900 focus:border-primary focus:bg-white focus:outline-none"
                                                />
                                            ) : (
                                                <p className="text-sm text-slate-600">{p.summary}</p>
                                            )}

                                            <p className="mt-1 text-xs text-slate-400">
                                                {p.location_title} ·{" "}
                                                {p.published_at
                                                    ? new Date(p.published_at).toLocaleString()
                                                    : new Date(p.created_at).toLocaleString()}
                                                {p.error ? ` · ${p.error}` : ""}
                                            </p>

                                            <div className="mt-2 flex flex-wrap gap-2">
                                                {p.status === "published" && !isEditing && (
                                                    <button
                                                        onClick={() => setEditing({ ...editing, [p.id]: p.summary })}
                                                        className="text-xs font-bold text-primary hover:underline"
                                                    >
                                                        Edit
                                                    </button>
                                                )}

                                                {isEditing && (
                                                    <>
                                                        <ConfirmButton className={btn.small} confirmLabel="Update on Google" onConfirm={() => editPublished(p)} disabled={busy === `editlive:${p.id}`}>
                                                            {busy === `editlive:${p.id}` ? "Updating" : "Update on Google"}
                                                        </ConfirmButton>
                                                        <button
                                                            onClick={() =>
                                                                setEditing((e) => {
                                                                    const next = { ...e };
                                                                    delete next[p.id];
                                                                    return next;
                                                                })
                                                            }
                                                            className="px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-slate-600"
                                                        >
                                                            Cancel
                                                        </button>
                                                    </>
                                                )}

                                                {p.gbp_post_name && !isEditing && (
                                                    <span className="text-xs text-slate-300">·</span>
                                                )}

                                                {!isEditing && (
                                                    <ConfirmButton className={`${btn.small} text-red-600`} confirmLabel={p.status === "published" ? "Delete from Google" : "Remove"} onConfirm={() => removePost(p)} disabled={busy === `del:${p.id}`}>
                                                        {busy === `del:${p.id}` ? "Deleting" : p.status === "published" ? "Delete from Google" : "Remove"}
                                                    </ConfirmButton>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

        </div>
    );
}
