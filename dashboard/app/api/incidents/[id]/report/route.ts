import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You are generating a concise patient handover summary for hospital emergency staff.
Write in plain clinical language — no markdown, no bullet symbols, no headers with # or *.
Use short labelled paragraphs. Maximum 220 words. Be direct and factual.`;

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const incident = await prisma.incident.findUnique({
    where:   { id: params.id },
    include: {
      user:        { select: { name: true } },
      logs:        { orderBy: { timestamp: "asc" } },
      transcripts: { orderBy: { timestamp: "asc" } },
    },
  });
  if (!incident) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const responseSeconds = incident.acknowledgedAt
    ? Math.round((incident.acknowledgedAt.getTime() - incident.createdAt.getTime()) / 1000)
    : null;

  const arRisk =
    incident.ar < 0.5 ? "HIGH — person fully horizontal"
    : incident.ar < 0.7 ? "MODERATE — person significantly tilted"
    : "LOW — person partially upright";

  const durRisk =
    incident.downDuration >= 30 ? "CRITICAL (≥30 s on ground)"
    : incident.downDuration >= 10 ? "HIGH (10–30 s on ground)"
    : "MODERATE (<10 s on ground)";

  const vel = (incident as unknown as { velocity?: number }).velocity ?? 0;
  const velRisk =
    vel >= 0.8 ? "SEVERE — very fast impact, high injury risk"
    : vel >= 0.5 ? "HIGH — fast fall, possible injury"
    : vel >= 0.3 ? "MODERATE — clear fall motion"
    : vel > 0   ? "LOW — slow descent"
    : "unknown (no skeleton data)";

  // ── Timeline block ──────────────────────────────────────────────────────
  const timelineBlock = incident.logs.length
    ? incident.logs
        .map((l) => `[${new Date(l.timestamp).toLocaleTimeString()}] ${l.message}`)
        .join("\n")
    : "No timeline entries recorded.";

  // ── Transcript block ────────────────────────────────────────────────────
  const transcriptBlock = incident.transcripts.length
    ? incident.transcripts
        .map((t) => `${t.speaker === "assistant" ? "AI" : "Responder"}: ${t.text}`)
        .join("\n")
    : "No voice conversation recorded.";

  const prompt = `PATIENT HANDOVER — FALL INCIDENT

Incident ID:       ${incident.eventId}
Detection time:    ${incident.createdAt.toLocaleString()}
Person ID:         #${incident.personId}
Fall severity (AR):${incident.ar.toFixed(2)} — ${arRisk}
Fall velocity:     ${vel > 0 ? `${vel.toFixed(3)} norm/s` : "unavailable"} — ${velRisk}
Time on ground:    ${incident.downDuration.toFixed(1)} s — ${durRisk}
Response time:     ${responseSeconds !== null ? `${responseSeconds} s` : "Not acknowledged"}
Acknowledged by:   ${incident.user?.name ?? "Unknown"}
Final status:      ${incident.status}
Responder notes:   ${incident.notes?.trim() || "None"}

INCIDENT TIMELINE:
${timelineBlock}

ON-SCENE VOICE CONVERSATION:
${transcriptBlock}

Write a structured hospital handover summary covering:
1. Incident description and fall severity
2. Key clinical concerns based on duration and fall angle
3. What was observed or reported on scene
4. Responder actions taken and current status
5. Recommended assessment priorities on arrival`;

  try {
    const response = await client.messages.create({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 400,
      system:     SYSTEM,
      messages:   [{ role: "user", content: prompt }],
    });

    const reportText =
      response.content[0]?.type === "text"
        ? response.content[0].text.trim()
        : "Report generation failed.";

    await prisma.incident.update({
      where: { id: params.id },
      data:  { reportText, reportGenerated: true },
    });

    return NextResponse.json({ reportText });
  } catch (err) {
    console.error("Report gen error:", err);
    return NextResponse.json({ error: "AI unavailable" }, { status: 500 });
  }
}
