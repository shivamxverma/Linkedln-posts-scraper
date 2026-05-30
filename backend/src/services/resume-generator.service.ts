import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { chromium } from "playwright";
import { TailoredResumeData } from "./resume-optimizer.service.js";

export class ResumeGeneratorService {
  /**
   * Generates a LaTeX file and compiles it to PDF.
   * If pdflatex is not installed, it falls back to generating a beautiful HTML resume
   * and printing it to a high-fidelity PDF via Playwright.
   */
  async generateResumeFiles(
    data: TailoredResumeData,
    outputDirectory: string
  ): Promise<{ pdfPath: string; latexPath: string; compileMethod: "latex" | "playwright_html" }> {
    // Ensure output directory exists
    if (!fs.existsSync(outputDirectory)) {
      fs.mkdirSync(outputDirectory, { recursive: true });
    }

    const latexPath = path.join(outputDirectory, "resume.tex");
    const pdfPath = path.join(outputDirectory, "resume.pdf");

    // 1. Generate LaTeX source code
    const latexSource = this.generateLaTeX(data);
    fs.writeFileSync(latexPath, latexSource);
    console.log(`[Resume Generator] LaTeX source saved to: ${latexPath}`);

    // 2. Attempt LaTeX compilation
    let compiled = false;
    try {
      console.log("[Resume Generator] Checking if pdflatex is installed...");
      execSync("which pdflatex", { stdio: "ignore" });

      console.log("[Resume Generator] pdflatex found! Starting LaTeX compilation...");
      // Compile LaTeX. We run pdflatex twice for table alignments/page numbers, standard LaTeX behavior
      const compileCmd = `pdflatex -interaction=nonstopmode -output-directory="${outputDirectory}" "${latexPath}"`;
      execSync(compileCmd, { stdio: "ignore" });
      execSync(compileCmd, { stdio: "ignore" }); // run twice

      // Clean up auxiliary LaTeX files (.aux, .log, .out)
      this.cleanupAuxiliaryFiles(outputDirectory);

      if (fs.existsSync(pdfPath)) {
        console.log(`[Resume Generator] Successfully compiled PDF using pdflatex at: ${pdfPath}`);
        compiled = true;
        return { pdfPath, latexPath, compileMethod: "latex" };
      }
    } catch (error) {
      console.warn(
        "[Resume Generator] pdflatex compilation failed or pdflatex is not installed. Falling back to Playwright HTML-to-PDF..."
      );
    }

    // 3. Fallback: Beautiful HTML-to-PDF rendering via Playwright
    if (!compiled) {
      const htmlPath = path.join(outputDirectory, "resume.html");
      const htmlSource = this.generateHTML(data);
      fs.writeFileSync(htmlPath, htmlSource);
      console.log(`[Resume Generator] Fallback HTML source saved to: ${htmlPath}`);

      await this.compileHtmlToPdf(htmlSource, pdfPath);
      console.log(`[Resume Generator] Successfully compiled PDF using Playwright HTML print at: ${pdfPath}`);
      return { pdfPath, latexPath, compileMethod: "playwright_html" };
    }

    throw new Error("Failed to compile tailored resume PDF.");
  }

