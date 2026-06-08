'use client';

import { useRef, useState } from 'react';
import { Button, PreviewableImage } from '@movesook/ui';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

interface ImageUploadProps {
  /** Current image URL to preview (single-image mode). */
  value?: string | null;
  onUploaded: (url: string) => void;
  label?: string;
  /** Hide the inline preview (e.g. when the parent renders a gallery). */
  hidePreview?: boolean;
}

/** Pick/take a photo, upload to the API, and report back the stored URL. */
export function ImageUpload({ value, onUploaded, label = 'อัปโหลดรูป', hidePreview }: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${API_BASE}/uploads`, {
        method: 'POST',
        body: fd,
        credentials: 'include',
      });
      if (!res.ok) throw new Error('อัปโหลดไม่สำเร็จ');
      const data = (await res.json()) as { url: string };
      onUploaded(data.url);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onPick}
      />
      {!hidePreview && value && (
        <PreviewableImage
          src={value}
          alt="รูปที่อัปโหลด"
          className="mb-2 h-32 w-full rounded-lg border object-cover"
        />
      )}
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? 'กำลังอัปโหลด…' : label}
      </Button>
      {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
    </div>
  );
}
