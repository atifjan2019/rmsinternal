export interface ReviewLink {
  id: string;
  slug: string;
  businessName: string;
  gmbReviewLink: string;
  logoUrl?: string;
  backgroundImageUrl?: string;
  createdAt: string;
}

// Helper to get KV binding
// In Astro + Cloudflare, KV is available via the request context or locals
const getKV = (runtime: any) => {
  return runtime?.env?.LINKS || runtime?.env?.SESSION;
};

export async function getAllLinks(runtime?: any): Promise<ReviewLink[]> {
  const KV = getKV(runtime);
  if (KV) {
    const data = await KV.get("all_links");
    return data ? JSON.parse(data) : [];
  }
  return (globalThis as any)._links || [];
}

export async function getLinkBySlug(slug: string, runtime?: any): Promise<ReviewLink | undefined> {
  const links = await getAllLinks(runtime);
  return links.find((link) => link.slug === slug);
}

export async function addLink(link: ReviewLink, runtime?: any): Promise<ReviewLink> {
  const links = await getAllLinks(runtime);
  links.push(link);

  const KV = getKV(runtime);
  if (KV) {
    await KV.put("all_links", JSON.stringify(links));
  } else {
    (globalThis as any)._links = links;
  }
  return link;
}

export async function deleteLink(id: string, runtime?: any): Promise<boolean> {
  let links = await getAllLinks(runtime);
  const initialLength = links.length;
  links = links.filter((link) => link.id !== id);

  if (links.length !== initialLength) {
    const KV = getKV(runtime);
    if (KV) {
      await KV.put("all_links", JSON.stringify(links));
    } else {
      (globalThis as any)._links = links;
    }
    return true;
  }
  return false;
}
