import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import { PageHeader, Section } from '@/components/marketing/sections';
import { BLOG_POSTS } from '@/lib/blog';

export const metadata: Metadata = {
  title: 'บล็อก',
  description:
    'บทความและเคล็ดลับเกี่ยวกับการขนย้าย การย้ายบ้าน ย้ายหอ และการเลือกใช้บริการขนส่งจาก MoveSook',
  alternates: { canonical: '/blog' },
};

const dateFmt = new Intl.DateTimeFormat('th-TH', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

export default function BlogIndexPage() {
  const posts = [...BLOG_POSTS].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));

  return (
    <>
      <PageHeader
        eyebrow="บล็อก"
        title="เคล็ดลับและข่าวสารการขนย้าย"
        description="รวมบทความที่ช่วยให้การขนย้ายของคุณง่ายขึ้น"
      />
      <Section className="max-w-4xl">
        <div className="grid gap-6 sm:grid-cols-2">
          {posts.map((post) => (
            <article
              key={post.slug}
              className="flex flex-col rounded-xl border bg-card p-6 shadow-sm transition-colors hover:border-primary"
            >
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <CalendarDays className="h-4 w-4" />
                <time dateTime={post.publishedAt}>{dateFmt.format(new Date(post.publishedAt))}</time>
              </p>
              <h2 className="mt-3 text-lg font-semibold leading-snug">
                <Link href={`/blog/${post.slug}`} className="hover:text-primary">
                  {post.title}
                </Link>
              </h2>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                {post.excerpt}
              </p>
              <Link
                href={`/blog/${post.slug}`}
                className="mt-4 text-sm font-semibold text-primary underline-offset-4 hover:underline"
              >
                อ่านต่อ →
              </Link>
            </article>
          ))}
        </div>
      </Section>
    </>
  );
}