  /**
   * Generates clean, standard LaTeX source code.
   * Properly escapes LaTeX reserved characters.
   */
  private generateLaTeX(data: TailoredResumeData): string {
    const esc = (text: string | undefined): string => {
      if (!text) return "";
      return text
        .replace(/\\/g, "\\textbackslash{}")
        .replace(/([&%$#_{}])/g, "\\$1")
        .replace(/~/g, "\\textasciitilde{}")
        .replace(/\^/g, "\\textasciicircum{}");
    };

    const p = data.personalInfo;

    // Contact info formatting
    const contactParts: string[] = [];
    if (p.email) contactParts.push(`\\href{mailto:${p.email}}{${esc(p.email)}}`);
    if (p.phone) contactParts.push(esc(p.phone));
    if (p.website) contactParts.push(`\\href{${p.website}}{${esc(p.website)}}`);
    if (p.linkedin) contactParts.push(`\\href{${p.linkedin}}{LinkedIn}`);
    if (p.github) contactParts.push(`\\href{${p.github}}{GitHub}`);
    const contactLine = contactParts.join(" \\textbullet{} ");

    let latex = `\\documentclass[letterpaper,10pt]{article}
\\usepackage{latexsym}
\\usepackage[empty]{fullpage}
\\usepackage{titlesec}
\\usepackage{marvosym}
\\usepackage[usenames,dvipsnames]{color}
\\usepackage{verbatim}
\\usepackage{enumitem}
\\usepackage[hidelinks]{hyperref}
\\usepackage{fancyhdr}
\\usepackage[english]{babel}
\\usepackage{tabularx}
\\usepackage{geometry}

\\geometry{left=0.5in, top=0.4in, right=0.5in, bottom=0.4in}

\\pagestyle{fancy}
\\fancyhf{} 
\\fancyfoot{}
\\renewcommand{\\headrulewidth}{0pt}
\\renewcommand{\\footrulewidth}{0pt}

\\urlstyle{same}

\\raggedbottom
\\raggedright
\\setlength{\\tabcolsep}{0in}

% Sections formatting
\\titleformat{\\section}{
  \\vspace{-6pt}\\scshape\\raggedright\\large
}{}{0em}{}[\\color{black}\\titlerule \\vspace{-4pt}]

% Custom list environment for experiences and projects
\\newenvironment{resumeList}{
  \\begin{itemize}[leftmargin=0.15in, label={}]
}{
  \\end{itemize}
}

\\newcommand{\\resumeItem}[1]{
  \\item\\small{
    {#1 \\vspace{-2.5pt}}
  }
}

\\newcommand{\\resumeSubheading}[4]{
  \\vspace{-2pt}\\item
    \\begin{tabular*}{0.97\\textwidth}[t]{l@{\\extracolsep{\\fill}}r}
      \\textbf{#1} & #2 \\\\
      \\textit{\\small#3} & \\textit{\\small #4} \\\\
    \\end{tabular*}\\vspace{-6pt}
}

\\newcommand{\\resumeProjectHeading}[3]{
  \\vspace{-2pt}\\item
    \\begin{tabular*}{0.97\\textwidth}[t]{l@{\\extracolsep{\\fill}}r}
      \\textbf{#1} \\textit{\\small(#2)} & #3 \\\\
    \\end{tabular*}\\vspace{-6pt}
}

\\renewcommand{\\labelitemii}{$\\vcenter{\\hbox{\\tiny$\\bullet$}}$}

\\newcommand{\\resumeItemListStart}{\\begin{itemize}[leftmargin=0.15in]}
\\newcommand{\\resumeItemListEnd}{\\end{itemize}\\vspace{-5pt}}

%-------------------------------------------
\\begin{document}

%----------HEADING----------
\\begin{center}
  \\textbf{\\Huge \\scshape ${esc(p.name)}} \\\\ \\vspace{4pt}
  \\small ${contactLine}
\\end{center}

%----------SUMMARY----------
\\section{Professional Summary}
\\vspace{3pt}
\\small{${esc(data.summary)}}

%-----------SKILLS-----------
\\section{Skills}
\\begin{itemize}[leftmargin=0.15in, label={}]
  \\small{\\item{
    ${data.skills
      .map((cat) => `\\textbf{${esc(cat.category)}}{: ${cat.items.map((i) => esc(i)).join(", ")}}`)
      .join(" \\\\ \\vspace{2pt}\n    ")}
  }}
\\end{itemize}

%-----------EXPERIENCE-----------
\\section{Experience}
\\begin{resumeList}
  ${data.experience
    .map((exp) => {
      let expHeading = `  \\resumeSubheading
    {${esc(exp.company)}}{${esc(exp.location)}}
    {${esc(exp.role)}}{${esc(exp.duration)}}`;
      let bulletItems = exp.achievements
        .map((ach) => `    \\resumeItem{${esc(ach)}}`)
        .join("\n");
      return `${expHeading}\n  \\resumeItemListStart\n${bulletItems}\n  \\resumeItemListEnd`;
    })
    .join("\n\n")}
\\end{resumeList}

%-----------PROJECTS-----------
\\section{Projects}
\\begin{resumeList}
  ${data.projects
    .map((proj) => {
      let projHeading = `  \\resumeProjectHeading
    {${esc(proj.name)}}{${esc(proj.technologies.join(", "))}}{${esc(proj.duration || "")}}`;
      let bulletItems = proj.bullets
        .map((b) => `    \\resumeItem{${esc(b)}}`)
        .join("\n");
      return `${projHeading}\n  \\resumeItemListStart\n${bulletItems}\n  \\resumeItemListEnd`;
    })
    .join("\n\n")}
\\end{resumeList}

%-----------EDUCATION-----------
\\section{Education}
\\begin{resumeList}
  ${data.education
    .map((edu) => {
      return `  \\resumeSubheading
    {${esc(edu.institution)}}{${esc(edu.location)}}
    {${esc(edu.degree)}}{${esc(edu.duration)}}
    \\vspace{2pt}\\\\
    \\small{${esc(edu.details)}}`;
    })
    .join("\n\n")}
\\end{resumeList}

\\end{document}
`;
    return latex;
  }

  /**
   * Generates a beautifully styled, premium HTML template for web & Playwright printing.
   */
  private generateHTML(data: TailoredResumeData): string {
    const p = data.personalInfo;

    const contactParts: string[] = [];
    if (p.email) contactParts.push(`<a href="mailto:${p.email}">${p.email}</a>`);
    if (p.phone) contactParts.push(`<span>${p.phone}</span>`);
    if (p.website) contactParts.push(`<a href="${p.website}" target="_blank">Website</a>`);
    if (p.linkedin) contactParts.push(`<a href="${p.linkedin}" target="_blank">LinkedIn</a>`);
    if (p.github) contactParts.push(`<a href="${p.github}" target="_blank">GitHub</a>`);
    const contactLine = contactParts.join(" &bull; ");

    const skillsSection = data.skills
      .map(
        (cat) => `
      <div class="skill-category">
        <strong>${cat.category}:</strong> ${cat.items.join(", ")}
      </div>`
      )
      .join("");

    const experienceSection = data.experience
      .map(
        (exp) => `
      <div class="item">
        <div class="item-header">
          <div>
            <span class="item-title">${exp.role}</span>
            <span class="item-subtitle">at ${exp.company}</span>
          </div>
          <div class="item-meta">
            <span>${exp.duration}</span>
            <span>&bull;</span>
            <span>${exp.location}</span>
          </div>
        </div>
        <ul class="item-bullets">
          ${exp.achievements.map((ach) => `<li>${ach}</li>`).join("")}
        </ul>
      </div>`
      )
      .join("");

    const projectsSection = data.projects
      .map(
        (proj) => `
      <div class="item">
        <div class="item-header">
          <div>
            <span class="item-title">${proj.name}</span>
            <span class="tech-tag">${proj.technologies.join(", ")}</span>
          </div>
          <div class="item-meta">
            <span>${proj.duration || ""}</span>
          </div>
        </div>
        <ul class="item-bullets">
          ${proj.bullets.map((b) => `<li>${b}</li>`).join("")}
        </ul>
      </div>`
      )
      .join("");

    const educationSection = data.education
      .map(
        (edu) => `
      <div class="item">
        <div class="item-header">
          <div>
            <span class="item-title">${edu.degree}</span>
            <span class="item-subtitle">from ${edu.institution}</span>
          </div>
          <div class="item-meta">
            <span>${edu.duration}</span>
            <span>&bull;</span>
            <span>${edu.location}</span>
          </div>
        </div>
        ${edu.details ? `<p class="item-details" style="font-size: 0.85rem; margin-top: 2px; color: #4b5563;">${edu.details}</p>` : ""}
      </div>`
      )
      .join("");

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${p.name} - Resume</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap');
    
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: 'Outfit', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #1f2937;
      line-height: 1.4;
      padding: 0;
      background: white;
      font-size: 10pt;
    }

    .resume-container {
      width: 100%;
      max-width: 800px;
      margin: 0 auto;
    }

    header {
      text-align: center;
      margin-bottom: 12px;
    }

    h1 {
      font-size: 24pt;
      font-weight: 700;
      color: #111827;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .contact-info {
      font-size: 8.5pt;
      color: #4b5563;
      margin-top: 4px;
    }

    .contact-info a {
      color: #4338ca;
      text-decoration: none;
    }

    section {
      margin-bottom: 12px;
    }

    h2 {
      font-size: 11pt;
      font-weight: 600;
      color: #111827;
      text-transform: uppercase;
      letter-spacing: 1px;
      border-bottom: 1px solid #d1d5db;
      padding-bottom: 2px;
      margin-bottom: 6px;
    }

    .summary-text {
      font-size: 9pt;
      color: #374151;
      text-align: justify;
    }

    .skill-category {
      font-size: 9pt;
      margin-bottom: 3px;
      color: #374151;
    }

    .item {
      margin-bottom: 8px;
    }
    .item:last-child {
      margin-bottom: 0;
    }

    .item-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 2px;
    }

    .item-title {
      font-weight: 600;
      font-size: 9.5pt;
      color: #111827;
    }

    .item-subtitle {
      font-weight: 400;
      font-size: 9pt;
      color: #4b5563;
      margin-left: 4px;
    }

    .item-meta {
      font-size: 8.5pt;
      color: #6b7280;
      display: flex;
      gap: 4px;
    }

    .tech-tag {
      font-size: 8pt;
      font-style: italic;
      color: #4338ca;
      margin-left: 6px;
    }

    .item-bullets {
      margin-left: 14px;
      margin-top: 2px;
    }

    .item-bullets li {
      font-size: 9pt;
      color: #374151;
      margin-bottom: 2px;
      text-align: justify;
    }

    @media print {
      body {
        margin: 0;
      }
      .resume-container {
        max-width: 100%;
      }
    }
  </style>
</head>
<body>
  <div class="resume-container">
    <header>
      <h1>${p.name}</h1>
      <div class="contact-info">
        ${contactLine}
      </div>
    </header>

    <section>
      <h2>Professional Summary</h2>
      <p class="summary-text">${data.summary}</p>
    </section>

    <section>
      <h2>Skills</h2>
      ${skillsSection}
    </section>

    <section>
      <h2>Experience</h2>
      ${experienceSection}
    </section>

    <section>
      <h2>Projects</h2>
      ${projectsSection}
    </section>

    <section>
      <h2>Education</h2>
      ${educationSection}
    </section>
  </div>
</body>
</html>
`;
  }

  /**
   * Compiles HTML content to a PDF file using headless Playwright.
   */
  private async compileHtmlToPdf(htmlContent: string, pdfPath: string): Promise<void> {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent(htmlContent, { waitUntil: "networkidle" });

      // Clean, premium PDF print parameters
      await page.pdf({
        path: pdfPath,
        format: "letter",
        printBackground: true,
        margin: {
          top: "0.45in",
          bottom: "0.45in",
          left: "0.45in",
          right: "0.45in",
        },
      });
    } finally {
      await browser.close();
    }
  }

  /**
   * Cleans up auxiliary files left over by LaTeX compiler.
   */
  private cleanupAuxiliaryFiles(directory: string) {
    const extensions = [".aux", ".log", ".out"];
    const files = fs.readdirSync(directory);
    for (const file of files) {
      if (extensions.includes(path.extname(file))) {
        try {
          fs.unlinkSync(path.join(directory, file));
        } catch (e) {
          // ignore cleanup errors
        }
      }
    }
  }
}
