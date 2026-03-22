import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const incident = await prisma.incident.findUnique({
    where: { id: params.id },
    include: { user: { select: { name: true, email: true } } },
  });
  if (!incident) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(incident);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { status, acknowledgedBy, notes } = body;

  const data: Record<string, unknown> = {};
  if (status) data.status = status;
  if (notes !== undefined) data.notes = notes;

  if (status === "ACKNOWLEDGED" && acknowledgedBy) {
    data.acknowledgedBy = acknowledgedBy;
    data.acknowledgedAt = new Date();
  }
  if (status === "RESOLVED" || status === "FALSE_ALARM") {
    data.resolvedAt = new Date();
  }

  const incident = await prisma.incident.update({
    where: { id: params.id },
    data,
  });

  return NextResponse.json(incident);
}
