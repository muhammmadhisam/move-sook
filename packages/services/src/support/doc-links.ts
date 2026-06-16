import { signDocToken } from '@movesook/auth';
import { getEnv } from '../runtime/env';

// Receipt links live in the customer's LINE chat history indefinitely, so the
// token is long-lived (1 year). It only grants read access to one job's receipt.
const DOC_TOKEN_TTL_SEC = 60 * 60 * 24 * 365;

function apiBase(): string {
  return getEnv().PUBLIC_API_URL ?? `http://localhost:${getEnv().PORT}`;
}

/**
 * Build an absolute, token-authenticated URL that opens a job's receipt PDF in a
 * plain browser (no session cookie needed) — used as the CTA in the LINE Flex
 * card sent to the customer after their payment is approved.
 */
export async function buildReceiptLink(jobId: string): Promise<string> {
  const token = await signDocToken({
    jobId,
    type: 'receipt',
    secret: getEnv().JWT_SECRET,
    ttlSec: DOC_TOKEN_TTL_SEC,
  });
  return `${apiBase()}/jobs/${jobId}/receipt/view?token=${token}`;
}
