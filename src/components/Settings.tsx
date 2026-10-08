import React, { useEffect, useState } from "react";

type Key = "AI_API_KEY" | "AI_BASE_URL" | "AI_MODEL" | "AI_PROXY_KEY" | "IMAGE_PROVIDER" | "IMAGE_API_KEY" | "IMAGE_MODEL" | "CF_AI_ACCOUNT_ID" | "CF_AI_TOKEN" | "IMAGE_DAILY_LIMIT";
type Field = { value: string; set: boolean; source: "saved" | "env" | "default" | "none" };
type Current = Record<Key, Field> & { usage?: { today: number; limit: number } };

const FIELDS: { key: Key; label: string; secret: boolean; hint: string; placeholder: string; group: "ai" | "image"; provider?: "gemini" | "cloudflare"; select?: { value: string; label: string }[] }[] = [
    {
        key: "AI_API_KEY",
        label: "AI API key",
        secret: true,
        hint: "The key for your AI provider: Anthropic (Claude), Agent Router, or any OpenAI-compatible API. Used for review replies and auto posts.",
        placeholder: "sk-ant-... or sk-...",
        group: "ai",
    },
    {
        key: "AI_BASE_URL",
        label: "API base URL",
        secret: false,
        hint: "Where requests go. For Claude use https://api.anthropic.com/v1. Leave blank for https://agentrouter.org/v1.",
        placeholder: "https://api.anthropic.com/v1",
        group: "ai",
    },
    {
        key: "AI_MODEL",
        label: "Model",
        secret: false,
        hint: "The model name the provider expects, for example claude-sonnet-5-5 or claude-opus-5-5 for Claude. Leave blank for gpt-5.6-sol.",
        placeholder: "claude-sonnet-5-5",
        group: "ai",
    },
    {
        key: "AI_PROXY_KEY",
        label: "Relay key",
        secret: true,
        hint: "Only needed when the base URL is the Cloudways relay for Agent Router. Leave blank for Claude.",
        placeholder: "",
        group: "ai",
    },
    {
        key: "IMAGE_PROVIDER",
        label: "Image service",
        secret: false,
        hint: "Cloudflare Workers AI has a free daily allowance (about 20 images a day) and uses your existing Cloudflare account. Gemini makes better pictures but needs a paid Google key.",
        placeholder: "",
        group: "image",
        select: [
            { value: "cloudflare", label: "Cloudflare Workers AI (free allowance)" },
            { value: "gemini", label: "Google Gemini (paid key)" },
        ],
    },
    {
        key: "CF_AI_ACCOUNT_ID",
        label: "Cloudflare account ID",
        secret: false,
        hint: "From the Cloudflare dashboard home page. Already filled from the server when blank.",
        placeholder: "32 characters",
        group: "image",
        provider: "cloudflare",
    },
    {
        key: "CF_AI_TOKEN",
        label: "Cloudflare API token (Workers AI)",
        secret: true,
        hint: "Cloudflare dashboard > My Profile > API Tokens > Create Token > Workers AI template (Read). It only needs Workers AI.",
        placeholder: "",
        group: "image",
        provider: "cloudflare",
    },
    {
        key: "IMAGE_API_KEY",
        label: "Gemini API key",
        secret: true,
        hint: "From aistudio.google.com, on a key with billing switched on: Google makes no images on its free tier.",
        placeholder: "AIza...",
        group: "image",
        provider: "gemini",
    },
    {
        key: "IMAGE_DAILY_LIMIT",
        label: "Images per day (all businesses)",
        secret: false,
        hint: "A cap so the free Cloudflare allowance is never used up: 10,000 neurons a day covers about 170 images, so 100 leaves plenty spare. Resets at midnight UTC. Leave blank for 100.",
        placeholder: "100",
        group: "image",
    },
    {
        key: "IMAGE_MODEL",
        label: "Image model",
        secret: false,
        hint: "Leave blank for the service's default (FLUX.1 schnell on Cloudflare, gemini-3.1-flash-lite-image on Gemini).",
        placeholder: "",
        group: "image",
    },
];

