import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarDays, ArrowRight } from 'lucide-react';
import { PreviewableImage } from '@movesook/ui';
import { PageHeader, Section } from '@/components/marketing/sections';
import { getBlogPosts } from '@/lib/blog';

// ISR: re-fetch published posts at most every 5 minutes so admin edits go live
// without a redeploy.
export const revalidate = 300;

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

export default async function BlogIndexPage() {
  const posts = await getBlogPosts();

  return (
    <>
      <PageHeader
        eyebrow="บล็อก"
        title="เคล็ดลับและข่าวสารการขนย้าย"
        description="รวมบทความที่ช่วยให้การขนย้ายของคุณง่ายขึ้น"
      />
      <Section className="max-w-4xl">
        {posts.length === 0 ? (
          <p className="text-center text-muted-foreground">ยังไม่มีบทความในขณะนี้</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2">
            {posts.map((post) => (
              <article
                key={post.slug}
                className="flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition-colors hover:border-primary"
              >
                {post.coverImageUrl && (
                  <Link href={`/blog/${post.slug}`} className="block">
                    <PreviewableImage
                      src={post.coverImageUrl}
                      alt={post.title}
                      className="h-44 w-full object-cover"
                    />
                  </Link>
                )}
                <div className="flex flex-1 flex-col p-6">
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <CalendarDays className="h-4 w-4" />
                    {post.publishedAt && (
                      <time dateTime={post.publishedAt}>
                        {dateFmt.format(new Date(post.publishedAt))}
                      </time>
                    )}
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
                    className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline"
                  >
                    อ่านต่อ
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
