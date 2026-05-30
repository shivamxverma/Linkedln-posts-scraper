import { Page } from "playwright";
import { ApplicationAdapter, ApplicationContext } from "./adapter.interface.js";
import * as fs from "fs";

export class LinkedinApplyAdapter implements ApplicationAdapter {
  canHandle(url: string, source: string): boolean {
    return source === "linkedin" || url.includes("linkedin.com");
  }

  async apply(context: ApplicationContext): Promise<void> {
    const { page, jobTitle, companyName, applyUrl, resumePdfPath } = context;

    console.log(`[LinkedIn Adapter] Starting application for "${jobTitle}" at "${companyName}"`);
    console.log(`[LinkedIn Adapter] Navigating to job page: ${applyUrl}`);

    await page.goto(applyUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

    // Wait a brief moment to ensure full render
    await page.waitForTimeout(3000);

    // 1. Locate the Easy Apply button
    const easyApplyButton = await this.findEasyApplyButton(page);
    if (!easyApplyButton) {
      // Check if already applied
      const alreadyApplied = await page.locator("span:has-text('Applied'), button:has-text('Applied')").count();
      if (alreadyApplied > 0) {
        console.log(`[LinkedIn Adapter] Job already applied to! Marking as success.`);
        return;
      }

      throw new Error("Could not find 'Easy Apply' button on this LinkedIn job posting. It might require an external application or is no longer accepting submissions.");
    }

    console.log("[LinkedIn Adapter] Found 'Easy Apply' button! Clicking to open application modal...");
    await easyApplyButton.click();

    // 2. Wait for the application modal to appear
    await page.waitForSelector("div[role='dialog']", { timeout: 15000 });
    console.log("[LinkedIn Adapter] Application dialog opened. Starting application steps...");

    let steps = 0;
    const maxSteps = 15; // Prevent infinite loops in case of dynamic forms

    while (steps < maxSteps) {
      steps++;
      console.log(`[LinkedIn Adapter] Processing step ${steps}...`);

      // Add a slight delay for modal transitions
      await page.waitForTimeout(1500);

      // Check for success screen
      const isSuccess = await this.checkSuccessScreen(page);
      if (isSuccess) {
        console.log("[LinkedIn Adapter] Application submitted successfully!");
        return;
      }

      // Check if we need to upload the resume in the current step
      await this.handleResumeUpload(page, resumePdfPath);

      // Answer screening questions
      await this.answerScreeningQuestions(page);

      // Locate navigation buttons (Next, Review, Submit, etc.)
      const nextButton = await page.locator("button:has-text('Next'), button:has-text('Review'), button:has-text('Submit application')").first();
      
      if (await nextButton.count() === 0) {
        console.log("[LinkedIn Adapter] No navigation button found. Checking if there is a 'Submit' or closing action.");
        // Try to close modal and finish if no buttons but success was reached
        break;
      }

      const buttonText = (await nextButton.textContent()) || "";
      console.log(`[LinkedIn Adapter] Clicking button: "${buttonText.trim()}"`);

      await nextButton.click();

      // If it was "Submit application", we are done! Wait for success or confirmation screen
      if (buttonText.toLowerCase().includes("submit")) {
        console.log("[LinkedIn Adapter] Clicked submit. Waiting for confirmation screen...");
        await page.waitForTimeout(3000);
        return;
      }
    }

    // Verify if we finished successfully
    const finalSuccess = await this.checkSuccessScreen(page);
    if (finalSuccess) {
      console.log("[LinkedIn Adapter] Final check: Application submitted successfully!");
    } else {
      throw new Error(`LinkedIn application flow exceeded maximum step count (${maxSteps}) without confirming submission.`);
    }
  }

  /**
   * Helper to find Easy Apply button
   */
  private async findEasyApplyButton(page: Page) {
    const selectors = [
      "button.jobs-apply-button", // standard LinkedIn apply button
      "button:has-text('Easy Apply')",
      "button:has-text('Easy apply')",
      ".jobs-apply-button--top-card button"
    ];

    for (const selector of selectors) {
      const btn = page.locator(selector).first();
      if (await btn.count() > 0 && await btn.isVisible() && await btn.isEnabled()) {
        return btn;
      }
    }
    return null;
  }

  /**
   * Check if we are on the final success/confirmation screen
   */
  private async checkSuccessScreen(page: Page): Promise<boolean> {
    const successTexts = [
      "Application sent",
      "Your application was sent to",
      "Success!",
      "Congratulations",
      "Done",
      "applied"
    ];

    for (const text of successTexts) {
      // Look for these phrases inside the dialog or header
      const match = page.locator(`div[role='dialog'] h3:has-text('${text}'), div[role='dialog'] h2:has-text('${text}'), div[role='dialog'] span:has-text('${text}')`).first();
      if (await match.count() > 0) {
        return true;
      }
    }
    return false;
  }

  /**
   * Uploads the resume PDF if the current step requires it
   */
  private async handleResumeUpload(page: Page, resumePath: string): Promise<void> {
    const fileInput = page.locator("input[type='file']").first();
    if (await fileInput.count() > 0) {
      console.log(`[LinkedIn Adapter] Resume upload field detected. Uploading tailored resume: ${resumePath}`);
      
      // Upload the PDF
      await fileInput.setInputFiles(resumePath);
      
      // Wait for any progress bar or upload indicator to finish
      await page.waitForTimeout(3000);
    }
  }

  /**
   * Answers basic screening questions using a smart rules-based engine
   */
  private async answerScreeningQuestions(page: Page): Promise<void> {
    // 1. Fill standard text fields (e.g. Phone number, Years of Experience, Salary)
    const textFields = page.locator("input[type='text'], textarea");
    const textFieldCount = await textFields.count();

    for (let i = 0; i < textFieldCount; i++) {
      const field = textFields.nth(i);
      const id = (await field.getAttribute("id")) || "";
      
      // Fetch the label associated with this text field
      const labelElement = page.locator(`label[for='${id}']`).first();
      const labelText = (await labelElement.count()) > 0 ? (await labelElement.textContent()) || "" : "";
      const labelLower = labelText.toLowerCase() + " " + id.toLowerCase();
      
      const currentValue = (await field.inputValue()) || "";
      
      if (!currentValue) {
        if (labelLower.includes("phone") || labelLower.includes("mobile")) {
          console.log("[LinkedIn Adapter] Filling Phone number...");
          await field.fill("+1 (555) 019-2834"); // Standard mock phone number
        } else if (labelLower.includes("experience") || labelLower.includes("years")) {
          console.log("[LinkedIn Adapter] Answering Experience years question with '2'...");
          await field.fill("2");
        } else if (labelLower.includes("salary") || labelLower.includes("compensation")) {
          console.log("[LinkedIn Adapter] Answering Salary expectations question...");
          await field.fill("Open / Negotiable");
        } else {
          // Fallback to "Yes" or a default "2" if it's a numeric field
          const isNumeric = await field.getAttribute("type") === "number" || labelLower.includes("how many");
          await field.fill(isNumeric ? "2" : "Yes");
        }
      }
    }

    // 2. Select default options in standard dropdowns (select tags)
    const selects = page.locator("select");
    const selectCount = await selects.count();

    for (let i = 0; i < selectCount; i++) {
      const select = selects.nth(i);
      const id = (await select.getAttribute("id")) || "";
      const labelElement = page.locator(`label[for='${id}']`).first();
      const labelText = (await labelElement.count()) > 0 ? (await labelElement.textContent()) || "" : "";
      const labelLower = labelText.toLowerCase();

      // Check if a value is already selected (excluding the empty default option)
      const value = await select.inputValue();
      if (!value || value === "") {
        console.log(`[LinkedIn Adapter] Dropdown detected: "${labelText.trim()}". Selecting best match...`);
        
        // Auto select YES for work authorization
        if (labelLower.includes("authorized") || labelLower.includes("citizen") || labelLower.includes("work in")) {
          await select.selectOption({ label: "Yes" });
        } else if (labelLower.includes("sponsorship") || labelLower.includes("require visa")) {
          await select.selectOption({ label: "No" });
        } else if (labelLower.includes("proficiency") || labelLower.includes("english")) {
          await select.selectOption({ label: "Professional" });
        } else {
          // If no matching rule, select the first non-empty option
          const options = await select.locator("option").all();
          if (options.length > 1) {
            const firstValue = (await options[1].getAttribute("value")) || "";
            await select.selectOption({ value: firstValue });
          }
        }
      }
    }

    // 3. Select radio buttons (e.g. Yes/No questions)
    const fieldsets = page.locator("fieldset");
    const fieldsetCount = await fieldsets.count();

    for (let i = 0; i < fieldsetCount; i++) {
      const fieldset = fieldsets.nth(i);
      const legendElement = fieldset.locator("legend").first();
      const legendText = (await legendElement.count()) > 0 ? (await legendElement.textContent()) || "" : "";
      const legendLower = legendText.toLowerCase();

      // Check if any radio in this fieldset is already checked
      const checkedRadios = await fieldset.locator("input[type='radio']:checked").count();
      if (checkedRadios === 0) {
        console.log(`[LinkedIn Adapter] Radio panel detected: "${legendText.trim()}". Selecting best option...`);
        
        let targetText = "Yes";
        
        // Custom rules for standard YES/NO questions
        if (legendLower.includes("sponsorship") || legendLower.includes("require visa") || legendLower.includes("require sponsorship")) {
          targetText = "No"; // Do you require visa sponsorship? -> NO
        } else if (legendLower.includes("authorized") || legendLower.includes("eligible to work") || legendLower.includes("right to work")) {
          targetText = "Yes"; // Are you authorized to work? -> YES
        }

        const radioToClick = fieldset.locator(`label:has-text("${targetText}")`).first();
        if (await radioToClick.count() > 0) {
          await radioToClick.click();
        } else {
          // Fallback: click the first radio option
          const firstOption = fieldset.locator("input[type='radio']").first();
          if (await firstOption.count() > 0) {
            await firstOption.click();
          }
        }
      }
    }
  }
}
