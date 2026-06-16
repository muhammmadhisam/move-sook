import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CalendarDays, ChevronLeft } from 'lucide-react';
import { PreviewableImage } from '@movesook/ui';
import { Prose } from '@/components/marketing/sections';
import { Markdown } from '@/components/marketing/markdown';
import { JsonLd } from '@/components/marketing/json-ld';
import { getBlogPost } from '@/lib/blog';
import { SITE } from '@/lib/site';

// ISR: published article content refreshes at most every 5 minutes.
export const revalidate = 300;

type Params = { slug: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getBlogPost(slug);
  if (!post) return { title: 'ไม่พบบทความ' };
  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: 'article',
      title: post.title,
      description: post.excerpt,
      ...(post.publishedAt ? { publishedTime: post.publishedAt } : {}),
      authors: [post.author],
      url: `${SITE.url}/blog/${post.slug}`,
      ...(post.coverImageUrl ? { images: [{ url: post.coverImageUrl }] } : {}),
    },
  };
}

const dateFmt = new Intl.DateTimeFormat('th-TH', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

export default async function BlogPostPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const post = await getBlogPost(slug);
  if (!post) notFound();

  return (
    <article>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          headline: post.title,
          description: post.excerpt,
          ...(post.publishedAt ? { datePublished: post.publishedAt } : {}),
          ...(post.coverImageUrl ? { image: post.coverImageUrl } : {}),
          author: { '@type': 'Organization', name: post.author },
          publisher: { '@type': 'Organization', name: SITE.name, url: SITE.url },
          mainEntityOfPage: `${SITE.url}/blog/${post.slug}`,
        }}
      />

      <header className="bg-navy-900 text-white">
        <div className="mx-auto max-w-3xl px-4 py-14">
          <Link
            href="/blog"
            className="inline-flex items-center gap-1 text-sm text-navy-200 hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" /> กลับไปที่บล็อก
          </Link>
          <h1 className="mt-4 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            {post.title}
          </h1>
          <p className="mt-4 flex items-center gap-2 text-sm text-navy-200">
            <CalendarDays className="h-4 w-4" />
            {post.publishedAt && (
              <time dateTime={post.publishedAt}>{dateFmt.format(new Date(post.publishedAt))}</time>
            )}
            <span aria-hidden>·</span>
            <span>{post.author}</span>
          </p>
        </div>
      </header>

      {post.coverImageUrl && (
        <div className="mx-auto max-w-3xl px-4">
          <PreviewableImage
            src={post.coverImageUrl}
            alt={post.title}
            className="-mt-8 w-full rounded-xl border object-cover shadow-sm"
          />
        </div>
      )}

      <Prose>
        <Markdown>{post.body}</Markdown>
      </Prose>
    </article>
  );
}
