/**
 * lib/line.ts — LINE Messaging API broadcast helper.
 *
 * Uses the Broadcast API to send to ALL friends of the bot.
 * Responders simply add the bot as a friend (scan QR in LINE OA Manager → Settings → QR code).
 *
 * Requires LINE_CHANNEL_ACCESS_TOKEN in environment.
 * Get it: LINE Developers Console → your channel → Messaging API → Channel access token → Issue.
 */

const LINE_BROADCAST_URL = "https://api.line.me/v2/bot/message/broadcast";

export interface LineTextMessage {
  type: "text";
  text: string;
}

/**
 * Broadcast a message to ALL friends of the bot.
 * Silently skips if LINE_CHANNEL_ACCESS_TOKEN is not configured.
 */
export async function broadcastLineMessage(messages: LineTextMessage[]): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    console.warn("[LINE] LINE_CHANNEL_ACCESS_TOKEN not set — skipping broadcast");
    return;
  }

  try {
    const res = await fetch(LINE_BROADCAST_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ messages }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[LINE] Broadcast failed: HTTP ${res.status} — ${body}`);
    } else {
      console.log("[LINE] Broadcast sent successfully");
    }
  } catch (err) {
    console.error("[LINE] Broadcast network error:", err);
  }
}
