import React from "react";
import { Notice, Spinner } from "./ui";
import BusinessHeader from "./BusinessHeader";
import PostsManager from "./PostsManager";
import { useBusiness } from "./useBusiness";

/** A business's posts page: its settings, its pictures, and the posts themselves. */
export default function BusinessPosts({ locationId }: { locationId: string }) {
    const { location, loading, error } = useBusiness(locationId);
    if (loading) return <Spinner />;
    if (!location) {
        return (
            <Notice tone="bad">
                {error || "Business not found."} <a href="/reviews" className="font-bold underline">Back to Google Reviews</a>
            </Notice>
        );
    }
    return (
        <div className="space-y-6">
            <BusinessHeader location={location} locationId={locationId} current="posts" />
            <PostsManager locations={[location]} singleLocation={location} />
        </div>
    );
}
