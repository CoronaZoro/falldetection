import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") ?? "50");
  const type = searchParams.get("type");
  const status = searchParams.get("status");

  const where: Record<string, unknown> = {};
  if (type) where.type = type;
  if (status) where.status = status;

  // Responders only see incidents they acknowledged
  if (session.user.role === "RESPONDER") {
    where.acknowledgedBy = session.user.id;
  }

  const incidents = await prisma.incident.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { user: { select: { name: true } } },
  });

  return NextResponse.json(incidents);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { eventId, type, personId, ar, downDuration, velocity } = body;

  // Upsert to avoid duplicates from race conditions
  const incident = await prisma.incident.upsert({
    where: { eventId },
    update: {},
    create: {
      eventId,
      type,
      personId: personId ?? 0,
      ar: ar ?? 0,
      downDuration: downDuration ?? 0,
      velocity: velocity ?? 0,
      status: "UNACKNOWLEDGED",
    },
  });

  return NextResponse.json(incident);
}
