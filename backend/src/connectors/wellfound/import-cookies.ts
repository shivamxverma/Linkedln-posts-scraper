import * as fs from "fs";
import * as path from "path";

function importCookies() {
  const rawPath = path.resolve(process.cwd(), "raw-cookies.json");
  const outputPath = path.resolve(process.cwd(), "session.json");

  if (!fs.existsSync(rawPath)) {
    console.error(`\n❌ Error: Could not find 'raw-cookies.json' in ${process.cwd()}`);
    console.log("Please export your cookies using a standard browser extension (like Cookie-Editor) and save it as 'raw-cookies.json'.");
    process.exit(1);
  }

  try {
    const rawContent = fs.readFileSync(rawPath, "utf-8");
    const rawCookies = JSON.parse(rawContent);

    if (!Array.isArray(rawCookies)) {
      throw new Error("raw-cookies.json must be a JSON array containing cookie objects.");
    }

    const mappedCookies = rawCookies.map((cookie: any) => {
      // Map SameSite values to formats Playwright understands (Lax, Strict, None)
      let sameSite = "Lax";
      if (cookie.sameSite) {
        const val = cookie.sameSite.toLowerCase();
        if (val === "no_restriction" || val === "none") sameSite = "None";
        else if (val === "lax") sameSite = "Lax";
        else if (val === "strict") sameSite = "Strict";
      }

      return {
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        expires: cookie.expirationDate || Math.floor(Date.now() / 1000) + 86400 * 30, // fallback: 30 days
        httpOnly: cookie.httpOnly ?? false,
        secure: cookie.secure ?? true,
        sameSite: sameSite,
      };
    });

    const storageState = {
      cookies: mappedCookies,
      origins: [],
    };

    fs.writeFileSync(outputPath, JSON.stringify(storageState, null, 2), "utf-8");
    console.log(`\n✅ Success! Converted exported cookies to Playwright format!`);
    console.log(`Saved session credentials to: ${outputPath}`);
    console.log("You can now run 'pnpm test:connector' to scrape live jobs successfully!");
  } catch (error: any) {
    console.error("\n❌ Failed to parse or map cookies:", error.message);
  }
}

importCookies();
