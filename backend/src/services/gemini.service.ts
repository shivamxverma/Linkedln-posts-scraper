import OpenAI from "openai";
import * as fs from "fs";
import * as path from "path";
import { ResumeFetcherService } from "./resume-fetcher.service.js";

export interface GeneratedEmail {
  subject: string;
  body: string;
}

export class GeminiService {
  private openai: OpenAI | null = null;
  private resumeFetcher: ResumeFetcherService;
  private storageDir: string;

  constructor() {
    const geminiApiKey = process.env.GEMINI_API_KEY;
    this.resumeFetcher = new ResumeFetcherService();
    this.storageDir = path.resolve(process.cwd(), "storage");

    if (geminiApiKey) {
      console.log("[Gemini Service] Initializing OpenAI Client in Gemini Compatibility Mode...");
      this.openai = new OpenAI({
        apiKey: geminiApiKey,
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
      });
    } else {
      console.warn(
        "[Gemini Service] WARNING: GEMINI_API_KEY environment variable is not set. LLM features will fail."
      );
    }
  }

  /**
   * Helper to sleep if needed or handle potential delays
   */
  private async safeCall(promptTask: () => Promise<string>): Promise<string> {
    if (!this.openai) {
      throw new Error("Gemini API Client is not initialized. Please configure GEMINI_API_KEY in .env.");
    }
    return await promptTask();
  }

