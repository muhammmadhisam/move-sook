'use client';

import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { BlogPostDto } from '@movesook/shared';
import { api } from '@/lib/api';
import { BlogForm } from '@/components/blog-form';

export default function EditBlogPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const post = useQuery({
    queryKey: ['admin', 'blog', id],
    queryFn: async (): Promise<BlogPostDto> => {
      const res = await api.admin.blog[':id'].$get({ param: { id } });
      if (!res.ok) throw new Error('ไม่พบบทความ');
      return (await res.json()) as BlogPostDto;
    },
  });

  if (post.isLoading) return <p className="text-muted-foreground">กำลังโหลด…</p>;
  if (post.error || !post.data)
    return <p className="text-destructive">ไม่พบบทความนี้</p>;

  return <BlogForm post={post.data} />;
}
