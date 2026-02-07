export interface ReviewLink {
  id: string;
  slug: string;
  businessName: string;
  gmbReviewLink: string;
  logoUrl?: string;
  backgroundImageUrl?: string;
  createdAt: string;
}

// Cloudflare D1 Helper
// The 'DB' binding must be configured in wrangler.jsonc or the Cloudflare dashboard.
const getDB = (runtime: any) => {
  return runtime?.env?.DB;
};

export async function getAllLinks(runtime: any): Promise<ReviewLink[]> {
  const DB = getDB(runtime);
  if (!DB) return [];

  const { results } = await DB.prepare(
    "SELECT * FROM links ORDER BY createdAt DESC"
  ).all();

  return results as unknown as ReviewLink[];
}

export async function getLinkBySlug(slug: string, runtime: any): Promise<ReviewLink | undefined> {
  const DB = getDB(runtime);
  if (!DB) return undefined;

  const result = await DB.prepare(
    "SELECT * FROM links WHERE slug = ?"
  ).bind(slug).first();

  return result as unknown as ReviewLink || undefined;
}

export async function addLink(link: ReviewLink, runtime: any): Promise<ReviewLink> {
  const DB = getDB(runtime);
  if (!DB) throw new Error("Database binding not found");

  await DB.prepare(
    "INSERT INTO links (id, slug, businessName, gmbReviewLink, logoUrl, backgroundImageUrl, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(
    link.id,
    link.slug,
    link.businessName,
    link.gmbReviewLink,
    link.logoUrl || "",
    link.backgroundImageUrl || "",
    link.createdAt
  ).run();

  return link;
}

export async function deleteLink(id: string, runtime: any): Promise<boolean> {
  const DB = getDB(runtime);
  if (!DB) return false;

  const result = await DB.prepare(
    "DELETE FROM links WHERE id = ?"
  ).bind(id).run();

  return result.success;
}
