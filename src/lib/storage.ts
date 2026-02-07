import fs from "fs";
import path from "path";

export interface ReviewLink {
  id: string;
  slug: string;
  businessName: string;
  gmbReviewLink: string;
  logoUrl?: string;
  backgroundImageUrl?: string;
  createdAt: string;
}

const DATA_FILE = path.join(process.cwd(), "data", "links.json");

function ensureDataFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));
  }
}

export function getAllLinks(): ReviewLink[] {
  ensureDataFile();
  const data = fs.readFileSync(DATA_FILE, "utf-8");
  return JSON.parse(data);
}

export function getLinkBySlug(slug: string): ReviewLink | undefined {
  const links = getAllLinks();
  return links.find((link) => link.slug === slug);
}

export function getLinkById(id: string): ReviewLink | undefined {
  const links = getAllLinks();
  return links.find((link) => link.id === id);
}

export function addLink(link: ReviewLink): ReviewLink {
  const links = getAllLinks();
  links.push(link);
  fs.writeFileSync(DATA_FILE, JSON.stringify(links, null, 2));
  return link;
}

export function deleteLink(id: string): boolean {
  const links = getAllLinks();
  const filtered = links.filter((link) => link.id !== id);
  if (filtered.length === links.length) return false;
  fs.writeFileSync(DATA_FILE, JSON.stringify(filtered, null, 2));
  return true;
}

export function updateLink(
  id: string,
  updates: Partial<Omit<ReviewLink, "id" | "createdAt">>
): ReviewLink | null {
  const links = getAllLinks();
  const index = links.findIndex((link) => link.id === id);
  if (index === -1) return null;
  links[index] = { ...links[index], ...updates };
  fs.writeFileSync(DATA_FILE, JSON.stringify(links, null, 2));
  return links[index];
}
