'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  useConfirm,
} from '@movesook/ui';
import {
  BLOG_STATUS_LABEL,
  BlogStatusSchema,
  type BlogPostDto,
  type BlogStatus,
} from '@movesook/shared';
import { api } from '@/lib/api';
import { ImageUpload } from '@/components/image-upload';
import { LexicalEditor } from '@/components/lexical-editor';

/** Turn a title into a URL-safe slug (keeps Thai out — slugs are ASCII only). */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function BlogForm({ post }: { post?: BlogPostDto }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const isEdit = !!post;

  const [title, setTitle] = useState(post?.title ?? '');
  // In create mode the slug auto-tracks the title until the user edits it by hand.
  const [slug, setSlug] = useState(post?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(isEdit);
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? '');
  const [author, setAuthor] = useState(post?.author ?? 'ทีม MoveSook');
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(post?.coverImageUrl ?? null);
  const [body, setBody] = useState(post?.body ?? '');
  const [status, setStatus] = useState<BlogStatus>(post?.status ?? 'DRAFT');
  const [error, setError] = useState<string | null>(null);

  const onTitleChange = (v: string) => {
    setTitle(v);
    if (!slugTouched) setSlug(slugify(v));
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        slug: slug.trim(),
        title: title.trim(),
        excerpt: excerpt.trim(),
        body,
        coverImageUrl,
        author: author.trim(),
        status,
      };
      const res = isEdit
        ? await api.admin.blog[':id'].$patch({ param: { id: post!.id }, json: payload })
        : await api.admin.blog.$post({ json: payload });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(b?.error ?? 'บันทึกไม่สำเร็จ');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'blog'] });
      router.push('/blog');
    },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const res = await api.admin.blog[':id'].$delete({ param: { id: post!.id } });
      if (!res.ok) throw new Error('ลบไม่สำเร็จ');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'blog'] });
      router.push('/blog');
    },
    onError: (e: Error) => setError(e.message),
  });

  const onSave = () => {
    setError(null);
    if (title.trim().length < 2) return setError('กรอกหัวข้อบทความ');
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug.trim()))
      return setError('slug ใช้ได้เฉพาะ a-z, 0-9 และ - (เช่น moving-day-tips)');
    if (excerpt.trim().length < 1) return setError('กรอกคำโปรย');
    if (body.trim().length < 1) return setError('กรอกเนื้อหาบทความ');
    save.mutate();
  };

  const onDelete = async () => {
    const ok = await confirm({
      title: 'ลบบทความนี้?',
      description: 'การลบไม่สามารถย้อนกลับได้',
      confirmText: 'ลบ',
      destructive: true,
    });
    if (ok) remove.mutate();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{isEdit ? 'แก้ไขบทความ' : 'เขียนบทความใหม่'}</h1>
        <div className="flex items-center gap-2">
          {isEdit && (
            <Button variant="outline" className="text-destructive" disabled={remove.isPending} onClick={onDelete}>
              ลบบทความ
            </Button>
          )}
          <Button variant="outline" onClick={() => router.push('/blog')} disabled={save.isPending}>
            ยกเลิก
          </Button>
          <Button onClick={onSave} disabled={save.isPending}>
            {save.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>เนื้อหา</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="title">หัวข้อ *</Label>
                <Input id="title" value={title} onChange={(e) => onTitleChange(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="slug">Slug (URL) *</Label>
                <Input
                  id="slug"
                  value={slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setSlug(e.target.value);
                  }}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">/blog/{slug || 'your-slug'}</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="excerpt">คำโปรย (สรุปสั้น) *</Label>
                <Textarea
                  id="excerpt"
                  rows={2}
                  value={excerpt}
                  onChange={(e) => setExcerpt(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>เนื้อหา *</Label>
                <LexicalEditor
                  value={body}
                  onChange={setBody}
                  placeholder="เขียนเนื้อหาบทความ… จัดรูปแบบด้วยแถบเครื่องมือ หรือพิมพ์แบบ Markdown (## หัวข้อ, **ตัวหนา**, - รายการ)"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>ตัวอย่าง (Preview)</CardTitle>
            </CardHeader>
            <CardContent>
              {body.trim() ? (
                <div className="prose prose-sm max-w-none [&_a]:text-primary [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:font-semibold [&_li]:ml-4 [&_li]:list-disc [&_p]:mt-3 [&_p]:leading-relaxed [&_ul]:mt-3">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">พิมพ์เนื้อหาเพื่อดูตัวอย่าง</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>การเผยแพร่</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label>สถานะ</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as BlogStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BlogStatusSchema.options.map((s) => (
                      <SelectItem key={s} value={s}>
                        {BLOG_STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {status === 'PUBLISHED' ? 'แสดงบนหน้าเว็บสาธารณะ' : 'ร่าง — ซ่อนจากผู้เข้าชม'}
                </p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="author">ผู้เขียน</Label>
                <Input id="author" value={author} onChange={(e) => setAuthor(e.target.value)} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>รูปภาพปก</CardTitle>
            </CardHeader>
            <CardContent>
              <ImageUpload
                folder="blog"
                value={coverImageUrl}
                onUploaded={(url) => setCoverImageUrl(url)}
                label={coverImageUrl ? 'เปลี่ยนรูปปก' : 'อัปโหลดรูปปก'}
              />
              {coverImageUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 text-destructive"
                  onClick={() => setCoverImageUrl(null)}
                >
                  ลบรูปปก
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
