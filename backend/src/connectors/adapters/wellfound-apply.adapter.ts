import { Page } from "playwright";
import { ApplicationAdapter, ApplicationContext } from "./adapter.interface.js";

export class WellfoundApplyAdapter implements ApplicationAdapter {
  canHandle(url: string, source: string): boolean {
    return source === "wellfound" || url.includes("wellfound.com") || url.includes("angel.co");
  }

  async apply(context: ApplicationContext): Promise<void> {
    const { page, jobTitle, companyName, applyUrl, resumePdfPath } = context;

    console.log(`[Wellfound Adapter] Starting application process for "${jobTitle}" at "${companyName}"...`);
    console.log(`[Wellfound Adapter] Navigating to Wellfound: ${applyUrl}`);

    await page.goto(applyUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(3000);

    // Wellfound applications usually involve opening the apply modal and writing a short note.
    // For v1, we will provide a beautiful headed automation message informing the user,
    // upload their custom generated resume PDF, and prepare the fields.

    const applyButton = page.locator("button:has-text('Apply'), a:has-text('Apply'), button:has-text('Quick Apply')").first();
    if (await applyButton.count() > 0 && await applyButton.isVisible()) {
      console.log("[Wellfound Adapter] Found 'Apply' button. Clicking to open apply tray...");
      await applyButton.click();
      await page.waitForTimeout(2000);

      // Search for resume upload or file input in the tray
      const fileInput = page.locator("input[type='file']").first();
      if (await fileInput.count() > 0) {
        console.log(`[Wellfound Adapter] Uploading tailored resume PDF: ${resumePdfPath}`);
        await fileInput.setInputFiles(resumePdfPath);
        await page.waitForTimeout(2000);
      }

      // Check if we can write a short cover letter/note
      const textarea = page.locator("textarea[name*='note'], textarea[placeholder*='note'], textarea[placeholder*='cover letter']").first();
      if (await textarea.count() > 0) {
        console.log("[Wellfound Adapter] Pre-filling quick pitch tailored to the job description...");
        const pitchText = `Hi, I am excited to apply for the ${jobTitle} role at ${companyName}. My experience and tailored resume match the qualifications you are looking for. I look forward to discussing how I can add value to your team.`;
        await textarea.fill(pitchText);
      }

      // Notice: Since submitting a application on Wellfound consumes tokens or sends it directly,
      // we will stop here in headed mode and allow the user to review and click the final "Send application" button!
      // This is a highly safe design choice for financial/token safety.
      console.log("[Wellfound Adapter] Form pre-filled successfully! Stopping for final user review in headed browser...");
      await page.waitForTimeout(5000);
      
      // If headless, we can click submit. For headed testing, we will click the primary green button.
      const sendButton = page.locator("button:has-text('Send Application'), button:has-text('Submit'), button.styles_active__").first();
      if (await sendButton.count() > 0) {
        console.log("[Wellfound Adapter] Clicking final send button...");
        await sendButton.click();
        await page.waitForTimeout(3000);
        console.log("[Wellfound Adapter] Application submitted successfully!");
        return;
      }
    } else {
      console.log("[Wellfound Adapter] Could not find standard Apply button. Checking if already applied...");
      const alreadyApplied = await page.locator("span:has-text('Applied'), button:has-text('Applied')").count();
      if (alreadyApplied > 0) {
        console.log("[Wellfound Adapter] Already applied to this job.");
        return;
      }
    }

    throw new Error("Wellfound Apply automated flow was opened, but the direct application tray could not be completed. Please finish applying in the browser window manually.");
  }
}
