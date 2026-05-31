import { Router, Request, Response } from "express";
import { prisma } from "../services/prisma.js";
import { GeminiService } from "../services/gemini.service.js";
import { EmailService } from "../services/email.service.js";

export const outreachRouter = Router();
const geminiService = new GeminiService();
const emailService = new EmailService();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 1. Add Recruiter Leads (Single or Bulk)
 * POST /outreach/leads
 */
outreachRouter.post("/outreach/leads", async (req: Request, res: Response): Promise<void> => {
  try {
    const { leads } = req.body; // Expects array of leads or a single lead object

    if (!leads) {
      res.status(400).json({ success: false, message: "Missing leads data." });
      return;
    }

    const leadsArray = Array.isArray(leads) ? leads : [leads];

    // Validate structure of input leads
    const validatedLeads = [];
    for (const lead of leadsArray) {
      const { companyName, recipientEmail, jobDescription } = lead;
      if (!companyName || !recipientEmail || !jobDescription) {
        res.status(400).json({
          success: false,
          message: "Each lead must have companyName, recipientEmail, and jobDescription.",
        });
        return;
      }
      validatedLeads.push({
        companyName: companyName.trim(),
        recipientEmail: recipientEmail.trim().toLowerCase(),
        jobDescription: jobDescription.trim(),
        status: "READY",
      });
    }

    // Create many in DB
    const createdLeads = await prisma.$transaction(
      validatedLeads.map((l) =>
        prisma.lead.create({
          data: {
            companyName: l.companyName,
            recipientEmail: l.recipientEmail,
            jobDescription: l.jobDescription,
            status: l.status,
          },
        })
      )
    );

    res.status(201).json({
      success: true,
      message: `Successfully added ${createdLeads.length} lead(s).`,
      data: createdLeads,
    });
  } catch (error) {
    console.error("[Outreach Router] Error adding leads:", error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * 1.5 Extract Lead details from Image
 * POST /outreach/leads/extract-image
 */
outreachRouter.post("/outreach/leads/extract-image", async (req: Request, res: Response): Promise<void> => {
  try {
    const { image, mimeType } = req.body;

    if (!image || !mimeType) {
      res.status(400).json({ success: false, message: "Missing base64 image or mimeType." });
      return;
    }

    // Clean base64 string if it contains prefix data:image/...;base64,
    let base64Data = image;
    if (image.includes("base64,")) {
      base64Data = image.split("base64,")[1];
    }

    console.log("[Outreach Router] Calling Gemini to extract lead details from image...");
    const extracted = await geminiService.extractLeadFromImage(base64Data, mimeType);

    res.status(200).json({
      success: true,
      message: "Successfully extracted lead details from image.",
      data: extracted,
    });
  } catch (error) {
    console.error("[Outreach Router] Error extracting lead from image:", error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * 2. Get All Leads with Message History
 * GET /outreach/leads
 */
outreachRouter.get("/outreach/leads", async (req: Request, res: Response) => {
  try {
    const leads = await prisma.lead.findMany({
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.status(200).json({ success: true, data: leads });
  } catch (error) {
    console.error("[Outreach Router] Error fetching leads:", error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * 3. Delete Lead
 * DELETE /outreach/leads/:id
 */
outreachRouter.delete("/outreach/leads/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };

    await prisma.lead.delete({
      where: { id },
    });

    res.status(200).json({ success: true, message: "Lead successfully deleted." });
  } catch (error) {
    console.error("[Outreach Router] Error deleting lead:", error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * 4. Save Edits to an Email Message
 * PATCH /outreach/messages/:id
 */
outreachRouter.patch("/outreach/messages/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const { subject, body } = req.body;

    if (!subject || !body) {
      res.status(400).json({ success: false, message: "Subject and body are required." });
      return;
    }

    const updatedMessage = await prisma.message.update({
      where: { id },
      data: { subject, body },
    });

    res.status(200).json({
      success: true,
      message: "Email message saved successfully.",
      data: updatedMessage,
    });
  } catch (error) {
    console.error("[Outreach Router] Error editing message:", error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * 5. Generate Cold Emails for All Leads
 * POST /outreach/generate-all
 */
outreachRouter.post("/outreach/generate-all", async (req: Request, res: Response) => {
  try {
    // Find all leads who don't have an INITIAL email message yet
    const leads = await prisma.lead.findMany({
      include: {
        messages: {
          where: { type: "INITIAL" },
        },
      },
    });

    const pendingLeads = leads.filter((l) => l.messages.length === 0);

    if (pendingLeads.length === 0) {
      res.status(200).json({
        success: true,
        message: "All existing leads already have generated initial cold emails.",
      });
      return;
    }

    console.log(`[Outreach Router] Starting bulk generation for ${pendingLeads.length} lead(s)...`);
    let successCount = 0;
    let failCount = 0;

    for (const lead of pendingLeads) {
      try {
        const generated = await geminiService.generateInitialEmail(
          lead.companyName,
          lead.jobDescription
        );

        await prisma.message.create({
          data: {
            leadId: lead.id,
            type: "INITIAL",
            subject: generated.subject,
            body: generated.body,
          },
        });

        // Set status to READY (if not already)
        await prisma.lead.update({
          where: { id: lead.id },
          data: { status: "READY" },
        });

        successCount++;
      } catch (err) {
        console.error(`[Outreach Router] Failed email generation for lead ${lead.companyName}:`, err);
        // Mark lead status as FAILED so user knows generation went wrong
        await prisma.lead.update({
          where: { id: lead.id },
          data: { status: "FAILED" },
        });
        failCount++;
      }
    }

    res.status(200).json({
      success: true,
      message: `Cold email generation complete. Success: ${successCount}, Failed: ${failCount}`,
    });
  } catch (error) {
    console.error("[Outreach Router] Bulk email generation crash:", error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * 6. Send a Single Specific Email Immediately
 * POST /outreach/send/:id (Sends message directly by message ID, or INITIAL email of lead by lead ID)
 */
outreachRouter.post("/outreach/send/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };

    // Check if ID is a message ID or a lead ID
    let activeMessage = (await prisma.message.findUnique({
      where: { id },
      include: { lead: true },
    })) as any;

    if (!activeMessage) {
      // Try treating it as a lead ID and fetching its latest unsent message
      const lead = (await prisma.lead.findUnique({
        where: { id },
        include: {
          messages: {
            orderBy: { createdAt: "desc" },
          },
        },
      })) as any;

      if (!lead || lead.messages.length === 0) {
        res.status(404).json({ success: false, message: "Lead or unsent message not found." });
        return;
      }

      // Grab the latest unsent message
      const unsent = lead.messages.find((m: any) => !m.sentAt);
      if (!unsent) {
        res.status(400).json({ success: false, message: "No unsent email message found for this lead." });
        return;
      }
      activeMessage = { ...unsent, lead };
    }

    const lead = activeMessage.lead;

    // Mark status as SENDING
    await prisma.lead.update({
      where: { id: lead.id },
      data: { status: "SENDING" },
    });

    try {
      await emailService.sendEmail(lead.recipientEmail, activeMessage.subject, activeMessage.body);

      // Update message as sent
      await prisma.message.update({
        where: { id: activeMessage.id },
        data: { sentAt: new Date() },
      });

      // Update lead status to SENT or the specific follow-up stage
      await prisma.lead.update({
        where: { id: lead.id },
        data: { status: "SENT" },
      });

      res.status(200).json({ success: true, message: "Email sent successfully." });
    } catch (err) {
      console.error("[Outreach Router] Send failed:", err);
      await prisma.lead.update({
        where: { id: lead.id },
        data: { status: "FAILED" },
      });
      res.status(500).json({ success: false, message: "SMTP Transmission failed.", error: String(err) });
    }
  } catch (error) {
    console.error("[Outreach Router] Error during single send:", error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * 7. Send All READY Initial Emails Sequentially
 * POST /outreach/send-all
 */
outreachRouter.post("/outreach/send-all", async (req: Request, res: Response): Promise<void> => {
  try {
    // Find all leads whose status is READY, and who have an unsent INITIAL email message
    const leads = await prisma.lead.findMany({
      where: {
        status: { in: ["READY", "FAILED"] },
      },
      include: {
        messages: {
          where: {
            type: "INITIAL",
            sentAt: null,
          },
        },
      },
    });

    const activeLeads = leads.filter((l) => l.messages.length > 0);

    if (activeLeads.length === 0) {
      res.status(200).json({
        success: true,
        message: "No unsent INITIAL emails ready to send.",
      });
      return;
    }

    console.log(`[Outreach Router] Sequential sending triggered for ${activeLeads.length} emails...`);

    // Run execution in background, immediately return 202 to client to avoid HTTP timeouts
    res.status(202).json({
      success: true,
      message: `Sequentially sending ${activeLeads.length} cold emails. Statuses are updating in real-time.`,
    });

    // Background job process
    (async () => {
      for (let i = 0; i < activeLeads.length; i++) {
        const lead = activeLeads[i];
        const message = lead.messages[0];

        try {
          // Update status to SENDING
          await prisma.lead.update({
            where: { id: lead.id },
            data: { status: "SENDING" },
          });

          // Transmit email
          await emailService.sendEmail(lead.recipientEmail, message.subject, message.body);

          // Mark message as sent
          await prisma.message.update({
            where: { id: message.id },
            data: { sentAt: new Date() },
          });

          // Mark lead as SENT
          await prisma.lead.update({
            where: { id: lead.id },
            data: { status: "SENT" },
          });
        } catch (err) {
          console.error(`[Outreach Router] Sequential send failed for ${lead.companyName}:`, err);
          await prisma.lead.update({
            where: { id: lead.id },
            data: { status: "FAILED" },
          });
        }

        // Wait 2-5 seconds if there are remaining emails to protect SMTP reputation
        if (i < activeLeads.length - 1) {
          const delay = 2000 + Math.random() * 3000;
          console.log(`[Outreach Router] Pausing for ${Math.round(delay)}ms before next email...`);
          await sleep(delay);
        }
      }
      console.log("[Outreach Router] Sequential cold outreach sending finished.");
    })().catch((err) => console.error("[Outreach Router] Critical sequential sending background exception:", err));

  } catch (error) {
    console.error("[Outreach Router] Send-all setup crash:", error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * 8. Generate Manual Follow-ups for Selected Leads
 * POST /outreach/followups/generate
 */
outreachRouter.post("/outreach/followups/generate", async (req: Request, res: Response): Promise<void> => {
  try {
    const { leadIds } = req.body; // Expects array of leadIds

    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      res.status(400).json({ success: false, message: "Missing or invalid leadIds array." });
      return;
    }

    console.log(`[Outreach Router] Starting manual follow-up generation for ${leadIds.length} lead(s)...`);
    let successCount = 0;
    let failCount = 0;

    for (const leadId of leadIds) {
      try {
        const lead = await prisma.lead.findUnique({
          where: { id: leadId },
          include: { messages: true },
        });

        if (!lead) {
          console.warn(`[Outreach Router] Lead ${leadId} not found.`);
          failCount++;
          continue;
        }

        // Load all previous sent emails for prompt context
        const sentMessages = lead.messages.filter((m) => m.sentAt);
        const initialEmail = sentMessages.find((m) => m.type === "INITIAL");

        if (!initialEmail) {
          console.warn(`[Outreach Router] Lead ${lead.companyName} has not been sent an INITIAL email yet. Skipping.`);
          failCount++;
          continue;
        }

        const previousFollowups = sentMessages
          .filter((m) => m.type.startsWith("FOLLOWUP_"))
          .map((m) => m.body);

        const followupNumber = previousFollowups.length + 1; // 1, 2, or 3
        const followupType = `FOLLOWUP_${followupNumber}`;

        // Check if follow-up of this number is already generated but unsent
        const alreadyGenerated = lead.messages.find((m) => m.type === followupType && !m.sentAt);
        if (alreadyGenerated) {
          console.log(`[Outreach Router] Follow-up ${followupType} already exists for ${lead.companyName}. Skipping.`);
          successCount++;
          continue;
        }

        // Call Gemini for the follow-up text
        const generated = await geminiService.generateFollowUpEmail(
          lead.companyName,
          lead.jobDescription,
          initialEmail.body,
          previousFollowups,
          followupNumber
        );

        // Store follow-up in DB
        await prisma.message.create({
          data: {
            leadId: lead.id,
            type: followupType,
            subject: generated.subject,
            body: generated.body,
          },
        });

        // Set status to READY
        await prisma.lead.update({
          where: { id: lead.id },
          data: { status: "READY" },
        });

        successCount++;
      } catch (err) {
        console.error(`[Outreach Router] Failed follow-up generation for lead ID ${leadId}:`, err);
        failCount++;
      }
    }

    res.status(200).json({
      success: true,
      message: `Follow-up generation complete. Success: ${successCount}, Failed: ${failCount}`,
    });
  } catch (error) {
    console.error("[Outreach Router] Follow-ups generation crash:", error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

/**
 * 9. Send Selected Unsent Follow-up Emails
 * POST /outreach/followups/send
 */
outreachRouter.post("/outreach/followups/send", async (req: Request, res: Response): Promise<void> => {
  try {
    const { leadIds } = req.body;

    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      res.status(400).json({ success: false, message: "Missing or invalid leadIds array." });
      return;
    }

    // Find all follow-ups that are unsent for the requested leadIds
    const leads = await prisma.lead.findMany({
      where: {
        id: { in: leadIds },
      },
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    const sendableList = [];
    for (const lead of leads) {
      const unsentFollowup = lead.messages.find((m) => m.type.startsWith("FOLLOWUP_") && !m.sentAt);
      if (unsentFollowup) {
        sendableList.push({ lead, message: unsentFollowup });
      }
    }

    if (sendableList.length === 0) {
      res.status(200).json({ success: true, message: "No unsent follow-up emails found for selected leads." });
      return;
    }

    res.status(202).json({
      success: true,
      message: `Sequentially sending ${sendableList.length} follow-up email(s).`,
    });

    // Run background queue
    (async () => {
      for (let i = 0; i < sendableList.length; i++) {
        const { lead, message } = sendableList[i];

        try {
          await prisma.lead.update({
            where: { id: lead.id },
            data: { status: "SENDING" },
          });

          await emailService.sendEmail(lead.recipientEmail, message.subject, message.body);

          await prisma.message.update({
            where: { id: message.id },
            data: { sentAt: new Date() },
          });

          await prisma.lead.update({
            where: { id: lead.id },
            data: { status: "SENT" },
          });
        } catch (err) {
          console.error(`[Outreach Router] Sequential send failed for followup at ${lead.companyName}:`, err);
          await prisma.lead.update({
            where: { id: lead.id },
            data: { status: "FAILED" },
          });
        }

        // Delay between mails
        if (i < sendableList.length - 1) {
          const delay = 2000 + Math.random() * 3000;
          await sleep(delay);
        }
      }
      console.log("[Outreach Router] Sequential follow-up email sending finished.");
    })().catch((err) => console.error("[Outreach Router] Background sequential followup sending crash:", err));

  } catch (error) {
    console.error("[Outreach Router] Send-followups setup crash:", error);
    res.status(500).json({ success: false, error: String(error) });
  }
});
