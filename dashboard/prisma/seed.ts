import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminPass  = await bcrypt.hash("admin123", 10);
  const resp1Pass  = await bcrypt.hash("resp123",  10);
  const resp2Pass  = await bcrypt.hash("resp456",  10);

  await prisma.user.upsert({
    where:  { email: "admin@guardian.com" },
    update: {},
    create: {
      name:         "Admin",
      email:        "admin@guardian.com",
      password:     adminPass,
      role:         "ADMIN",
      isAuthorized: false,
      isActive:     true,
    },
  });

  // Authorized responder — healthcare provider, receives clinical guidance
  await prisma.user.upsert({
    where:  { email: "responder@guardian.com" },
    update: {},
    create: {
      name:         "Responder One",
      email:        "responder@guardian.com",
      password:     resp1Pass,
      role:         "RESPONDER",
      isAuthorized: true,
      isActive:     true,
    },
  });

  // Unauthorized responder — bystander, receives emergency contacts only
  await prisma.user.upsert({
    where:  { email: "responder2@guardian.com" },
    update: {},
    create: {
      name:         "Responder Two",
      email:        "responder2@guardian.com",
      password:     resp2Pass,
      role:         "RESPONDER",
      isAuthorized: false,
      isActive:     true,
    },
  });

  const existingConfig = await prisma.systemConfig.findFirst();
  if (!existingConfig) {
    await prisma.systemConfig.create({
      data: {
        cameraIndex:       0,
        arThreshold:       1.5,
        transitionTime:    1.2,
        confirmSeconds:    1.5,
        twilioEnabled:     false,
        escalationSeconds: 15,
      },
    });
  }

  console.log("✅ Seed complete");
  console.log("   admin@guardian.com       / admin123  (ADMIN)");
  console.log("   responder@guardian.com   / resp123   (RESPONDER, AUTHORIZED)");
  console.log("   responder2@guardian.com  / resp456   (RESPONDER, UNAUTHORIZED)");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
