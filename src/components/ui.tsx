import React, { useState } from "react";

/**
 * The few building blocks every admin screen is made of, so they all look
 * the same: one card style, one set of buttons, one way to show a message,
 * and one way to confirm something destructive (no browser alert boxes).
 */

export const btn = {
    primary:
        "inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50",
    dark: "inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50",
    secondary:
        "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50",
    ghost: "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50",
    danger: "inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50",
    small: "inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50",
};

export const input =
    "w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:bg-slate-50 disabled:opacity-60";

export const label = "mb-1.5 block text-sm font-semibold text-slate-700";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return <div className={`rounded-xl border border-slate-200 bg-white ${className}`}>{children}</div>;
}

export function CardHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
    return (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <div className="min-w-0">
                <h2 className="text-base font-bold text-slate-900">{title}</h2>
                {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
            </div>
            {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
    );
}

export function Notice({ tone, children, onClose }: { tone: "ok" | "bad" | "info" | "warn"; children: React.ReactNode; onClose?: () => void }) {
    const tones = {
        ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
        bad: "border-red-200 bg-red-50 text-red-700",
        info: "border-slate-200 bg-slate-50 text-slate-700",
        warn: "border-amber-200 bg-amber-50 text-amber-800",
    };
    return (
        <div role={tone === "bad" ? "alert" : "status"} className={`flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm font-medium ${tones[tone]}`}>
            <div className="min-w-0 break-words">{children}</div>
            {onClose && (
                <button type="button" onClick={onClose} aria-label="Dismiss" className="shrink-0 opacity-60 hover:opacity-100">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
            )}
        </div>
    );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
    return (
        <div role="status" className="flex items-center justify-center gap-3 py-16 text-sm text-slate-500">
            <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            {label}
        </div>
    );
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: React.ReactNode }) {
    return (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
            <h3 className="text-base font-bold text-slate-900">{title}</h3>
            {text && <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{text}</p>}
            {action && <div className="mt-5">{action}</div>}
        </div>
    );
}

export function Stars({ rating, className = "h-4 w-4" }: { rating: number; className?: string }) {
    return (
        <span className="inline-flex gap-0.5" aria-label={`${rating} out of 5 stars`}>
            {[1, 2, 3, 4, 5].map((i) => (
                <svg key={i} className={`${className} ${i <= rating ? "text-amber-400" : "text-slate-200"}`} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
            ))}
        </span>
    );
}

/**
 * A destructive button that asks on the spot: the first press turns it into
 * "Sure? Yes / No", so a slip of the mouse does nothing and no browser alert
 * box appears.
 */
export function ConfirmButton({
    children,
    confirmLabel = "Yes, do it",
    onConfirm,
    disabled,
    className = btn.danger,
}: {
    children: React.ReactNode;
    confirmLabel?: string;
    onConfirm: () => void | Promise<void>;
    disabled?: boolean;
    className?: string;
}) {
    const [asking, setAsking] = useState(false);
    if (asking) {
        return (
            <span className="inline-flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-slate-700">Are you sure?</span>
                <button
                    type="button"
                    className={btn.danger}
                    onClick={async () => {
                        setAsking(false);
                        await onConfirm();
                    }}
                >
                    {confirmLabel}
                </button>
                <button type="button" className={btn.ghost} onClick={() => setAsking(false)}>
                    No
                </button>
            </span>
        );
    }
    return (
        <button type="button" className={className} disabled={disabled} onClick={() => setAsking(true)}>
            {children}
        </button>
    );
}

/** Tabs that are real links, so each view has its own address and the Back button works. */
export function LinkTabs({ tabs, current }: { tabs: { href: string; label: string; count?: number }[]; current: string }) {
    return (
        <nav className="flex gap-1 overflow-x-auto border-b border-slate-200" aria-label="Sections">
            {tabs.map((t) => {
                const active = t.href === current;
                return (
                    <a
                        key={t.href}
                        href={t.href}
                        aria-current={active ? "page" : undefined}
                        className={`-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold ${
                            active ? "border-primary text-slate-900" : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
                        }`}
                    >
                        {t.label}
                        {typeof t.count === "number" && (
                            <span className={`rounded-full px-2 py-0.5 text-xs ${active ? "bg-primary/10 text-primary" : "bg-slate-100 text-slate-500"}`}>{t.count}</span>
                        )}
                    </a>
                );
            })}
        </nav>
    );
}
