import React from "react";
import { LinkTabs } from "./ui";
import type { GbpLocation } from "./BusinessList";

/** The business's name and address, and the links to its three screens. */
export default function BusinessHeader({
    location,
    locationId,
    current,
    meta,
}: {
    location: GbpLocation;
    locationId: string;
    current: "reviews" | "auto-reply" | "posts";
    meta?: string;
}) {
    const base = `/business/${locationId}`;
    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-2xl font-bold text-slate-900">{location.title}</h2>
                <p className="mt-1 text-sm text-slate-500">
                    {[location.address, meta].filter(Boolean).join(" · ")}
                </p>
            </div>
            <LinkTabs
                current={current === "reviews" ? base : `${base}/${current}`}
                tabs={[
                    { href: base, label: "Reviews" },
                    { href: `${base}/auto-reply`, label: "Auto-reply" },
                    { href: `${base}/posts`, label: "Posts" },
                ]}
            />
        </div>
    );
}
