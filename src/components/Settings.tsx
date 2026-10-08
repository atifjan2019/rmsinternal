import React, { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardHeader, Notice, Spinner, btn, input, label } from "./ui";

/**
 * The settings page: one card per AI connection, each saved and tested on
 * its own, with a live "Connected" check for every connection that has a key.
 */

type Source = "saved" | "env" | "default" | "none";
type Field = { value: string; set: boolean; source: Source };
type ConnectionId = "anthropic" | "agentrouter" | "cloudflare" | "gemini";
interface Current {
    text: { active: "anthropic" | "agentrouter"; source: Source };
    pictures: { active: "cloudflare" | "gemini"; source: Source };
    connections: Record<ConnectionId, { configured: boolean; fields: Record<string, Field> }>;
    limits: { IMAGE_DAILY_LIMIT: Field; usage: { today: number; limit: number }; picturesReady: boolean };
}

interface FieldSpec {
    key: string;
    label: string;
    secret?: boolean;
    hint: string;
    placeholder?: string;
    optional?: boolean;
}

interface ConnectionSpec {
    id: ConnectionId;
    title: string;
    description: string;
    /** The setting that makes this connection the one in use, and its value. */
    activate: { key: "AI_PROVIDER" | "IMAGE_PROVIDER"; label: string };
    fields: FieldSpec[];
}

const CONNECTIONS: ConnectionSpec[] = [
    {
        id: "anthropic",
        title: "Claude (Anthropic)",
        description: "Anthropic's own API. Keys start with sk-ant- and come from console.anthropic.com.",
        activate: { key: "AI_PROVIDER", label: "Use for replies and posts" },
        fields: [
            { key: "ANTHROPIC_API_KEY", label: "API key", secret: true, hint: "Kept on the server and never shown again in full.", placeholder: "sk-ant-..." },
            { key: "ANTHROPIC_MODEL", label: "Model", hint: "Leave blank for claude-sonnet-5-5. claude-opus-5-5 writes better but costs more.", placeholder: "claude-sonnet-5-5", optional: true },
        ],
    },
    {
        id: "agentrouter",
        title: "Agent Router (OpenAI-compatible)",
        description: "Agent Router, or any service with an OpenAI-style chat completions endpoint.",
        activate: { key: "AI_PROVIDER", label: "Use for replies and posts" },
        fields: [
            { key: "AGENTROUTER_API_KEY", label: "API key", secret: true, hint: "Kept on the server and never shown again in full.", placeholder: "sk-..." },
            { key: "AGENTROUTER_BASE_URL", label: "API base URL", hint: "Leave blank for https://agentrouter.org/v1.", placeholder: "https://agentrouter.org/v1", optional: true },
            { key: "AGENTROUTER_MODEL", label: "Model", hint: "Leave blank for gpt-5.6-sol.", placeholder: "gpt-5.6-sol", optional: true },
            { key: "AGENTROUTER_PROXY_KEY", label: "Relay key", secret: true, hint: "Only when the base URL is the Cloudways relay. Leave blank otherwise.", optional: true },
        ],
    },
    {
        id: "cloudflare",
        title: "Cloudflare Workers AI",
        description: "Free daily allowance on your existing Cloudflare account. Draws with FLUX.1 schnell.",
        activate: { key: "IMAGE_PROVIDER", label: "Use for pictures" },
        fields: [
            { key: "CF_AI_ACCOUNT_ID", label: "Account ID", hint: "On the Cloudflare dashboard home page. Filled from the server when blank.", placeholder: "32 characters" },
            { key: "CF_AI_TOKEN", label: "API token", secret: true, hint: "My Profile > API Tokens > Create Token > Workers AI template. It only needs Workers AI." },
        ],
    },
    {
        id: "gemini",
        title: "Google Gemini",
        description: "Better pictures, a few pence each. Needs a key with billing on: Google's free tier makes no images.",
        activate: { key: "IMAGE_PROVIDER", label: "Use for pictures" },
        fields: [
            { key: "IMAGE_API_KEY", label: "API key", secret: true, hint: "From aistudio.google.com.", placeholder: "AIza..." },
            { key: "IMAGE_MODEL", label: "Model", hint: "Leave blank for gemini-3.1-flash-lite-image.", placeholder: "gemini-3.1-flash-lite-image", optional: true },
        ],
    },
];

