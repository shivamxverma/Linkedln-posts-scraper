import { NextResponse } from "next/server";

import { listJobs } from "@/lib/jobs-service";
import type { JobsErrorResponse, JobsResponse } from "@/types/job";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const jobs = await listJobs();

    const response: JobsResponse = {
      success: true,
      message: "Jobs fetched successfully.",
      data: {
        jobs,
      },
      meta: {
        total: jobs.length,
        fetchedAt: new Date().toISOString(),
      },
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error("[jobs:get]", error);

    const response: JobsErrorResponse = {
      success: false,
      message: "Failed to fetch jobs.",
    };

    return NextResponse.json(response, { status: 500 });
  }
}
