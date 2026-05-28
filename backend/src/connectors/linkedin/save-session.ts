import { saveLinkedinSession } from "./session.js";

saveLinkedinSession().catch((error) => {
  console.error("[LinkedIn Session] Failed to save session:", error);
  process.exit(1);
});
