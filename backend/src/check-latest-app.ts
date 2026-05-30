import { prisma } from "./services/prisma.js";

async function main() {
  try {
    const app = await prisma.application.findFirst({
      orderBy: { createdAt: "desc" },
      include: { job: true },
    });
    console.log("Latest Application Status:");
    console.log(JSON.stringify(app, null, 2));
  } catch (error) {
    console.error("DB check failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
