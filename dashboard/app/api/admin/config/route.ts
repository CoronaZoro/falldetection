import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";

async function requireAdmin() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") return null;
  return session;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let config = await prisma.systemConfig.findFirst();
  if (!config) {
    config = await prisma.systemConfig.create({
      data: { cameraIndex: 0, arThreshold: 1.5, transitionTime: 1.2, confirmSeconds: 1.5, twilioEnabled: false, escalationSeconds: 15 },
    });
  }
  return NextResponse.json(config);
}

export async function PUT(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  let config = await prisma.systemConfig.findFirst();

  if (!config) {
    config = await prisma.systemConfig.create({ data: body });
  } else {
    config = await prisma.systemConfig.update({ where: { id: config.id }, data: body });
  }
  return NextResponse.json(config);
}
