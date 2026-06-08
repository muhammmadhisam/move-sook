import { z } from 'zod';

// POST /me/referral/apply — a customer enters a friend's referral code (once).
export const ApplyReferralInput = z.object({
  code: z.string().trim().min(4).max(20),
});
export type ApplyReferralInput = z.infer<typeof ApplyReferralInput>;

// GET /me/referral — the customer's own referral status + share code.
export const ReferralResponse = z.object({
  code: z.string(), // this customer's share code (generated lazily)
  referredCount: z.number().int(), // how many customers signed up with my code
  rewardedCount: z.number().int(), // of those, how many have triggered the reward
  rewardThb: z.number().int(), // reward value per successful referral (THB)
  referredByApplied: z.boolean(), // whether I already applied someone else's code
});
export type ReferralResponse = z.infer<typeof ReferralResponse>;
