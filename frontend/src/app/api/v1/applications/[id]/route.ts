import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/applications/[id]
 * Returns full status and linked files/details for a single application ID.
 * Highly useful for dynamic frontend polling.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const application = await prisma.application.findUnique({
      where: { id },
      include: {
        job: true,
        resumeVersion: true,
      },
    });

    if (!application) {
      return NextResponse.json({
        success: false,
        message: `Application with ID "${id}" was not found.`,
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: "Application fetched successfully.",
      data: {
        application,
      },
    }, { status: 200 });
  } catch (error) {
    console.error("[api:applications:id:get]", error);
    return NextResponse.json({
      success: false,
      message: "Failed to fetch application details.",
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
