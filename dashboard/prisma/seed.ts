import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminPass = await bcrypt.hash("admin123", 10);
  const respPass = await bcrypt.hash("resp123", 10);

  await prisma.user.upsert({
    where: { email: "admin@guardian.com" },
    update: {},
    create: {
      name: "Admin",
      email: "admin@guardian.com",
      password: adminPass,
      role: "ADMIN",
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { email: "responder@guardian.com" },
    update: {},
    create: {
      name: "Responder One",
      email: "responder@guardian.com",
      password: respPass,
      role: "RESPONDER",
      isActive: true,
    },
  });

  const existingConfig = await prisma.systemConfig.findFirst();
  if (!existingConfig) {
    await prisma.systemConfig.create({
      data: {
        cameraIndex: 0,
        arThreshold: 1.5,
        transitionTime: 1.2,
        confirmSeconds: 1.5,
        twilioEnabled: false,
        escalationSeconds: 15,
      },
    });
  }

  console.log("✅ Seed complete");
  console.log("   admin@guardian.com / admin123");
  console.log("   responder@guardian.com / resp123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