const SOURCE_LABEL: Record<Field["source"], string> = {
    saved: "Saved here",
    env: "From the server environment",
    default: "Default",
    none: "Not set",
};

export default function Settings() {
    const [current, setCurrent] = useState<Current | null>(null);
    const [draft, setDraft] = useState<Record<Key, string>>({ AI_API_KEY: "", AI_BASE_URL: "", AI_MODEL: "", AI_PROXY_KEY: "", IMAGE_PROVIDER: "", IMAGE_API_KEY: "", IMAGE_MODEL: "", CF_AI_ACCOUNT_ID: "", CF_AI_TOKEN: "", IMAGE_DAILY_LIMIT: "" });
    const [loadError, setLoadError] = useState("");
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [notice, setNotice] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
    const [clearing, setClearing] = useState<Partial<Record<Key, boolean>>>({});

    useEffect(() => {
        fetch("/api/settings")
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .then((data: Current) => {
                setCurrent(data);
                // Plain fields start filled in, so an edit is an edit; secrets start blank.
                setDraft({
                    AI_API_KEY: "",
                    AI_BASE_URL: data.AI_BASE_URL.source === "saved" ? data.AI_BASE_URL.value : "",
                    AI_MODEL: data.AI_MODEL.source === "saved" ? data.AI_MODEL.value : "",
                    AI_PROXY_KEY: "",
                    IMAGE_PROVIDER: data.IMAGE_PROVIDER?.value || "cloudflare",
                    IMAGE_API_KEY: "",
                    IMAGE_MODEL: data.IMAGE_MODEL?.source === "saved" ? data.IMAGE_MODEL.value : "",
                    CF_AI_ACCOUNT_ID: data.CF_AI_ACCOUNT_ID?.source === "saved" ? data.CF_AI_ACCOUNT_ID.value : "",
                    CF_AI_TOKEN: "",
                    IMAGE_DAILY_LIMIT: data.IMAGE_DAILY_LIMIT?.source === "saved" ? data.IMAGE_DAILY_LIMIT.value : "",
                });
            })
            .catch((e) => setLoadError(e.message));
    }, []);

    // What a save sends: typed values, and empty strings for fields being cleared.
    // Secrets left blank are left out, so they stay as they are.
    function payload() {
        const out: Partial<Record<Key, string>> = {};
        for (const f of FIELDS) {
            if (clearing[f.key]) out[f.key] = "";
            else if (draft[f.key].trim()) out[f.key] = draft[f.key].trim();
            else if (!f.secret) out[f.key] = "";
        }
        return out;
    }

    async function save() {
        setSaving(true);
        setNotice(null);
        try {
            const res = await fetch("/api/settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload()),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
            setCurrent(data);
            setDraft((d) => ({ ...d, AI_API_KEY: "", AI_PROXY_KEY: "", IMAGE_API_KEY: "", CF_AI_TOKEN: "" }));
            setClearing({});
            setNotice({ tone: "ok", text: "Saved. Replies and posts use the new connection from now on." });
        } catch (e: any) {
            setNotice({ tone: "bad", text: e.message || "Could not save." });
        } finally {
            setSaving(false);
        }
    }

    async function test() {
        setTesting(true);
        setNotice(null);
        try {
            // Tests what is typed, falling back to what is saved for anything left blank.
            const body: Record<string, string> = {};
            for (const f of FIELDS) if (f.group === "ai" && draft[f.key].trim()) body[f.key] = draft[f.key].trim();
            const res = await fetch("/api/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!data.ok) throw new Error(data.error || "Test failed");
            setNotice({ tone: "ok", text: `Connection works (${data.model} via ${data.baseUrl}, ${data.ms} ms). The model replied: "${data.reply}"` });
        } catch (e: any) {
            setNotice({ tone: "bad", text: e.message || "Test failed." });
        } finally {
            setTesting(false);
        }
    }

    return (
        <div className="mx-auto max-w-3xl">
                <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
                    <h2 className="text-lg font-bold text-slate-900">AI connection</h2>
                    <p className="mt-1 text-sm text-slate-500">
                        The API key and model used to write review replies and auto posts. Saved values take effect at once; a blank field falls back to the server environment.
                    </p>

                    {loadError && (
                        <p className="mt-6 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">Could not load the settings: {loadError}</p>
                    )}

                    {current && (
                        <form
                            className="mt-8 space-y-6"
                            onSubmit={(e) => {
                                e.preventDefault();
                                save();
                            }}
                        >
                            {FIELDS.map((f, i) => {
                                const cur = current[f.key];
                                if (!cur) return null;
                                const chosenProvider = draft.IMAGE_PROVIDER || current.IMAGE_PROVIDER?.value || "cloudflare";
                                if (f.provider && f.provider !== chosenProvider) return null;
                                const heading = f.group === "image" && FIELDS[i - 1]?.group !== "image";
                                return (<React.Fragment key={f.key}>
                                    {heading && (
                                        <div className="border-t border-slate-100 pt-6">
                                            <h2 className="text-lg font-bold text-slate-900">Post images</h2>
                                            <p className="mt-1 text-sm text-slate-500">Pictures for Google posts, made to match each post's text. Cloudflare's allowance is free; Gemini costs a few pence an image.</p>
                                            {current.usage && (
                                                <p className="mt-2 inline-block rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">
                                                    Today: {current.usage.today} of {current.usage.limit} images used
                                                </p>
                                            )}
                                        </div>
                                    )}
                                    <div>
                                        <label htmlFor={f.key} className="mb-2 block text-sm font-semibold text-slate-700">
                                            {f.label}
                                        </label>
                                        {f.select ? (
                                            <select
                                                id={f.key}
                                                value={draft[f.key] || cur.value}
                                                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                                                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-[#EE314F] focus:bg-white"
                                            >
                                                {f.select.map((o) => (
                                                    <option key={o.value} value={o.value}>{o.label}</option>
                                                ))}
                                            </select>
                                        ) : (
                                        <input
                                            id={f.key}
                                            type={f.secret ? "password" : "text"}
                                            autoComplete="off"
                                            spellCheck={false}
                                            value={draft[f.key]}
                                            disabled={!!clearing[f.key]}
                                            onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                                            placeholder={f.secret && cur.set ? `Leave blank to keep ${cur.value}` : f.placeholder}
                                            className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-50"
                                        />
                                        )}
                                        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                                            <span>
                                                {f.hint}{" "}
                                                <span className="font-medium text-slate-700">
                                                    Now: {cur.set ? (f.secret ? cur.value : cur.value) : "not set"} ({SOURCE_LABEL[cur.source]}).
                                                </span>
                                            </span>
                                            {f.secret && cur.source === "saved" && (
                                                <label className="flex items-center gap-1.5 font-medium text-slate-600">
                                                    <input
                                                        type="checkbox"
                                                        checked={!!clearing[f.key]}
                                                        onChange={(e) => setClearing((c) => ({ ...c, [f.key]: e.target.checked }))}
                                                    />
                                                    Remove saved value
                                                </label>
                                            )}
                                        </div>
                                    </div>
                                </React.Fragment>);
                            })}

                            {notice && (
                                <p
                                    role="status"
                                    className={`rounded-xl border px-4 py-3 text-sm font-medium ${
                                        notice.tone === "ok" ? "border-emerald-100 bg-emerald-50 text-emerald-800" : "border-red-100 bg-red-50 text-red-700"
                                    }`}
                                >
                                    {notice.text}
                                </p>
                            )}

                            <div className="flex flex-wrap gap-3 pt-2">
                                <button
                                    type="submit"
                                    disabled={saving || testing}
                                    className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
                                >
                                    {saving ? "Saving" : "Save"}
                                </button>
                                <button
                                    type="button"
                                    onClick={test}
                                    disabled={saving || testing}
                                    className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                                >
                                    {testing ? "Testing" : "Test connection"}
                                </button>
                            </div>
                            <p className="text-xs text-slate-400">
                                Test connection sends one short message with the values above (or the saved ones where blank) and shows what comes back. It does not save anything.
                            </p>
                        </form>
                    )}
                </div>
        </div>
    );
}
