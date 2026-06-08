'use client';

import { useRef, useState } from 'react';
import { Button, PreviewableImage } from '@movesook/ui';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

interface ImageUploadProps {
  value?: string | null;
  onUploaded: (url: string) => void;
  label?: string;
}

/** Pick an image, upload to the API, report back the stored URL. */
export function ImageUpload({ value, onUploaded, label = 'อัปโหลดรูป' }: ImageUploadProps) {
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
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
      {value && (
        <PreviewableImage
          src={value}
          alt="สลิป"
          className="mb-2 max-h-48 w-full rounded-lg border object-contain"
        />
      )}
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? 'กำลังอัปโหลด…' : label}
      </Button>
      {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
    </div>
  );
}
