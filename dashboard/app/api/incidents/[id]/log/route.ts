import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const logs = await prisma.incidentLog.findMany({
    where:   { incidentId: params.id },
    orderBy: { timestamp: "asc" },
  });
  return NextResponse.json(logs);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { type, message } = await req.json();
  if (!type || !message) return NextResponse.json({ error: "type and message required" }, { status: 400 });

  const log = await prisma.incidentLog.create({
    data: { incidentId: params.id, type, message },
  });
  return NextResponse.json(log);
}
