import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";

const DETECTION_API = (process.env.NEXT_PUBLIC_DETECTION_WS_URL ?? "ws://localhost:8765/ws")
  .replace("ws://", "http://")
  .replace("/ws", "");

const DEFAULT_CONFIG = {
  cameraIndex: 0,
  arThreshold: 1.5,
  transitionTime: 1.5,
  confirmSeconds: 1.5,
  escalationSeconds: 15,
  fallVelThreshold: 0.30,
  sleepVelThreshold: 0.20,
  poseSpineFallen: 45.0,
  recoveryLabelTime: 0.5,
  movementThreshold: 10,
};

async function requireAdmin() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") return null;
  return session;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let config = await prisma.systemConfig.findFirst();
  if (!config) {
    config = await prisma.systemConfig.create({ data: DEFAULT_CONFIG });
  }
  return NextResponse.json(config);
}

export async function PUT(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  let config = await prisma.systemConfig.findFirst();
  if (!config) {
    config = await prisma.systemConfig.create({ data: { ...DEFAULT_CONFIG, ...body } });
  } else {
    config = await prisma.systemConfig.update({ where: { id: config.id }, data: body });
  }
  // Forward to FastAPI so thresholds apply immediately without restart
  fetch(`${DETECTION_API}/config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  }).catch(() => {});
  return NextResponse.json(config);
}
