// LINE Messaging API push — framework-agnostic primitive. The API layer looks
// up a recipient's lineUserId and calls these; the in-app Notification row is
// the source of truth, so a push failure must never be fatal (callers swallow it).

const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';
const LINE_MULTICAST_URL = 'https://api.line.me/v2/bot/message/multicast';

// LINE caps a single multicast at 500 recipients.
const MULTICAST_CHUNK = 500;

export type LinePushResult = { ok: true } | { ok: false; reason: string };

/** A plain text LINE message. (Only text is needed today; extend with flex/template later.) */
function textMessage(text: string) {
  // LINE rejects messages over 5000 chars; keep well under.
  return { type: 'text' as const, text: text.slice(0, 1900) };
}

/**
 * Push a text message to a single LINE user. No-op success when `accessToken`
 * is empty so callers don't have to branch on whether push is configured.
 */
export async function pushLineText(
  accessToken: string | undefined,
  to: string,
  text: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LinePushResult> {
  if (!accessToken) return { ok: false, reason: 'no_access_token' };
  if (!to) return { ok: false, reason: 'no_recipient' };

  try {
    const res = await fetchImpl(LINE_PUSH_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ to, messages: [textMessage(text)] }),
    });
    if (!res.ok) return { ok: false, reason: `line_status_${res.status}` };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'network_error' };
  }
}

/**
 * Push the same text to many LINE users via multicast (chunked at 500).
 * No-op success when push is not configured. Returns ok if every chunk sent.
 */
export async function multicastLineText(
  accessToken: string | undefined,
  to: string[],
  text: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LinePushResult> {
  if (!accessToken) return { ok: false, reason: 'no_access_token' };
  const recipients = to.filter(Boolean);
  if (recipients.length === 0) return { ok: true };

  const message = textMessage(text);
  for (let i = 0; i < recipients.length; i += MULTICAST_CHUNK) {
    const chunk = recipients.slice(i, i + MULTICAST_CHUNK);
    try {
      const res = await fetchImpl(LINE_MULTICAST_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ to: chunk, messages: [message] }),
      });
      if (!res.ok) return { ok: false, reason: `line_status_${res.status}` };
    } catch {
      return { ok: false, reason: 'network_error' };
    }
  }
  return { ok: true };
}
