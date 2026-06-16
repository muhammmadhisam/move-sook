// LINE Messaging API push — framework-agnostic primitive. The API layer looks
// up a recipient's lineUserId and calls these; the in-app Notification row is
// the source of truth, so a push failure must never be fatal (callers swallow it).

const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';
const LINE_MULTICAST_URL = 'https://api.line.me/v2/bot/message/multicast';

// LINE caps a single multicast at 500 recipients.
const MULTICAST_CHUNK = 500;

export type LinePushResult = { ok: true } | { ok: false; reason: string };

// A LINE Messaging API message object (text, flex, …). Kept loose on purpose:
// the queue serialises these to JSON and the worker hands them straight to LINE.
export type LineMessage = Record<string, unknown>;

// Brand palette — keep in sync with packages/config/tailwind.preset.js.
const BRAND_RED = '#E0202A';
const BRAND_NAVY = '#0A1D35';

/** A plain text LINE message. */
export function textMessage(text: string): LineMessage {
  // LINE rejects messages over 5000 chars; keep well under.
  return { type: 'text', text: text.slice(0, 1900) };
}

export type FlexCardInput = {
  /** Fallback text shown in chat list / push preview (LINE requires it). */
  altText: string;
  title: string;
  body: string;
  /** Optional label→value rows rendered under the body. */
  rows?: { label: string; value: string }[];
  /** Optional primary call-to-action button (opens a URL). */
  button?: { label: string; url: string };
  /** Header accent colour; defaults to brand red. */
  accent?: string;
};

/**
 * Build a clean, branded LINE Flex "card" from a title/body (+ optional rows and
 * a CTA button). This is the house style for every customer-facing push so the
 * messages look professional instead of a bare text blob.
 */
export function flexCardMessage(input: FlexCardInput): LineMessage {
  const bodyContents: LineMessage[] = [
    { type: 'text', text: input.title, weight: 'bold', size: 'lg', color: BRAND_NAVY, wrap: true },
    { type: 'text', text: input.body, size: 'sm', color: '#555555', wrap: true, margin: 'md' },
  ];

  if (input.rows && input.rows.length > 0) {
    bodyContents.push({
      type: 'box',
      layout: 'vertical',
      margin: 'lg',
      spacing: 'sm',
      contents: input.rows.map((r) => ({
        type: 'box',
        layout: 'baseline',
        spacing: 'sm',
        contents: [
          { type: 'text', text: r.label, size: 'sm', color: '#999999', flex: 2, wrap: true },
          {
            type: 'text',
            text: r.value,
            size: 'sm',
            color: '#333333',
            flex: 4,
            wrap: true,
            align: 'end',
          },
        ],
      })),
    });
  }

  const bubble: LineMessage = {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: input.accent ?? BRAND_RED,
      paddingAll: 'lg',
      contents: [
        { type: 'text', text: 'MoveSook', color: '#FFFFFF', weight: 'bold', size: 'md' },
      ],
    },
    body: { type: 'box', layout: 'vertical', contents: bodyContents },
  };

  if (input.button) {
    bubble.footer = {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'button',
          style: 'primary',
          color: BRAND_RED,
          height: 'sm',
          action: {
            type: 'uri',
            label: input.button.label.slice(0, 40),
            uri: input.button.url,
          },
        },
      ],
    };
  }

  return { type: 'flex', altText: input.altText.slice(0, 400), contents: bubble };
}

/**
 * Push arbitrary LINE message objects (text, flex, …) to a single user. No-op
 * success when `accessToken` is empty so callers don't have to branch on whether
 * push is configured.
 */
export async function pushLineMessages(
  accessToken: string | undefined,
  to: string,
  messages: LineMessage[],
  fetchImpl: typeof fetch = fetch,
): Promise<LinePushResult> {
  if (!accessToken) return { ok: false, reason: 'no_access_token' };
  if (!to) return { ok: false, reason: 'no_recipient' };
  if (messages.length === 0) return { ok: true };

  try {
    const res = await fetchImpl(LINE_PUSH_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ to, messages: messages.slice(0, 5) }),
    });
    if (!res.ok) return { ok: false, reason: `line_status_${res.status}` };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'network_error' };
  }
}

/** Push a single text bubble to one LINE user. */
export function pushLineText(
  accessToken: string | undefined,
  to: string,
  text: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LinePushResult> {
  return pushLineMessages(accessToken, to, [textMessage(text)], fetchImpl);
}

/**
 * Push the same text to many LINE users via multicast (chunked at 500).
 * No-op success when push is not configured. Returns ok if every chunk sent.
 */
export async function multicastLineMessages(
  accessToken: string | undefined,
  to: string[],
  messages: LineMessage[],
  fetchImpl: typeof fetch = fetch,
): Promise<LinePushResult> {
  if (!accessToken) return { ok: false, reason: 'no_access_token' };
  const recipients = to.filter(Boolean);
  if (recipients.length === 0 || messages.length === 0) return { ok: true };

  const payload = messages.slice(0, 5);
  for (let i = 0; i < recipients.length; i += MULTICAST_CHUNK) {
    const chunk = recipients.slice(i, i + MULTICAST_CHUNK);
    try {
      const res = await fetchImpl(LINE_MULTICAST_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ to: chunk, messages: payload }),
      });
      if (!res.ok) return { ok: false, reason: `line_status_${res.status}` };
    } catch {
      return { ok: false, reason: 'network_error' };
    }
  }
  return { ok: true };
}

/** Multicast the same text bubble to many LINE users (chunked at 500). */
export function multicastLineText(
  accessToken: string | undefined,
  to: string[],
  text: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LinePushResult> {
  return multicastLineMessages(accessToken, to, [textMessage(text)], fetchImpl);
}
