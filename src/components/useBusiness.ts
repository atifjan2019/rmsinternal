import { useEffect, useState } from "react";
import type { GbpLocation, GoogleStatus } from "./BusinessList";

/** Loads one business (by the id in the address) and the Google connection state. */
export function useBusiness(locationId: string) {
    const [status, setStatus] = useState<GoogleStatus | null>(null);
    const [location, setLocation] = useState<GbpLocation | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            try {
                const [statusRes, locRes] = await Promise.all([fetch("/api/google/status"), fetch("/api/google/locations")]);
                setStatus(await statusRes.json());
                const locData = await locRes.json();
                if (!locRes.ok) throw new Error(locData.error || "Failed to load the business");
                const loc = (locData.locations || []).find((l: GbpLocation) => l.name.endsWith(`/locations/${locationId}`));
                if (!loc) throw new Error("Business not found. Refresh the list from Google on the Google Reviews page.");
                setLocation(loc);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        })();
    }, [locationId]);

    return { status, location, loading, error };
}
