export interface ReviewLink {
  id: string;
  slug: string;
  businessName: string;
  gmbReviewLink: string;
  logoUrl?: string;
  backgroundImageUrl?: string;
  createdAt: string;
}

/**
 * CLOUDFLARE D1 via HTTP API (Vercel Compatible)
 * This allows Vercel-hosted Astro to talk to Cloudflare D1.
 */

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_DATABASE_ID = process.env.CF_DATABASE_ID || "c5f98e64-c766-400f-a15c-b0e7288fe1ee";
const CF_API_TOKEN = process.env.CF_API_TOKEN;

async function queryD1(sql: string, params: any[] = []) {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
    console.error("Missing Cloudflare Environment Variables (CF_ACCOUNT_ID or CF_API_TOKEN)");
    return { results: [], success: false };
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${CF_DATABASE_ID}/query`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sql,
        params,
      }),
    });

    const data = await response.json();
    if (!data.success) {
      console.error("D1 API Error:", data.errors);
      return { results: [], success: false };
    }

    return {
      results: data.result[0].results || [],
      success: true
    };
  } catch (error) {
    console.error("Fetch Error for D1:", error);
    return { results: [], success: false };
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
  const { success } = await queryD1("DELETE FROM links WHERE id = ?", [id]);
  return success;
}
