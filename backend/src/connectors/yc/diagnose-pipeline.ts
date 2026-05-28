import { generateYcJobsUrl } from "./search.js";
import { loadCookieHeader } from "../../services/session-manager.js";
import { fetchYcJobsPage } from "./fetch.js";
import { parseYcJobs } from "./parse.js";
import { normalizeYcJobs } from "./normalize.js";

const YC_COOKIE_CANDIDATES = [
  "authentication/raw-cookies-yc.json",
  "backend/authentication/raw-cookies-yc.json",
];

async function runDiagnostics() {
  console.log("\n🔍 === STARTING STEP-BY-STEP YC PIPELINE DIAGNOSTICS === 🔍\n");

  const searchConfig = { role: "backend", location: "Remote" };

  // ==========================================
  // STEP 1: Generate Search URL
  // ==========================================
  console.log("-----------------------------------------");
  console.log("➡️ STEP 1: Generating target YC search URL...");
  console.log("-----------------------------------------");
  const targetUrl = generateYcJobsUrl(searchConfig);
  console.log(`Config: ${JSON.stringify(searchConfig)}`);
  console.log(`Resulting URL: \x1b[36m${targetUrl}\x1b[0m\n`);

  // ==========================================
  // STEP 2: Load and Verify Session Cookies
  // ==========================================
  console.log("-----------------------------------------");
  console.log("➡️ STEP 2: Resolving and verifying cookies...");
  console.log("-----------------------------------------");
  try {
    const cookieHeader = loadCookieHeader({
      cookieFileCandidates: YC_COOKIE_CANDIDATES,
      domainIncludes: "workatastartup.com",
    });
    
    const cookieCount = cookieHeader.split(";").length;
    console.log(`✅ Success! Loaded \x1b[32m${cookieCount} active cookies\x1b[0m for domain 'workatastartup.com'.`);
    console.log(`Cookie Names: \x1b[90m${cookieHeader.split(";").map(c => c.split("=")[0].trim()).join(", ")}\x1b[0m\n`);
  } catch (err: any) {
    console.log(`❌ Cookie resolution failed: ${err.message}\n`);
  }

  // ==========================================
  // STEP 3: Fetch Authenticated HTML Page
  // ==========================================
  console.log("-----------------------------------------");
  console.log("➡️ STEP 3: Fetching raw HTML from YC...");
  console.log("-----------------------------------------");
  let rawHtml = "";
  try {
    rawHtml = await fetchYcJobsPage(searchConfig);
    console.log("✅ Fetch Successful!");
    console.log(`HTML Payload Size: \x1b[35m${Math.round(rawHtml.length / 1024)} KB\x1b[0m`);
    console.log(`First 150 characters: \x1b[90m"${rawHtml.substring(0, 150).replace(/\n/g, "")}..."\x1b[0m\n`);
  } catch (err: any) {
    console.log(`❌ Fetch failed: ${err.message}\n`);
    return;
  }

  // ==========================================
  // STEP 4: Parse data-page Hydration JSON
  // ==========================================
  console.log("-----------------------------------------");
  console.log("➡️ STEP 4: Parsing Next/Inertia hydration JSON...");
  console.log("-----------------------------------------");
  let rawJobs: any[] = [];
  try {
    rawJobs = parseYcJobs(rawHtml);
    console.log(`✅ Success! Extracted \x1b[32m${rawJobs.length} raw jobs\x1b[0m from data-page state.`);
    
    if (rawJobs.length > 0) {
      console.log("\nSample Raw Job structure (First Item Keys):");
      console.log(`\x1b[33m${JSON.stringify(Object.keys(rawJobs[0]), null, 2)}\x1b[0m`);
      console.log("\nSample Raw Job data (First Item values):");
      console.log(JSON.stringify(rawJobs[0], null, 2));
    }
    console.log("");
  } catch (err: any) {
    console.log(`❌ Parsing failed: ${err.message}\n`);
    return;
  }

  // ==========================================
  // STEP 5: Normalize into Database-Ready Schema
  // ==========================================
  console.log("-----------------------------------------");
  console.log("➡️ STEP 5: Normalizing into database schema...");
  console.log("-----------------------------------------");
  try {
    const normalizedJobs = normalizeYcJobs(rawJobs);
    console.log(`✅ Success! Standardized \x1b[32m${normalizedJobs.length} job objects\x1b[0m.`);
    
    if (normalizedJobs.length > 0) {
      console.log("\nFinal standardized schema (Database ready):");
      console.log(JSON.stringify(normalizedJobs[0], null, 2));
    }
  } catch (err: any) {
    console.log(`❌ Normalization failed: ${err.message}\n`);
  }

  console.log("\n🏁 === DIAGNOSTICS COMPLETED === 🏁\n");
}

runDiagnostics();
