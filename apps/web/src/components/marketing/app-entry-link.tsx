'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { lineMiniAppLink } from '@/lib/site';

/**
 * Device-aware "enter the app" link for marketing CTAs.
 *
 * The LINE Mini App deep link (miniapp.line.me/...) only works inside the LINE
 * mobile app — on desktop it dead-ends (400 / blank). So we route by device:
 *   - mobile  → the Mini App deep link (opens natively inside LINE)
 *   - desktop → the web app at /app, where the LINE *Login* LIFF runs the normal
 *               OAuth redirect.
 *
 * The default (SSR + first paint) is the desktop /app target, so it's always
 * safe; a mobile client swaps to the Mini App link after mount.
 */
export function AppEntryLink({
  path = '',
  className,
  children,
  onClick,
}: {
  path?: string;
  className?: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    setIsMobile(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
  }, []);

  const href = isMobile ? lineMiniAppLink(path) : `/app${path}`;
  return (
    <a
      href={href}
      className={className}
      onClick={onClick}
      {...(isMobile ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {children}
    </a>
  );
}
