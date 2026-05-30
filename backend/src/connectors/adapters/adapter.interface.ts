import { Page } from "playwright";

export interface ApplicationContext {
  page: Page;
  applicationId: string;
  jobId: string;
  jobTitle: string;
  companyName: string;
  applyUrl: string;
  resumePdfPath: string;
}

export interface ApplicationAdapter {
  /**
   * Identifies whether this adapter can process the given job application.
   */
  canHandle(url: string, source: string): boolean;

  /**
   * Executes the browser automation steps to complete the job application.
   * Should raise an error with descriptive logs upon failure.
   */
  apply(context: ApplicationContext): Promise<void>;
}