const SOURCE_LABEL: Record<Source, string> = {
    saved: "saved here",
    env: "from the server environment",
    default: "default",
    none: "not set",
};

type Check = { state: "off" | "checking" | "ok" | "bad"; detail?: string };

async function api(method: "PUT" | "POST", body: Record<string, string>) {
    const res = await fetch("/api/settings", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
}

function StatusPill({ check, configured }: { check: Check; configured: boolean }) {
    if (!configured) return <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500">Not connected</span>;
    if (check.state === "ok") {
        return (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                Connected
            </span>
        );
    }
    if (check.state === "bad") {
        return (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden="true" />
                Not working
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500">
            <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Checking
        </span>
    );
}

function ConnectionCard({
    spec,
    data,
    inUse,
    onChange,
}: {
    spec: ConnectionSpec;
    data: Current["connections"][ConnectionId];
    inUse: boolean;
    onChange: (next: Current) => void;
}) {
    const blank = () => Object.fromEntries(spec.fields.map((f) => [f.key, ""]));
    const [draft, setDraft] = useState<Record<string, string>>(() => {
        const d = blank();
        for (const f of spec.fields) if (!f.secret && data.fields[f.key]?.source === "saved") d[f.key] = data.fields[f.key].value;
        return d;
    });
    const [clearing, setClearing] = useState<Record<string, boolean>>({});
    const [busy, setBusy] = useState<"" | "saving" | "testing" | "activating">("");
    const [notice, setNotice] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
    const [check, setCheck] = useState<Check>({ state: data.configured ? "checking" : "off" });
    const checkRun = useRef(0);

    // Checks the saved connection (no typed values), for the status pill.
    const runCheck = useCallback(async () => {
        const run = ++checkRun.current;
        setCheck({ state: "checking" });
        try {
            const r = await api("POST", { connection: spec.id });
            if (run !== checkRun.current) return;
            setCheck(r.ok ? { state: "ok", detail: r.detail } : { state: "bad", detail: r.error });
        } catch (e: any) {
            if (run === checkRun.current) setCheck({ state: "bad", detail: e.message });
        }
    }, [spec.id]);

    useEffect(() => {
        if (data.configured) runCheck();
        else setCheck({ state: "off" });
        // Only on mount and when the connection gains or loses its key.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data.configured]);

    const typed = () => {
        const out: Record<string, string> = {};
        for (const f of spec.fields) if (draft[f.key].trim()) out[f.key] = draft[f.key].trim();
        return out;
    };

    async function save(e: React.FormEvent) {
        e.preventDefault();
        setBusy("saving");
        setNotice(null);
        try {
            // Secrets left blank stay as they are; other blank fields go back to the server's value.
            const body: Record<string, string> = {};
            for (const f of spec.fields) {
                if (clearing[f.key]) body[f.key] = "";
                else if (draft[f.key].trim()) body[f.key] = draft[f.key].trim();
                else if (!f.secret) body[f.key] = "";
            }
            const next: Current = await api("PUT", body);
            onChange(next);
            setDraft((d) => {
                const out = { ...d };
                for (const f of spec.fields) if (f.secret) out[f.key] = "";
                return out;
            });
            setClearing({});
            setNotice({ tone: "ok", text: "Saved." });
            if (next.connections[spec.id].configured) runCheck();
        } catch (err: any) {
            setNotice({ tone: "bad", text: err.message || "Could not save." });
        } finally {
            setBusy("");
        }
    }

    async function test() {
        setBusy("testing");
        setNotice(null);
        try {
            const r = await api("POST", { connection: spec.id, ...typed() });
            if (!r.ok) throw new Error(r.error || "Test failed");
            setNotice({ tone: "ok", text: `Works (${r.ms} ms). ${r.detail || ""}` });
        } catch (err: any) {
            setNotice({ tone: "bad", text: err.message || "Test failed." });
        } finally {
            setBusy("");
        }
    }

    async function activate() {
        setBusy("activating");
        setNotice(null);
        try {
            onChange(await api("PUT", { [spec.activate.key]: spec.id }));
        } catch (err: any) {
            setNotice({ tone: "bad", text: err.message || "Could not switch." });
        } finally {
            setBusy("");
        }
    }

    return (
        <Card>
            <CardHeader
                title={spec.title}
                description={spec.description}
                actions={
                    <>
                        <StatusPill check={check} configured={data.configured} />
                        {inUse ? (
                            <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-bold text-white">In use</span>
                        ) : (
                            <button type="button" onClick={activate} disabled={!!busy || !data.configured} className={btn.small} title={data.configured ? "" : "Add a key first"}>
                                {busy === "activating" ? "Switching" : spec.activate.label}
                            </button>
                        )}
                    </>
                }
            />
            <form onSubmit={save}>
                <div className="grid gap-5 px-5 py-5 sm:grid-cols-2">
                    {spec.fields.map((f) => {
                        const cur = data.fields[f.key];
                        return (
                            <div key={f.key} className={f.key.endsWith("_URL") ? "sm:col-span-2" : ""}>
                                <label htmlFor={`${spec.id}-${f.key}`} className={label}>
                                    {f.label} {f.optional && <span className="font-normal text-slate-400">(optional)</span>}
                                </label>
                                <input
                                    id={`${spec.id}-${f.key}`}
                                    type={f.secret ? "password" : "text"}
                                    autoComplete="off"
                                    spellCheck={false}
                                    value={draft[f.key]}
                                    disabled={!!clearing[f.key]}
                                    onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                                    placeholder={f.secret && cur?.set ? `Leave blank to keep ${cur.value}` : f.placeholder || ""}
                                    className={input}
                                />
                                <p className="mt-1 text-xs text-slate-500">
                                    {f.hint}{" "}
                                    {cur && (
                                        <span className="text-slate-600">
                                            Now: {cur.set ? cur.value : "not set"}
                                            {cur.set ? ` (${SOURCE_LABEL[cur.source]})` : ""}.
                                        </span>
                                    )}
                                </p>
                                {f.secret && cur?.source === "saved" && (
                                    <label className="mt-1 flex items-center gap-1.5 text-xs font-medium text-slate-600">
                                        <input type="checkbox" checked={!!clearing[f.key]} onChange={(e) => setClearing((c) => ({ ...c, [f.key]: e.target.checked }))} />
                                        Remove the saved key
                                    </label>
                                )}
                            </div>
                        );
                    })}
                </div>
                {check.state === "bad" && check.detail && (
                    <div className="px-5 pb-4">
                        <Notice tone="bad">The saved connection is not working: {check.detail}</Notice>
                    </div>
                )}
                {notice && (
                    <div className="px-5 pb-4">
                        <Notice tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Notice>
                    </div>
                )}
                <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-5 py-4">
                    <button type="submit" disabled={!!busy} className={btn.primary}>{busy === "saving" ? "Saving" : "Save"}</button>
                    <button type="button" onClick={test} disabled={!!busy} className={btn.secondary}>{busy === "testing" ? "Testing" : "Test"}</button>
                    <span className="text-xs text-slate-400">Test uses what is typed above, or the saved values where blank. It saves nothing.</span>
                </div>
            </form>
        </Card>
    );
}

function LimitsCard({ data, onChange }: { data: Current["limits"]; onChange: (next: Current) => void }) {
    const [value, setValue] = useState(data.IMAGE_DAILY_LIMIT.source === "saved" ? data.IMAGE_DAILY_LIMIT.value : "");
    const [saving, setSaving] = useState(false);
    const [notice, setNotice] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

    async function save(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        setNotice(null);
        try {
            onChange(await api("PUT", { IMAGE_DAILY_LIMIT: value.trim() }));
            setNotice({ tone: "ok", text: "Saved." });
        } catch (err: any) {
            setNotice({ tone: "bad", text: err.message || "Could not save." });
        } finally {
            setSaving(false);
        }
    }

    const pct = data.usage.limit ? Math.min(100, Math.round((data.usage.today / data.usage.limit) * 100)) : 0;
    return (
        <Card>
            <CardHeader title="Picture allowance" description="A cap on generated pictures across all businesses, so a free allowance is never used up." />
            <form onSubmit={save} className="px-5 py-5">
                <div className="mb-5">
                    <div className="flex items-center justify-between text-sm">
                        <span className="font-semibold text-slate-700">Today</span>
                        <span className="text-slate-600">{data.usage.today} of {data.usage.limit} pictures</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-full rounded-full ${pct >= 90 ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-1.5 text-xs text-slate-500">Resets at midnight UTC.</p>
                </div>
                <div className="sm:w-1/2">
                    <label htmlFor="IMAGE_DAILY_LIMIT" className={label}>Pictures per day</label>
                    <input id="IMAGE_DAILY_LIMIT" type="text" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} placeholder="100" className={input} />
                    <p className="mt-1 text-xs text-slate-500">
                        Cloudflare's free 10,000 neurons a day cover about 170 pictures, so 100 leaves plenty spare. Leave blank for 100. Now: {data.IMAGE_DAILY_LIMIT.value} ({SOURCE_LABEL[data.IMAGE_DAILY_LIMIT.source]}).
                    </p>
                </div>
                {notice && <div className="mt-4"><Notice tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Notice></div>}
                <div className="mt-5">
                    <button type="submit" disabled={saving} className={btn.primary}>{saving ? "Saving" : "Save"}</button>
                </div>
            </form>
        </Card>
    );
}

export default function Settings() {
    const [current, setCurrent] = useState<Current | null>(null);
    const [loadError, setLoadError] = useState("");

    useEffect(() => {
        fetch("/api/settings")
            .then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(new Error(d.error || `HTTP ${r.status}`)))))
            .then(setCurrent)
            .catch((e) => setLoadError(e.message));
    }, []);

    if (loadError) return <Notice tone="bad">Could not load the settings: {loadError}</Notice>;
    if (!current) return <Spinner />;

    const text = CONNECTIONS.filter((c) => c.activate.key === "AI_PROVIDER");
    const pictures = CONNECTIONS.filter((c) => c.activate.key === "IMAGE_PROVIDER");
    const activeOf = (c: ConnectionSpec) => (c.activate.key === "AI_PROVIDER" ? current.text.active : current.pictures.active) === c.id;
    const textReady = current.connections[current.text.active].configured;

    return (
        <div className="mx-auto max-w-4xl space-y-10">
            <section className="space-y-4">
                <div>
                    <h2 className="text-lg font-bold text-slate-900">Writing replies and posts</h2>
                    <p className="mt-0.5 text-sm text-slate-500">Two separate connections. The one marked In use writes every review reply and post.</p>
                </div>
                {!textReady && <Notice tone="warn">No text AI is connected yet, so replies and posts cannot be written. Add a key below.</Notice>}
                {text.map((c) => (
                    <ConnectionCard key={c.id} spec={c} data={current.connections[c.id]} inUse={activeOf(c)} onChange={setCurrent} />
                ))}
            </section>

            <section className="space-y-4">
                <div>
                    <h2 className="text-lg font-bold text-slate-900">Pictures for posts</h2>
                    <p className="mt-0.5 text-sm text-slate-500">Each post gets a picture drawn to match its text, by the service marked In use.</p>
                </div>
                {!current.limits.picturesReady && <Notice tone="warn">No picture service is connected, so posts go out without a picture unless one is uploaded.</Notice>}
                {pictures.map((c) => (
                    <ConnectionCard key={c.id} spec={c} data={current.connections[c.id]} inUse={activeOf(c)} onChange={setCurrent} />
                ))}
                <LimitsCard data={current.limits} onChange={setCurrent} />
            </section>
        </div>
    );
}
