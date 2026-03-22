import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - 7);
  const monthStart = new Date(now); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

  const [fallsToday, fallsWeek, fallsMonth, totalIncidents, recentIncidents, allIncidents] =
    await Promise.all([
      prisma.incident.count({ where: { type: "FALL", createdAt: { gte: dayStart } } }),
      prisma.incident.count({ where: { type: "FALL", createdAt: { gte: weekStart } } }),
      prisma.incident.count({ where: { type: "FALL", createdAt: { gte: monthStart } } }),
      prisma.incident.count(),
      prisma.incident.findMany({
        take: 10,
        orderBy: { createdAt: "desc" },
        include: { user: { select: { name: true } } },
      }),
      prisma.incident.findMany({
        where: { createdAt: { gte: weekStart } },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true, type: true, acknowledgedAt: true },
      }),
    ]);

  // Falls per day (last 7 days)
  const fallsPerDay: Record<string, number> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    fallsPerDay[d.toLocaleDateString("en-US", { month: "short", day: "numeric" })] = 0;
  }
  allIncidents.forEach((inc) => {
    if (inc.type !== "FALL") return;
    const key = inc.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    if (key in fallsPerDay) fallsPerDay[key]++;
  });

  // Response times (acknowledged incidents)
  const responseTimes = allIncidents
    .filter((i) => i.acknowledgedAt)
    .map((i) => ({
      date: i.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      seconds: Math.round((i.acknowledgedAt!.getTime() - i.createdAt.getTime()) / 1000),
    }));

  const avgResponseTime =
    responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, b) => a + b.seconds, 0) / responseTimes.length)
      : 0;

  // Type breakdown
  const fallCount = allIncidents.filter((i) => i.type === "FALL").length;
  const sosCount = allIncidents.filter((i) => i.type === "SOS").length;

  return NextResponse.json({
    fallsToday,
    fallsWeek,
    fallsMonth,
    totalIncidents,
    avgResponseTime,
    recentIncidents,
    fallsPerDayChart: Object.entries(fallsPerDay).map(([date, count]) => ({ date, count })),
    responseTimeChart: responseTimes.slice(-14),
    typeBreakdown: [
      { name: "Fall", value: fallCount },
      { name: "SOS", value: sosCount },
    ],
  });
}
