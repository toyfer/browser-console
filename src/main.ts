import { loadConfig } from "./config.js";
import { startServer } from "./server.js";

const config = loadConfig();
const server = startServer(config);

let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[${signal}] shutting down...`);
  try {
    server.close(() => {
      console.log("server stopped");
      process.exit(0);
    });
  } catch {
    process.exit(0);
  }
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("uncaughtException", (err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
process.on("unhandledRejection", (err) => {
  console.error("[fatal rejection]", err);
});
