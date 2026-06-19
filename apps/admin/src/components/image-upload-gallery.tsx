'use client';

import { useRef, useState } from 'react';
import { Plus, X, Loader2 } from 'lucide-react';
import { cn, PreviewableImage } from '@movesook/ui';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

interface ImageUploadGalleryProps {
  /** Current photo URLs. */
  value: string[];
  /** Called with the full new list after an add or remove. */
  onChange: (urls: string[]) => void;
  label?: string;
  /** Max number of photos allowed. */
  max?: number;
  disabled?: boolean;
  /** Storage bucket (context) the files are filed under, e.g. `vehicle`. */
  folder?: string;
}

/** Multi-photo picker: thumbnails with remove + an add tile. Uploads each file then reports the full list. */
export function ImageUploadGallery({
  value,
  onChange,
  label,
  max = 10,
  disabled,
  folder = 'misc',
}: ImageUploadGalleryProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remaining = max - value.length;

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, remaining);
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const uploaded: string[] = [];
      for (const file of files) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('folder', folder);
        const res = await fetch(`${API_BASE}/uploads`, {
          method: 'POST',
          body: fd,
          credentials: 'include',
        });
        if (!res.ok) throw new Error('อัปโหลดไม่สำเร็จ');
        const data = (await res.json()) as { url: string };
        uploaded.push(data.url);
      }
      onChange([...value, ...uploaded]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div>
      {label && <p className="mb-1.5 text-sm font-medium">{label}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={onPick}
      />
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {value.map((url) => (
          <div key={url} className="group relative aspect-square overflow-hidden rounded-lg border">
            <PreviewableImage
              src={url}
              gallery={value}
              alt="รูปตัวอย่างรถ"
              className="h-full w-full object-cover"
            />
            {!disabled && (
              <button
                type="button"
                onClick={() => onChange(value.filter((u) => u !== url))}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white transition-opacity hover:bg-black/80"
                aria-label="ลบรูป"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
        {!disabled && remaining > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className={cn(
              'flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-muted-foreground transition-colors',
              'hover:border-brand-400 hover:text-brand-600 disabled:opacity-60',
            )}
          >
            {busy ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <Plus className="h-5 w-5" />
                <span className="text-xs">เพิ่มรูป</span>
              </>
            )}
          </button>
        )}
      </div>
      {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
    </div>
  );
}
