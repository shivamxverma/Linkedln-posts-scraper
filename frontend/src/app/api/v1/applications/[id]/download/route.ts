import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as fs from "fs";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/applications/[id]/download?type=pdf|latex
 * Reads the tailored resume PDF or LaTeX source code from the local storage
 * and streams it directly to the client browser for downloading.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const id = params.id;
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "pdf"; // default to pdf

    // 1. Fetch the application and linked resume version
    const application = await prisma.application.findUnique({
      where: { id },
      include: {
        resumeVersion: true,
      },
    });

    if (!application) {
      return NextResponse.json({
        success: false,
        message: `Application with ID "${id}" was not found.`,
      }, { status: 404 });
    }

    if (!application.resumeVersion) {
      return NextResponse.json({
        success: false,
        message: "No resume version is linked to this application. Tailoring might still be in progress.",
      }, { status: 400 });
    }

    // 2. Resolve the target file path
    const filePath = type === "latex" 
      ? application.resumeVersion.latexPath 
      : application.resumeVersion.pdfPath;

    if (!filePath || !fs.existsSync(filePath)) {
      console.error(`[Download API] File not found at path: ${filePath}`);
      return NextResponse.json({
        success: false,
        message: `The requested resume file (${type}) was not found in storage.`,
      }, { status: 404 });
    }

    // 3. Read the file into a buffer
    const fileBuffer = fs.readFileSync(filePath);

    // 4. Set headers based on file type
    const headers = new Headers();
    if (type === "latex") {
      headers.set("Content-Type", "application/x-latex");
      headers.set("Content-Disposition", `attachment; filename="tailored-resume-${id}.tex"`);
    } else {
      headers.set("Content-Type", "application/pdf");
      headers.set("Content-Disposition", `attachment; filename="tailored-resume-${id}.pdf"`);
    }

    return new NextResponse(fileBuffer, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("[api:applications:id:download:get]", error);
    return NextResponse.json({
      success: false,
      message: "Failed to download tailored resume file.",
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
