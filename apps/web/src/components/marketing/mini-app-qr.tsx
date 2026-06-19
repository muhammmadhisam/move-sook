import Image from 'next/image';
import { cn } from '@movesook/ui';

// Reusable QR block for the LINE Mini App. Desktop visitors can't open a Mini
// App link directly (it's a phone flow), so the QR bridges desktop → phone.
// The QR always sits on a white card so it scans on any background; `dark`
// switches the caption colours for placement on the navy footer.
export function MiniAppQr({
  size = 150,
  title = 'สแกนเปิดแอปบนมือถือ',
  subtitle,
  dark = false,
  className,
}: {
  size?: number;
  title?: string;
  subtitle?: string;
  dark?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center text-center', className)}>
      <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-black/5">
        <Image
          src="/qr-line-mini-app.png"
          alt="QR เปิด MoveSook บน LINE"
          width={size}
          height={size}
          className="h-auto w-full"
        />
      </div>
      <p className={cn('mt-3 text-sm font-semibold', dark ? 'text-white' : 'text-foreground')}>
        {title}
      </p>
      {subtitle && (
        <p className={cn('mt-1 text-xs', dark ? 'text-navy-300' : 'text-muted-foreground')}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
