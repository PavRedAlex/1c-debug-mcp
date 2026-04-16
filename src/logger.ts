import * as fs from "fs";
import * as path from "path";

const LOG_FILE = path.join(process.cwd(), "1c-debug.log");

// Truncate log on startup
try {
  fs.writeFileSync(LOG_FILE, `=== 1c-debug MCP started ${new Date().toISOString()} ===\n`);
} catch {
  // ignore
}

export function log(message: string): void {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  process.stderr.write(line);
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch {
    // ignore
  }
}

export const LOG_PATH = LOG_FILE;
