import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const incident = await prisma.incident.findUnique({
    where: { id: params.id },
    include: { user: { select: { name: true } } },
  });
  if (!incident) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (incident.reportGenerated && incident.reportText) {
    return NextResponse.json({ reportText: incident.reportText });
  }

  const responseSeconds = incident.acknowledgedAt
    ? Math.round((incident.acknowledgedAt.getTime() - incident.createdAt.getTime()) / 1000)
    : null;

  const prompt = `Generate a formal incident report for:
Type: ${incident.type}
Time: ${incident.createdAt.toISOString()}
Duration on ground: ${incident.downDuration}s
Confidence (AR): ${incident.ar}
Acknowledged by: ${incident.user?.name ?? "Unknown"}
Response time: ${responseSeconds !== null ? `${responseSeconds}s` : "N/A"}
Final status: ${incident.status}
Notes: ${incident.notes ?? "None"}

Write a professional 3-4 sentence summary.`;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    });

    const reportText =
      response.content[0]?.type === "text" ? response.content[0].text : "Report generation failed.";

    await prisma.incident.update({
      where: { id: params.id },
      data: { reportText, reportGenerated: true },
    });

    return NextResponse.json({ reportText });
  } catch (err) {
    console.error("Report gen error:", err);
    return NextResponse.json({ error: "AI unavailable" }, { status: 500 });
  }
}
