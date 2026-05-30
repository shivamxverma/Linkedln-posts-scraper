import OpenAI, { AzureOpenAI } from "openai";

export interface TailoredResumeData {
  personalInfo: {
    name: string;
    email: string;
    phone: string;
    website?: string;
    location?: string;
    github?: string;
    linkedin?: string;
  };
  summary: string;
  skills: {
    category: string; // e.g. "Languages", "Frameworks & Libraries", "Tools"
    items: string[];
  }[];
  experience: {
    company: string;
    role: string;
    location: string;
    duration: string; // e.g. "June 2024 - Present" or "Oct 2023 - May 2024"
    achievements: string[];
  }[];
  projects: {
    name: string;
    description: string; // short summary
    technologies: string[];
    duration?: string;
    bullets: string[];
  }[];
  education: {
    institution: string;
    degree: string;
    location: string;
    duration: string;
    details?: string;
  }[];
}

export class ResumeOptimizerService {
  private openai: OpenAI | AzureOpenAI | null = null;
  private isAzure: boolean = false;
  private isGemini: boolean = false;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    const azureApiKey = process.env.AZURE_OPENAI_API_KEY;
    const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const azureDeployment = process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-4o-mini";
    const azureApiVersion = process.env.AZURE_OPENAI_API_VERSION || "2024-06-01-preview";
    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (geminiApiKey) {
      console.log("[Resume Optimizer] Initializing standard OpenAI Client in Gemini Compatibility Mode...");
      this.openai = new OpenAI({
        apiKey: geminiApiKey,
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
      });
      this.isGemini = true;
    } else if (azureApiKey && azureEndpoint) {
      console.log(`[Resume Optimizer] Initializing Azure OpenAI Client...`);
      console.log(`[Resume Optimizer] Endpoint: ${azureEndpoint}`);
      console.log(`[Resume Optimizer] Deployment: ${azureDeployment}`);
      
      this.openai = new AzureOpenAI({
        apiKey: azureApiKey,
        endpoint: azureEndpoint,
        deployment: azureDeployment,
        apiVersion: azureApiVersion,
      });
      this.isAzure = true;
    } else if (apiKey) {
      console.log("[Resume Optimizer] Initializing standard OpenAI Client...");
      this.openai = new OpenAI({ apiKey });
      this.isAzure = false;
    } else {
      console.warn(
        "[Resume Optimizer] OpenAI / Gemini API Credentials are missing. Requests will fail until GEMINI_API_KEY, OPENAI_API_KEY, or AZURE_OPENAI_API_KEY + AZURE_OPENAI_ENDPOINT are configured."
      );
    }
  }

  /**
   * Tailors a master resume to match a specific job description.
   * Adheres strictly to constraints against hallucinating experience, achievements, or credentials.
   */
  async optimize(
    masterResumeText: string,
    jobTitle: string,
    companyName: string,
    jobDescription: string
  ): Promise<TailoredResumeData> {
    if (!this.openai) {
      throw new Error("OpenAI API client is not initialized. Please set the OPENAI_API_KEY environment variable.");
    }

    console.log(`[Resume Optimizer] Starting LLM optimization for role: "${jobTitle}" at "${companyName}"...`);

    const systemPrompt = `You are a professional resume writer and career coach specializing in ATS optimization.
Your task is to take a master resume (provided as text) and tailor it for a specific job opening: "${jobTitle}" at "${companyName}".

OBJECTIVE:
Tailor the skills, professional summary, experience bullets, and project descriptions to highlight relevant experience, reorder skills, improve wording, and insert job-specific keywords found in the job description.

CRITICAL CONSTRAINTS (VIOLATIONS ARE UNACCEPTABLE):
1. NEVER invent any work experience, company names, project names, achievements, or education.
2. NEVER exaggerate or fabricate credentials (e.g. degrees, GPAs, certifications).
3. If the master resume does not mention a specific experience, skill level, or project, do not invent it. You may only highlight, reword, and reorder existing details.
4. Keep the output 100% grounded in the facts presented in the master resume text.

INSTRUCTIONS:
- Tailor the "summary" to directly address the key requirements of the job description using your actual experience.
- Group and order "skills" by placing the technologies, languages, and frameworks most critical to the job description first.
- In "experience" and "projects", re-write and refine the bullet points using strong action verbs. Highlight achievements, tasks, and technologies that align with the job description. Ensure you do not invent any metrics or outcomes that were not in the master resume.
- Maintain the original personal contact information and education from the master resume, but format them cleanly.`;

    const userPrompt = `=== MASTER RESUME TEXT ===
${masterResumeText}

=== TARGET JOB DESCRIPTION ===
Role: ${jobTitle}
Company: ${companyName}
Description:
${jobDescription}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: this.isGemini
          ? "gemini-2.5-flash"
          : this.isAzure
          ? (process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-4o-mini")
          : "gpt-4o-mini", // Dynamic routing for Gemini, Azure OpenAI, or standard OpenAI
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "tailored_resume",
            strict: true,
            schema: {
              type: "OBJECT",
              properties: {
                personalInfo: {
                  type: "OBJECT",
                  properties: {
                    name: { type: "STRING" },
                    email: { type: "STRING" },
                    phone: { type: "STRING" },
                    website: { type: "STRING" },
                    location: { type: "STRING" },
                    github: { type: "STRING" },
                    linkedin: { type: "STRING" }
                  },
                  required: ["name", "email", "phone", "website", "location", "github", "linkedin"],
                  additionalProperties: false
                },
                summary: { type: "STRING" },
                skills: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      category: { type: "STRING" },
                      items: {
                        type: "ARRAY",
                        items: { type: "STRING" }
                      }
                    },
                    required: ["category", "items"],
                    additionalProperties: false
                  }
                },
                experience: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      company: { type: "STRING" },
                      role: { type: "STRING" },
                      location: { type: "STRING" },
                      duration: { type: "STRING" },
                      achievements: {
                        type: "ARRAY",
                        items: { type: "STRING" }
                      }
                    },
                    required: ["company", "role", "location", "duration", "achievements"],
                    additionalProperties: false
                  }
                },
                projects: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      name: { type: "STRING" },
                      description: { type: "STRING" },
                      technologies: {
                        type: "ARRAY",
                        items: { type: "STRING" }
                      },
                      duration: { type: "STRING" },
                      bullets: {
                        type: "ARRAY",
                        items: { type: "STRING" }
                      }
                    },
                    required: ["name", "description", "technologies", "duration", "bullets"],
                    additionalProperties: false
                  }
                },
                education: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      institution: { type: "STRING" },
                      degree: { type: "STRING" },
                      location: { type: "STRING" },
                      duration: { type: "STRING" },
                      details: { type: "STRING" }
                    },
                    required: ["institution", "degree", "location", "duration", "details"],
                    additionalProperties: false
                  }
                }
              },
              required: ["personalInfo", "summary", "skills", "experience", "projects", "education"],
              additionalProperties: false
            }
          }
        },
        temperature: 0.1 // Low temperature to maximize adherence to facts and instructions
      });

      const rawJson = response.choices[0].message.content;
      if (!rawJson) {
        throw new Error("Received empty response content from OpenAI Chat Completion.");
      }

      const tailoredData = JSON.parse(rawJson) as TailoredResumeData;
      console.log("[Resume Optimizer] Successfully generated tailored resume details via OpenAI.");
      return tailoredData;
    } catch (error) {
      console.error("[Resume Optimizer] Error optimizing resume via OpenAI:", error);
      throw new Error(`Resume optimization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
