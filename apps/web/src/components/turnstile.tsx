'use client';

import { useEffect, useRef, useState } from 'react';

// Minimal typing for the slice of the Turnstile JS API we use.
interface TurnstileApi {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      callback: (token: string) => void;
      'expired-callback'?: () => void;
      'error-callback'?: () => void;
      'timeout-callback'?: () => void;
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
// If no token arrives in this long, surface a retry instead of hanging forever.
const TOKEN_TIMEOUT_MS = 20_000;

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
 * Cloudflare Turnstile widget. Renders the challenge and reports the token via
 * `onToken` (and `onToken(null)` on expiry/error). If the script is blocked, the
 * widget errors, or no token arrives within TOKEN_TIMEOUT_MS, it shows an inline
 * error with a "ลองใหม่" button instead of hanging silently — so the calculate
 * button never gets stuck on "กำลังยืนยัน…" with no way forward. Renders nothing
 * without a site key (feature disabled / dev).
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
  // Bump to re-attempt after an error/timeout.
  const [attempt, setAttempt] = useState(0);
  const [errored, setErrored] = useState(false);
  // Keep the latest callback without re-running the render effect.
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;
    const el = containerRef.current;
    let widgetId: string | null = null;
    let cancelled = false;
    setErrored(false);

    const fail = () => {
      if (cancelled) return;
      onTokenRef.current(null);
      setErrored(true);
    };

    // Backstop: a widget that neither succeeds nor fires error-callback (e.g.
    // a slow/blocked network) still resolves to the retry UI.
    const timer = setTimeout(fail, TOKEN_TIMEOUT_MS);

    void loadTurnstile()
      .then((api) => {
        if (cancelled) return;
        // Clear any leftover iframe before (re)rendering into this element.
        el.innerHTML = '';
        widgetId = api.render(el, {
          sitekey: siteKey,
          callback: (token) => {
            if (cancelled) return;
            clearTimeout(timer);
            onTokenRef.current(token);
          },
          'expired-callback': fail,
          'error-callback': fail,
          'timeout-callback': fail,
          theme: 'auto',
          language: 'th',
        });
      })
      .catch(() => {
        clearTimeout(timer);
        fail();
      });

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (widgetId && window.turnstile) {
        try {
          window.turnstile.remove(widgetId);
        } catch {
          // widget already gone — ignore.
        }
      }
    };
    // `attempt` forces a fresh render on retry.
  }, [siteKey, attempt]);

  if (!siteKey) return null;

  return (
    <div className={className}>
      <div ref={containerRef} />
      {errored && (
        <div className="mt-1 text-center text-xs text-muted-foreground">
          ยืนยันความปลอดภัยไม่สำเร็จ
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="ml-1 font-medium text-primary underline"
          >
            ลองใหม่
          </button>
        </div>
      )}
    </div>
  );
}

/** True when Turnstile is configured (a site key is present) on this build. */
export const TURNSTILE_ENABLED = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
