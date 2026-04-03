/**
 * POST /api/notify/escalation
 *
 * Called internally by the Python detection engine when the escalation timer
 * fires and no responder has acknowledged the fall alert.
 *
 * Sends a LINE broadcast to ALL bot friends (responders add the bot via QR code
 * in LINE OA Manager → Settings → QR code — no individual user IDs needed).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { broadcastLineMessage } from "@/lib/line";

interface EscalationPayload {
  event_id:      string;
  person_id:     number;
  ar:            number;
  down_duration: number;
  timestamp:     number;
}

function buildMessage(payload: EscalationPayload, location: string): string {
  const time = new Date(payload.timestamp * 1000).toLocaleTimeString("en-US", {
    hour:   "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const confidencePct = Math.min(99, Math.round(Math.min(payload.ar / 3, 1) * 100));

  return [
    "🚨 FALL ALERT — Unacknowledged",
    "",
    "A fall was detected and no responder has confirmed within the escalation window.",
    "",
    `📍 Location: ${location}`,
    `👤 Person: #${payload.person_id}`,
    `⏱ Down Duration: ${payload.down_duration.toFixed(1)}s`,
    `🎯 Confidence: ${confidencePct}%`,
    `🕐 Detected At: ${time}`,
    "",
    "⚠️ Immediate response required.",
    "Open the Guardian dashboard to acknowledge and respond.",
  ].join("\n");
}

export async function POST(req: NextRequest) {
  let payload: EscalationPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Load facility location from config
  const config   = await prisma.systemConfig.findFirst();
  const location = config?.location ?? "Guardian Monitoring Station";

  const message = buildMessage(payload, location);

  // Broadcast to all bot friends — no individual IDs needed
  await broadcastLineMessage([{ type: "text", text: message }]);

  console.log(
    `[LINE Escalation] broadcast sent | event=${payload.event_id} | location=${location}`,
  );

  return NextResponse.json({ ok: true });
}
