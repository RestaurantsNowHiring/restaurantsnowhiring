export const BLOG_CATEGORIES = [
  "Salary Guide",
  "Career Guide",
  "Interview Tips",
  "Job Search",
  "Front of House",
  "Back of House",
  "Management",
  "Employer Tips",
] as const;

export type BlogCategory = (typeof BLOG_CATEGORIES)[number];

export type BlogPost = {
  id: string;
  title: string | null;
  slug: string | null;
  category: string | null;
  excerpt: string | null;
  content: string | null;
  status: string | null;
  meta_title: string | null;
  meta_description: string | null;
  created_at: string;
  updated_at: string;
};

export type BlogPostInput = {
  title: string;
  slug: string;
  category: string;
  excerpt: string;
  content: string;
  meta_title: string;
  meta_description: string;
};

export function normalizeBlogPostInput(input: Partial<BlogPostInput>) {
  return {
    title: (input.title ?? "").trim(),
    slug: (input.slug ?? "").trim().toLowerCase(),
    category: (input.category ?? "").trim(),
    excerpt: (input.excerpt ?? "").trim(),
    content: (input.content ?? "").trim(),
    meta_title: (input.meta_title ?? "").trim(),
    meta_description: (input.meta_description ?? "").trim(),
  } satisfies BlogPostInput;
}

export function validateBlogPostInput(input: BlogPostInput) {
  if (!input.title) return "Title is required.";
  if (!input.slug) return "Slug is required.";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug)) {
    return "Slug must use lowercase letters, numbers, and hyphens only.";
  }
  if (!BLOG_CATEGORIES.includes(input.category as BlogCategory)) {
    return "Choose a valid category.";
  }
  return null;
}
