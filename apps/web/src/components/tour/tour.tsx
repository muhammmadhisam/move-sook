'use client';

import { useEffect, useMemo, useRef } from 'react';
import { create } from 'zustand';
import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import { Lightbulb } from 'lucide-react';
import { cn } from '@movesook/ui';
import { useTours } from '@/hooks/use-tours';

// A single tour step. `element` is optional — omit it for a centered, non-anchored
// "explainer" step (driver.js renders it as a middle-of-screen modal). Bump a tour's
// `version` (in <PageTour>) to re-show it to users who already saw the older one.
export type TourStep = DriveStep;

// The tour registered by whichever page is currently mounted. The shared lightbulb
// button in the app header reads this to know what to replay / whether to highlight.
type TourState = {
  tourId: string | null;
  steps: TourStep[];
  version: number;
};
const useTourStore = create<TourState>(() => ({ tourId: null, steps: [], version: 0 }));

/**
 * Run driver.js for the given steps. Steps whose anchor isn't on screen are dropped
 * (so a role-conditional element simply skips its step instead of breaking the tour).
 * `onClose` fires once the tour ends for ANY reason — finished, skipped (X), or Esc —
 * which is exactly when we mark it learned.
 */
export function runTour(steps: TourStep[], onClose?: () => void) {
  if (typeof document === 'undefined') return;
  const present = steps.filter((s) => !s.element || document.querySelector(s.element as string));
  if (present.length === 0) {
    onClose?.();
    return;
  }
  driver({
    showProgress: present.length > 1,
    allowClose: true,
    overlayOpacity: 0.65,
    stagePadding: 6,
    nextBtnText: 'ถัดไป',
    prevBtnText: 'ย้อนกลับ',
    doneBtnText: 'เข้าใจแล้ว',
    progressText: '{{current}} / {{total}}',
    onDestroyed: () => onClose?.(),
    steps: present,
  }).drive();
}

/**
 * Drop one of these on any page to (a) register the page's tour for the header
 * lightbulb and (b) auto-run it once for a user who hasn't learned it yet. Skippable;
 * once closed it's marked learned in the DB and never auto-runs again (the lightbulb
 * still replays it, and stops glowing yellow).
 */
export function PageTour({
  id,
  steps,
  version = 1,
  autoStart = true,
  delayMs = 600,
}: {
  id: string;
  steps: TourStep[];
  version?: number;
  autoStart?: boolean;
  delayMs?: number;
}) {
  const { isFetched, isLearned, markSeen } = useTours();

  // Keep the latest steps + markSeen in refs so the auto-start effect can read them
  // without depending on values that change identity every render.
  const stepsRef = useRef(steps);
  stepsRef.current = steps;
  const markRef = useRef(markSeen);
  markRef.current = markSeen;

  // Publish this page's tour so the header lightbulb can replay/highlight it.
  useEffect(() => {
    useTourStore.setState({ tourId: id, steps, version });
  }, [id, steps, version]);

  // Clear it when the page unmounts (only if we're still the active tour).
  useEffect(() => {
    return () => {
      if (useTourStore.getState().tourId === id) {
        useTourStore.setState({ tourId: null, steps: [], version: 0 });
      }
    };
  }, [id]);

  // Boolean (stable identity) so the auto-start effect deps don't churn each render.
  const alreadyLearned = isFetched ? isLearned(id, version) : true;

  // Auto-run once, after the learned-state has loaded, for users who haven't learned it.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoStart || autoStarted.current || !isFetched) return;
    if (alreadyLearned) {
      autoStarted.current = true;
      return;
    }
    if (stepsRef.current.length === 0) return; // wait until the page has steps
    autoStarted.current = true;
    const t = setTimeout(
      () => runTour(stepsRef.current, () => markRef.current(id, version)),
      delayMs,
    );
    return () => clearTimeout(t);
  }, [autoStart, isFetched, alreadyLearned, id, version, delayMs]);

  return null;
}

/**
 * Lightbulb in the app header — replays the current page's tour. Glows yellow and
 * pulses until the user has learned this page's tour; reverts to plain once learned.
 * Hidden entirely when the current page registers no tour.
 */
export function TourButton({ className }: { className?: string }) {
  const tourId = useTourStore((s) => s.tourId);
  const version = useTourStore((s) => s.version);
  const { isFetched, isLearned, markSeen } = useTours();

  const learned = useMemo(
    () => (tourId && isFetched ? isLearned(tourId, version) : true),
    [tourId, version, isFetched, isLearned],
  );

  if (!tourId) return null;

  return (
    <button
      type="button"
      aria-label={learned ? 'คู่มือการใช้งานหน้านี้' : 'มีคำแนะนำการใช้งานหน้านี้ — แตะเพื่อดู'}
      title={learned ? 'คู่มือการใช้งานหน้านี้' : 'มีคำแนะนำการใช้งานหน้านี้'}
      data-tour="help-button"
      onClick={() => runTour(useTourStore.getState().steps, () => markSeen(tourId, version))}
      className={cn(
        'relative inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
        learned
          ? 'text-white/90 hover:bg-navy-800 hover:text-white'
          : 'bg-amber-400 text-navy-900 shadow-sm hover:bg-amber-300',
        className,
      )}
    >
      <Lightbulb className={cn('h-5 w-5', !learned && 'fill-amber-200')} />
      {/* Pulsing ring to draw the eye until learned */}
      {!learned && (
        <span className="pointer-events-none absolute inset-0 animate-ping rounded-lg bg-amber-400/60" />
      )}
    </button>
  );
}
