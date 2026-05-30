import { prisma } from "./services/prisma.js";

async function main() {
  try {
    const locations = await prisma.job.groupBy({
      by: ['location'],
      _count: {
        id: true,
      },
    });

    console.log("=== UNIQUE LOCATIONS ===");
    locations.sort((a, b) => b._count.id - a._count.id);
    locations.forEach((loc, index) => {
      if (index < 50) {
        console.log(`${index + 1}. Location: "${loc.location}" - Count: ${loc._count.id}`);
      }
    });

    const indiaJobs = await prisma.job.count({
      where: {
        location: {
          contains: 'India',
          mode: 'insensitive',
        },
      },
    });

    console.log("\nTotal Jobs:", await prisma.job.count());
    console.log("Jobs containing 'India':", indiaJobs);
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
