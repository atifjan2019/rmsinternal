/// <reference types="astro/client" />
export interface ReviewLink {
  id: string;
  slug: string;
  businessName: string;
  gmbReviewLink: string;
  logoUrl?: string;
  backgroundImageUrl?: string;
  createdAt: string;
}

export interface ReviewFeedback {
  id: string;
  linkId: string;
  name: string;
  email: string;
  comment: string;
  rating: number;
  createdAt: string;
}

/**
 * CLOUDFLARE D1 via HTTP API (Vercel Compatible)
 * This allows Vercel-hosted Astro to talk to Cloudflare D1.
 */

const CF_ACCOUNT_ID = import.meta.env.CF_ACCOUNT_ID || "cd15ad0da57162f7271e52faac2dda55";
const CF_DATABASE_ID = import.meta.env.CF_DATABASE_ID || "c5f98e64-c766-400f-a15c-b0e7288fe1ee";
const CF_API_TOKEN = import.meta.env.CF_API_TOKEN;

async function queryD1(sql: string, params: any[] = []) {
  if (!CF_ACCOUNT_ID) {
    throw new Error("Missing CF_ACCOUNT_ID environment variable.");
  }
  if (!CF_API_TOKEN) {
    throw new Error("Missing CF_API_TOKEN environment variable.");
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${CF_DATABASE_ID}/query`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql, params }),
    });

    const data = await response.json();

    if (!data.success) {
      console.error("D1 API Error Response:", JSON.stringify(data.errors));
      return { results: [], success: false, changes: 0 };
    }

    const resultObj = data.result && data.result[0] ? data.result[0] : { results: [], meta: {} };
    const changes = resultObj.meta?.changes || 0;

    if (!sql.toLowerCase().startsWith("select") && changes !== undefined) {
      console.log(`D1 Rows Affected: ${changes}`);
    }

    return {
      results: resultObj.results || [],
      success: true,
      changes: changes
    };
  } catch (error) {
    console.error("Critical D1 Connection Error:", error);
    throw error;
  }
}

export async function getAllLinks(): Promise<ReviewLink[]> {
  const { results } = await queryD1("SELECT * FROM links ORDER BY createdAt DESC");
  return results as ReviewLink[];
}

export async function getLinkBySlug(slug: string): Promise<ReviewLink | undefined> {
  const { results } = await queryD1("SELECT * FROM links WHERE slug = ? LIMIT 1", [slug]);
  return results[0] as ReviewLink | undefined;
}

export async function addLink(link: ReviewLink): Promise<ReviewLink> {
  const { success } = await queryD1(
    "INSERT INTO links (id, slug, businessName, gmbReviewLink, logoUrl, backgroundImageUrl, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      link.id,
      link.slug,
      link.businessName,
      link.gmbReviewLink,
      link.logoUrl || "",
      link.backgroundImageUrl || "",
      link.createdAt
    ]
  );

  if (!success) throw new Error("Failed to insert into D1");
  return link;
}

export async function deleteLink(id: string): Promise<boolean> {
  const { success, changes } = await queryD1("DELETE FROM links WHERE id = ?", [id]);
  return success && (changes ?? 0) > 0;
}

export async function updateLink(
  id: string,
  updates: Partial<Omit<ReviewLink, "id" | "createdAt">>
): Promise<boolean> {
  const fields = Object.keys(updates);
  if (fields.length === 0) return false;

  const setClause = fields.map((field) => `${field} = ?`).join(", ");
  const params = [...Object.values(updates), id];
  const sql = `UPDATE links SET ${setClause} WHERE id = ?`;

  const { success, changes } = await queryD1(sql, params);
  return success && (changes ?? 0) > 0;
}

export async function addFeedback(feedback: ReviewFeedback): Promise<ReviewFeedback> {
  const { success } = await queryD1(
    "INSERT INTO feedback (id, linkId, name, email, comment, rating, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      feedback.id,
      feedback.linkId,
      feedback.name,
      feedback.email,
      feedback.comment,
      feedback.rating,
      feedback.createdAt
    ]
  );

  if (!success) throw new Error("Failed to insert feedback into D1");
  return feedback;
}
