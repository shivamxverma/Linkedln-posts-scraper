import * as fs from "fs";
import * as path from "path";
import { PDFParse } from "pdf-parse";


export class ResumeFetcherService {
  private storageDir: string;

  constructor() {
    this.storageDir = path.resolve(process.cwd(), "storage");
    // Ensure the base storage directory exists
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  /**
   * Fetches the master resume.
   * Checks for a Google Drive File ID in environment variables. If found, downloads the file.
   * Otherwise, falls back to reading the local storage/master-resume.pdf file.
   */
  async fetchMasterResume(): Promise<{ pdfBuffer: Buffer; text: string }> {
    const fileId = process.env.GOOGLE_DRIVE_RESUME_FILE_ID;
    const localPath = path.join(this.storageDir, "master-resume.pdf");

    let pdfBuffer: Buffer;

    if (fileId) {
      console.log(`[Resume Fetcher] Google Drive File ID found: ${fileId}. Attempting download...`);
      try {
        pdfBuffer = await this.downloadFromGoogleDrive(fileId);
        // Cache locally for convenience/fallback
        fs.writeFileSync(localPath, pdfBuffer);
        console.log(`[Resume Fetcher] Master resume downloaded from Google Drive and saved to: ${localPath}`);
      } catch (error) {
        console.error("[Resume Fetcher] Failed to download from Google Drive, falling back to local file if available:", error);
        pdfBuffer = this.readLocalResume(localPath);
      }
    } else {
      console.log("[Resume Fetcher] No Google Drive File ID specified. Reading local master resume...");
      pdfBuffer = this.readLocalResume(localPath);
    }

    // Parse the PDF buffer into plain text
    const text = await this.parsePdf(pdfBuffer);
    console.log(`[Resume Fetcher] Successfully extracted ${text.length} characters of text from master resume.`);

    return { pdfBuffer, text };
  }

  /**
   * Downloads a public file from Google Drive
   */
  private async downloadFromGoogleDrive(fileId: string): Promise<Buffer> {
    // Standard Google Drive public export download URL
    const url = `https://docs.google.com/uc?export=download&id=${fileId}`;
    
    console.log(`[Resume Fetcher] Fetching URL: ${url}`);
    const response = await fetch(url, {
      headers: {
        // Some User-Agent to avoid getting blocked
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    if (!response.ok) {
      throw new Error(`Google Drive download failed with status ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Reads the master resume from local storage
   */
  private readLocalResume(localPath: string): Buffer {
    if (!fs.existsSync(localPath)) {
      throw new Error(
        `Master resume not found. Please place your master resume PDF at: ${localPath} or specify GOOGLE_DRIVE_RESUME_FILE_ID in your environment variables.`
      );
    }
    console.log(`[Resume Fetcher] Reading local master resume from: ${localPath}`);
    return fs.readFileSync(localPath);
  }

  private async parsePdf(pdfBuffer: Buffer): Promise<string> {
    try {
      const parser = new PDFParse({ data: pdfBuffer });
      const result = await parser.getText();
      return result.text;
    } catch (error) {
      console.error("[Resume Fetcher] PDF parsing error:", error);
      throw new Error(`Failed to parse PDF resume text: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
