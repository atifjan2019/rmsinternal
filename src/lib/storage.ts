export interface ReviewLink {
  id: string;
  slug: string;
  businessName: string;
  gmbReviewLink: string;
  logoUrl?: string;
  backgroundImageUrl?: string;
  createdAt: string;
}

// In-memory fallback for serverless environments (Cloudflare Pages)
// Note: This will reset on every function cold start.
// For production, please configure a database (Cloudflare D1, KV, or Supabase).
let links: ReviewLink[] = [];

export function getAllLinks(): ReviewLink[] {
  return links;
}

export function getLinkBySlug(slug: string): ReviewLink | undefined {
  return links.find((link) => link.slug === slug);
}

export function getLinkById(id: string): ReviewLink | undefined {
  return links.find((link) => link.id === id);
}

export function addLink(link: ReviewLink): ReviewLink {
  links.push(link);
  return link;
}

export function deleteLink(id: string): boolean {
  const initialLength = links.length;
  links = links.filter((link) => link.id !== id);
  return links.length !== initialLength;
}

export function updateLink(
  id: string,
  updates: Partial<Omit<ReviewLink, "id" | "createdAt">>
): ReviewLink | null {
  const index = links.findIndex((link) => link.id === id);
  if (index === -1) return null;
  links[index] = { ...links[index], ...updates };
  return links[index];
}
