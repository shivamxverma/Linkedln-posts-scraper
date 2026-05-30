import { prisma } from "./services/prisma.js";

async function main() {
  try {
    const app = await prisma.application.findUnique({
      where: { id: "cmps50ei8000nurlxtj89z60x" },
      include: { job: true },
    });
    console.log("Current Application Status:");
    console.log(JSON.stringify(app, null, 2));
  } catch (error) {
    console.error("DB check failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