  /**
   * Safe parser for extracting JSON content from Gemini responses
   */
  private parseJsonResponse<T>(rawContent: string): T {
    try {
      // 1. Clean up potential markdown code block formatting
      let cleaned = rawContent.trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```(?:json)?\n?/i, "");
        cleaned = cleaned.replace(/\n?```$/i, "");
      }
      return JSON.parse(cleaned.trim()) as T;
    } catch (error) {
      console.error("[Gemini Service] Failed to parse JSON response. Raw output:", rawContent);
      throw new Error("Failed to parse AI response into structured email fields.");
    }
  }

  /**
   * Ensures that candidate's skills and projects are extracted and stored in `storage/`
   */
  async ensureSkillsAndProjects(): Promise<{ skills: string; projects: string }> {
    const skillsPath = path.join(this.storageDir, "skills.txt");
    const projectsPath = path.join(this.storageDir, "projects.txt");

    let skills = "";
    let projects = "";

    // Load if they already exist
    if (fs.existsSync(skillsPath) && fs.existsSync(projectsPath)) {
      skills = fs.readFileSync(skillsPath, "utf-8");
      projects = fs.readFileSync(projectsPath, "utf-8");
      console.log("[Gemini Service] Loaded skills and projects from storage cache.");
      return { skills, projects };
    }

    console.log("[Gemini Service] Cache missing. Fetching master resume to extract skills and projects...");
    const resumeData = await this.resumeFetcher.fetchMasterResume();
    
    if (!this.openai) {
      throw new Error("Gemini API is not initialized. Cannot extract resume parameters.");
    }

    // 1. Extract Skills
    console.log("[Gemini Service] Extracting skills from resume...");
    const skillsPrompt = `You are a professional ATS resume parsing assistant.
Analyze the following resume text and extract the candidate's complete technical skills profile (languages, frameworks, libraries, developer tools, databases, methodologies, cloud platforms).
Format them as a clean, bulleted or comma-separated list. Keep it concise.

Candidate Resume Text:
${resumeData.text}`;

    const skillsResponse = await this.openai.chat.completions.create({
      model: "gemini-2.5-flash",
      messages: [{ role: "user", content: skillsPrompt }],
      temperature: 0.1,
    });
    skills = skillsResponse.choices[0]?.message?.content || "";
    fs.writeFileSync(skillsPath, skills.trim(), "utf-8");
    console.log(`[Gemini Service] Saved extracted skills to: ${skillsPath}`);

    // 2. Extract Projects
    console.log("[Gemini Service] Extracting projects from resume...");
    const projectsPrompt = `You are a professional ATS resume parsing assistant.
Analyze the following resume text and extract all major technical projects the candidate built.
Include project names, technologies utilized, and key bullet points describing features or achievements.

Candidate Resume Text:
${resumeData.text}`;

    const projectsResponse = await this.openai.chat.completions.create({
      model: "gemini-2.5-flash",
      messages: [{ role: "user", content: projectsPrompt }],
      temperature: 0.1,
    });
    projects = projectsResponse.choices[0]?.message?.content || "";
    fs.writeFileSync(projectsPath, projects.trim(), "utf-8");
    console.log(`[Gemini Service] Saved extracted projects to: ${projectsPath}`);

    return { skills, projects };
  }

  /**
   * Generates a highly personalized initial cold email
   */
  async generateInitialEmail(
    companyName: string,
    jobDescription: string
  ): Promise<GeneratedEmail> {
    const resumeData = await this.resumeFetcher.fetchMasterResume();
    const { skills, projects } = await this.ensureSkillsAndProjects();

    const systemPrompt = `You are an elite talent representative and cold outreach copywriting expert.
Your goal is to write a highly compelling, professional, personalized cold email to a recruiter at a company.
Your email must grab the recruiter's attention, clearly connect the candidate's unique background to the role requirements, and propose a concise call to action.

STRICT CONSTRAINTS (VIOLATIONS ARE UNACCEPTABLE):
1. Write a professional, high-converting cold email.
2. Ground all experience, achievements, and technical credentials strictly in the candidate's Resume, Skills, and Projects. Do NOT hallucinate achievements, degrees, or certifications.
3. Keep the email copy concise, engaging, and clear (around 150-200 words). Avoid long paragraphs. Use spacing.
4. The output MUST be a valid JSON object with EXACTLY two fields:
{
  "subject": "...",
  "body": "..."
}
5. Do NOT output any markdown tags outside of the JSON object itself. Ensure it is pure parseable JSON.`;

    const userPrompt = `=== CANDIDATE OUTREACH CONTEXT ===

Candidate Resume Text:
${resumeData.text}

Candidate Key Skills:
${skills}

Candidate Projects:
${projects}

=== TARGET ROLE CONTEXT ===

Target Company Name:
${companyName}

Target Job Description:
${jobDescription}`;

    const rawResponse = await this.safeCall(async () => {
      const response = await this.openai!.chat.completions.create({
        model: "gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      });
      return response.choices[0]?.message?.content || "";
    });

    return this.parseJsonResponse<GeneratedEmail>(rawResponse);
  }

  /**
   * Generates a professional manual follow-up email
   */
  async generateFollowUpEmail(
    companyName: string,
    jobDescription: string,
    initialEmail: string,
    previousFollowUps: string[],
    followUpNumber: number
  ): Promise<GeneratedEmail> {
    const resumeData = await this.resumeFetcher.fetchMasterResume();

    const systemPrompt = `You are a professional outreach specialist.
Write a concise, professional follow-up email to a recruiter regarding the job application at ${companyName}.
Your tone should be professional, polite, and confident.

STRICT CONSTRAINTS & RULES (VIOLATIONS ARE UNACCEPTABLE):
1. Keep it extremely concise and direct. The maximum length is 80 to 120 words.
2. Do NOT repeat the exact content or sentences of the initial email or previous follow-up emails.
3. Check in politely and, if possible, mention additional value or briefly highlight a project/skill that matches the job description.
4. Output ONLY a valid JSON object with EXACTLY two fields:
{
  "subject": "...",
  "body": "..."
}
5. Do NOT include markdown styling or text around the JSON object.`;

    const userPrompt = `=== CANDIDATE CONTEXT ===
Resume:
${resumeData.text}

=== TARGET OUTREACH DETAILS ===
Company: ${companyName}
Job Description: ${jobDescription}
Follow-Up Number: ${followUpNumber}

=== EMAIL HISTORY ===
Initial Cold Email Sent:
${initialEmail}

Previous Follow-up Emails:
${previousFollowUps.length > 0 ? previousFollowUps.map((e, i) => `[Follow-up ${i + 1}]:\n${e}`).join("\n\n") : "None"}
`;

    const rawResponse = await this.safeCall(async () => {
      const response = await this.openai!.chat.completions.create({
        model: "gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      });
      return response.choices[0]?.message?.content || "";
    });

    return this.parseJsonResponse<GeneratedEmail>(rawResponse);
  }

  /**
   * Extracts lead details (company name, recruiter email, and job description) from an uploaded image of a job posting.
   * @param base64Image The base64-encoded string of the image
   * @param mimeType The MIME type of the image (e.g. image/png, image/jpeg)
   */
  async extractLeadFromImage(
    base64Image: string,
    mimeType: string
  ): Promise<{ companyName: string; recipientEmail: string; jobDescription: string }> {
    const systemPrompt = `You are an expert recruitment assistant.
Analyze the provided image of a job posting, recruitment flyer, or LinkedIn screenshot.
Extract the target lead details as accurately as possible.

STRICT RULES:
1. Extract the "companyName" (e.g. Google, Stripe, etc. - default to "" if absolutely not mentioned).
2. Extract the "recipientEmail" (e.g. recruit@company.com - default to "" if not mentioned, do NOT hallucinate).
3. Extract the full "jobDescription" or requirements (include all visible details of the job role and responsibilities).
4. Output MUST be a valid JSON object with EXACTLY three fields:
{
  "companyName": "...",
  "recipientEmail": "...",
  "jobDescription": "..."
}
5. Do NOT include any markdown or text around the JSON object.`;

    const rawResponse = await this.safeCall(async () => {
      const response = await this.openai!.chat.completions.create({
        model: "gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: "Please extract the recruiter lead details from this image." },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`,
                },
              },
            ],
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      });
      return response.choices[0]?.message?.content || "";
    });

    return this.parseJsonResponse<{ companyName: string; recipientEmail: string; jobDescription: string }>(rawResponse);
  }
}
