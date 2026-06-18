'use client';

import { useRef, useState } from 'react';
import { FileText, X } from 'lucide-react';
import { Button, PreviewableImage } from '@movesook/ui';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

/** One already-uploaded file (matches the API's LedgerAttachment input shape). */
export interface Attachment {
  url: string;
  name: string;
  mimeType: string;
}

interface AttachmentUploadProps {
  value: Attachment[];
  onChange: (next: Attachment[]) => void;
  /** Storage bucket (context) the files are filed under, e.g. `ledger`. */
  folder?: string;
}

const isImage = (mimeType: string) => mimeType.startsWith('image/');

/** Upload one or more receipt images/documents and manage the attached list. */
export function AttachmentUpload({ value, onChange, folder = 'ledger' }: AttachmentUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    const uploaded: Attachment[] = [];
    try {
      for (const file of files) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('folder', folder);
        const res = await fetch(`${API_BASE}/uploads`, {
          method: 'POST',
          body: fd,
          credentials: 'include',
        });
        if (!res.ok) {
          const b = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(b?.error ?? `อัปโหลด "${file.name}" ไม่สำเร็จ`);
        }
        const data = (await res.json()) as { url: string; name: string; type: string };
        uploaded.push({ url: data.url, name: data.name, mimeType: data.type });
      }
      onChange([...value, ...uploaded]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const removeAt = (idx: number) => onChange(value.filter((_, i) => i !== idx));

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
        className="hidden"
        onChange={onPick}
      />

      {value.length > 0 && (
        <ul className="space-y-2">
          {value.map((a, i) => (
            <li key={`${a.url}-${i}`} className="flex items-center gap-3 rounded-lg border p-2">
              {isImage(a.mimeType) ? (
                <PreviewableImage
                  src={a.url}
                  alt={a.name}
                  className="h-12 w-12 shrink-0 rounded object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-muted">
                  <FileText className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 truncate text-sm text-primary hover:underline"
              >
                {a.name}
              </a>
              <button
                type="button"
                aria-label="ลบไฟล์แนบ"
                onClick={() => removeAt(i)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? 'กำลังอัปโหลด…' : 'แนบรูป/เอกสาร'}
      </Button>
      <p className="text-xs text-muted-foreground">รองรับรูปภาพ และเอกสาร PDF/Word/Excel</p>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
