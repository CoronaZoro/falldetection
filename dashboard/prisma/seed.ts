import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminPass = await bcrypt.hash("admin123", 10);
  const resp1Pass = await bcrypt.hash("resp123", 10);
  const demo1Pass = await bcrypt.hash("demo123", 10);
  const demo2Pass = await bcrypt.hash("demo123", 10);

  await prisma.user.upsert({
    where: { email: "admin@guardian.com" },
    update: {},
    create: {
      name: "Admin",
      email: "admin@guardian.com",
      password: adminPass,
      role: "ADMIN",
      isAuthorized: false,
      isActive: true,
    },
  });

  // Primary authorized responder — healthcare provider
  await prisma.user.upsert({
    where: { email: "responder@guardian.com" },
    update: {},
    create: {
      name: "Responder One",
      email: "responder@guardian.com",
      password: resp1Pass,
      role: "RESPONDER",
      isAuthorized: true,
      phone: "+66-81-000-0001",
      isActive: true,
    },
  });

  // Demo: authorized nurse — set lineId to a real LINE user ID to enable LINE alerts
  await prisma.user.upsert({
    where: { email: "nurse.demo@guardian.com" },
    update: {},
    create: {
      name: "Nurse Demo",
      email: "nurse.demo@guardian.com",
      password: demo1Pass,
      role: "RESPONDER",
      isAuthorized: true,
      phone: "+66-81-000-0002",
      lineId: null, // Set to your LINE user ID in admin → Users to enable LINE alerts
      isActive: true,
    },
  });

  // Demo: security guard — unauthorized bystander
  await prisma.user.upsert({
    where: { email: "guard.demo@guardian.com" },
    update: {},
    create: {
      name: "Guard Demo",
      email: "guard.demo@guardian.com",
      password: demo2Pass,
      role: "RESPONDER",
      isAuthorized: false,
      phone: "+66-81-000-0003",
      lineId: null,
      isActive: true,
    },
  });

  const existingConfig = await prisma.systemConfig.findFirst();
  if (!existingConfig) {
    await prisma.systemConfig.create({
      data: {
        location: "Guardian Monitoring Station",
        cameraIndex: 0,
        arThreshold: 1.5,
        transitionTime: 1.2,
        confirmSeconds: 1.5,
        escalationSeconds: 15,
        fallVelThreshold: 0.3,
        sleepVelThreshold: 0.2,
        poseSpineFallen: 45.0,
        recoveryLabelTime: 0.5,
        movementThreshold: 10,
      },
    });
  }

  console.log("✅ Seed complete");
  console.log("   admin@guardian.com         / admin123  (ADMIN)");
  console.log(
    "   responder@guardian.com     / resp123   (RESPONDER, AUTHORIZED)",
  );
  console.log(
    "   nurse.demo@guardian.com    / demo123   (RESPONDER, AUTHORIZED — demo)",
  );
  console.log(
    "   guard.demo@guardian.com    / demo123   (RESPONDER, UNAUTHORIZED — demo)",
  );
  console.log("");
  console.log("   💡 Set lineId in Admin → Users to enable LINE fall alerts");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
