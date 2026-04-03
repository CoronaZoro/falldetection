import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entries = await prisma.incidentTranscript.findMany({
    where:   { incidentId: params.id },
    orderBy: { timestamp: "asc" },
  });
  return NextResponse.json(entries);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { speaker, text } = await req.json();
  if (!speaker || !text) return NextResponse.json({ error: "speaker and text required" }, { status: 400 });

  const entry = await prisma.incidentTranscript.create({
    data: { incidentId: params.id, speaker, text },
  });
  return NextResponse.json(entry);
}
