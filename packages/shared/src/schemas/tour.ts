import { z } from 'zod';

// Guided-tour (onboarding) completion tracking. Stored per-user in the DB so a
// "learned" tour follows the account across devices (replacing the old
// localStorage flag). A tour is considered learned when the user's stored version
// for that tourId matches the client's current version.

export const TourSeenDto = z.object({
  tourId: z.string(),
  version: z.number().int(),
});
export type TourSeenDto = z.infer<typeof TourSeenDto>;

export const MeToursResponse = z.object({
  tours: z.array(TourSeenDto),
});
export type MeToursResponse = z.infer<typeof MeToursResponse>;

export const MarkTourSeenInput = z.object({
  tourId: z.string().min(1).max(64),
  version: z.number().int().min(1).default(1),
});
export type MarkTourSeenInput = z.infer<typeof MarkTourSeenInput>;
