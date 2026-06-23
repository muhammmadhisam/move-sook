'use client';

import { useEffect, useRef } from 'react';

// Minimal typing for the slice of the Turnstile JS API we use.
interface TurnstileApi {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      callback: (token: string) => void;
      'expired-callback'?: () => void;
      'error-callback'?: () => void;
      theme?: 'auto' | 'light' | 'dark';
      language?: string;
      size?: 'normal' | 'flexible' | 'compact';
    },
  ) => string;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const SCRIPT_ID = 'cf-turnstile-script';

/** Resolve once the Turnstile script is loaded and `window.turnstile` is ready. */
function loadTurnstile(): Promise<TurnstileApi> {
  return new Promise((resolve, reject) => {
    if (window.turnstile) {
      resolve(window.turnstile);
      return;
    }
    const ready = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error('turnstile unavailable'));
    };
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', ready, { once: true });
      existing.addEventListener('error', () => reject(new Error('turnstile script error')), {
        once: true,
      });
      return;
    }
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener('load', ready, { once: true });
    script.addEventListener('error', () => reject(new Error('turnstile script error')), {
      once: true,
    });
    document.head.appendChild(script);
  });
}

/**
 * Cloudflare Turnstile widget. Renders once and reports the challenge token via
 * `onToken` (and `onToken(null)` when it expires or errors). To force a fresh
 * token after one is consumed (tokens are single-use server-side), remount this
 * component by changing its React `key`. Renders nothing without a site key, so
 * the calculator degrades gracefully in dev / when the feature isn't configured.
 */
export function Turnstile({
  onToken,
  className,
}: {
  onToken: (token: string | null) => void;
  className?: string;
}) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const containerRef = useRef<HTMLDivElement>(null);
  // Keep the latest callback without re-running the render effect.
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;
    const el = containerRef.current;
    let widgetId: string | null = null;
    let cancelled = false;

    void loadTurnstile()
      .then((api) => {
        if (cancelled) return;
        widgetId = api.render(el, {
          sitekey: siteKey,
          callback: (token) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => onTokenRef.current(null),
          theme: 'auto',
          language: 'th',
        });
      })
      .catch(() => {
        // Script blocked/unreachable — leave the token null; the API fails open
        // on its side when its secret can't reach Cloudflare either.
        onTokenRef.current(null);
      });

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) {
        try {
          window.turnstile.remove(widgetId);
        } catch {
          // widget already gone — ignore.
        }
      }
    };
  }, [siteKey]);

  if (!siteKey) return null;
  return <div ref={containerRef} className={className} />;
}

/** True when Turnstile is configured (a site key is present) on this build. */
export const TURNSTILE_ENABLED = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
