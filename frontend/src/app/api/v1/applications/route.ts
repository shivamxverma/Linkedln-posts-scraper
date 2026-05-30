import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resumeQueue } from "@/lib/queue";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/applications
 * Returns all active applications along with their associated job details.
 */
export async function GET() {
  try {
    const applications = await prisma.application.findMany({
      include: {
        job: true,
        resumeVersion: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({
      success: true,
      message: "Applications fetched successfully.",
      data: {
        applications,
      },
    }, { status: 200 });
  } catch (error) {
    console.error("[api:applications:get]", error);
    return NextResponse.json({
      success: false,
      message: "Failed to fetch applications.",
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}

/**
 * POST /api/v1/applications
 * Queues a new auto apply workflow for a specific jobId.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobId } = body;

    if (!jobId) {
      return NextResponse.json({
        success: false,
        message: "jobId is a required parameter.",
      }, { status: 400 });
    }

    // 1. Verify that the job posting exists
    const job = await prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      return NextResponse.json({
        success: false,
        message: `Job with ID "${jobId}" was not found in the database.`,
      }, { status: 404 });
    }

    // 2. Check if there is an active application for this job
    const existingApp = await prisma.application.findFirst({
      where: {
        jobId,
        status: {
          not: "FAILED", // Allow retrying failed applications
        },
      },
    });

    if (existingApp) {
      return NextResponse.json({
        success: false,
        message: `An application is already active or completed for this job (Status: ${existingApp.status}).`,
        data: {
          application: existingApp,
        },
      }, { status: 400 });
    }

    // 3. Create the new Application record
    console.log(`[API Applications] Creating application record for Job ID: ${jobId}`);
    const newApp = await prisma.application.create({
      data: {
        jobId,
        userId: "default-user",
        status: "QUEUED",
      },
    });

    // 4. Enqueue the task into BullMQ
    console.log(`[API Applications] Adding Application ID "${newApp.id}" to BullMQ resume queue...`);
    await resumeQueue.add(
      "resume-generation-task",
      { applicationId: newApp.id },
      {
        attempts: 1,
        removeOnComplete: true,
      }
    );

    return NextResponse.json({
      success: true,
      message: "Job application queued successfully. AI resume tailoring initiated.",
      data: {
        application: newApp,
      },
    }, { status: 201 });
  } catch (error) {
    console.error("[api:applications:post]", error);
    return NextResponse.json({
      success: false,
      message: "Failed to queue application.",
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
