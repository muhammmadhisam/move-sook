'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from './dialog';
import { cn } from '../lib/utils';

interface ImageLightboxProps {
  images: string[];
  index: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIndexChange: (index: number) => void;
}

/** Full-screen image preview with prev/next navigation (controlled). */
export function ImageLightbox({ images, index, open, onOpenChange, onIndexChange }: ImageLightboxProps) {
  if (images.length === 0) return null;
  const safe = Math.min(Math.max(index, 0), images.length - 1);
  const prev = () => onIndexChange((safe - 1 + images.length) % images.length);
  const next = () => onIndexChange((safe + 1) % images.length);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl border-0 bg-transparent p-0 shadow-none"
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') prev();
          if (e.key === 'ArrowRight') next();
        }}
      >
        <DialogTitle className="sr-only">รูปภาพ</DialogTitle>
        <img
          src={images[safe]}
          alt="รูปภาพ"
          className="mx-auto max-h-[85vh] w-auto rounded-lg object-contain"
        />
        {images.length > 1 && (
          <>
            <button
              type="button"
              aria-label="รูปก่อนหน้า"
              onClick={prev}
              className="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              type="button"
              aria-label="รูปถัดไป"
              onClick={next}
              className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
            <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
              {safe + 1} / {images.length}
            </span>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export interface PreviewableImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  /** The set of images to navigate in the preview; defaults to just this image. */
  gallery?: string[];
}

/**
 * An `<img>` that opens a full-screen preview on click. Drop-in replacement for
 * `<img>` anywhere a content/document photo is shown. Stops click propagation so
 * it is safe inside clickable cards/rows. Pass `gallery` to let the preview page
 * through a whole set.
 */
export function PreviewableImage({ gallery, className, onClick, src, ...props }: PreviewableImageProps) {
  const srcStr = src != null ? String(src) : '';
  const images = gallery && gallery.length > 0 ? gallery : srcStr ? [srcStr] : [];
  const [open, setOpen] = React.useState(false);
  const [index, setIndex] = React.useState(0);

  return (
    <>
      <img
        src={src}
        className={cn(images.length > 0 && 'cursor-zoom-in', className)}
        onClick={(e) => {
          onClick?.(e);
          if (images.length === 0) return;
          e.stopPropagation();
          setIndex(Math.max(0, images.indexOf(srcStr)));
          setOpen(true);
        }}
        {...props}
      />
      <ImageLightbox
        images={images}
        index={index}
        open={open}
        onOpenChange={setOpen}
        onIndexChange={setIndex}
      />
    </>
  );
}
