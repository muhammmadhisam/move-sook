import { z } from 'zod';
import { BlogStatusSchema } from '../enums';
import { PageQuery } from './pagination';

// slug = lowercase a-z/0-9 words joined by single hyphens (e.g. "moving-day-tips").
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Public list item (no body) — powers the marketing blog index + sitemap. */
export const BlogPostSummary = z.object({
  slug: z.string(),
  title: z.string(),
  excerpt: z.string(),
  coverImageUrl: z.string().nullable(),
  author: z.string(),
  publishedAt: z.string().datetime().nullable(),
});
export type BlogPostSummary = z.infer<typeof BlogPostSummary>;

/** Public full article (one published post by slug). */
export const BlogPostPublic = BlogPostSummary.extend({
  body: z.string(),
});
export type BlogPostPublic = z.infer<typeof BlogPostPublic>;

export const BlogPostListResponse = z.object({
  items: z.array(BlogPostSummary),
});
export type BlogPostListResponse = z.infer<typeof BlogPostListResponse>;

/** Admin DTO (every field, all statuses) — for the management table + editor. */
export const BlogPostDto = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  excerpt: z.string(),
  body: z.string(),
  coverImageUrl: z.string().nullable(),
  author: z.string(),
  status: BlogStatusSchema,
  publishedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type BlogPostDto = z.infer<typeof BlogPostDto>;

export const AdminListBlogQuery = PageQuery.extend({
  status: BlogStatusSchema.optional(),
});
export type AdminListBlogQuery = z.infer<typeof AdminListBlogQuery>;

export const AdminCreateBlogInput = z.object({
  slug: z.string().min(2).max(120).regex(SLUG_RE, 'slug ใช้ได้เฉพาะ a-z, 0-9 และ -'),
  title: z.string().min(2).max(200),
  excerpt: z.string().min(1).max(500),
  body: z.string().min(1),
  coverImageUrl: z.string().url().nullable().optional(),
  author: z.string().min(1).max(80).optional(),
  status: BlogStatusSchema.optional(),
});
export type AdminCreateBlogInput = z.infer<typeof AdminCreateBlogInput>;

export const AdminUpdateBlogInput = z.object({
  slug: z.string().min(2).max(120).regex(SLUG_RE, 'slug ใช้ได้เฉพาะ a-z, 0-9 และ -').optional(),
  title: z.string().min(2).max(200).optional(),
  excerpt: z.string().min(1).max(500).optional(),
  body: z.string().min(1).optional(),
  coverImageUrl: z.string().url().nullable().optional(),
  author: z.string().min(1).max(80).optional(),
  status: BlogStatusSchema.optional(),
});
export type AdminUpdateBlogInput = z.infer<typeof AdminUpdateBlogInput>;
