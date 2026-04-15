import { readFileSync, existsSync } from "fs";
import { join, resolve } from "path";

export interface Config {
  url?: string;
  alias?: string;
  password?: string;
}

/**
 * Search for .1c-debug.json starting from cwd, walking up to root.
 * Returns parsed config or null if not found.
 */
function findProjectConfig(): Config | null {
  let dir = process.cwd();

  while (true) {
    const candidate = join(dir, ".1c-debug.json");
    if (existsSync(candidate)) {
      try {
        const raw = readFileSync(candidate, "utf-8");
        const parsed = JSON.parse(raw) as Config;
        process.stderr.write(`[1c-debug] Using project config: ${candidate}\n`);
        return parsed;
      } catch {
        process.stderr.write(`[1c-debug] Failed to parse ${candidate}\n`);
        return null;
      }
    }

    const parent = resolve(dir, "..");
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }

  return null;
}

/**
 * Parse configuration with priority (highest → lowest):
 * 1. CLI arguments (--url, --alias, --password)
 * 2. Environment variables (ONEC_DEBUG_URL, ONEC_INFOBASE_ALIAS, ONEC_DEBUG_PASSWORD)
 * 3. Project config file (.1c-debug.json, searched from cwd upward)
 */
export function parseConfig(argv: string[] = process.argv.slice(2)): Config {
  const config: Config = {};

  // 1. CLI args
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg.startsWith("--url=")) {
      config.url = arg.slice("--url=".length);
    } else if (arg === "--url" && argv[i + 1]) {
      config.url = argv[++i];
    } else if (arg.startsWith("--alias=")) {
      config.alias = arg.slice("--alias=".length);
    } else if (arg === "--alias" && argv[i + 1]) {
      config.alias = argv[++i];
    } else if (arg.startsWith("--password=")) {
      config.password = arg.slice("--password=".length);
    } else if (arg === "--password" && argv[i + 1]) {
      config.password = argv[++i];
    }
  }

  // 2. Env vars (only if not set by CLI)
  if (!config.url && process.env["ONEC_DEBUG_URL"]) {
    config.url = process.env["ONEC_DEBUG_URL"];
  }
  if (!config.alias && process.env["ONEC_INFOBASE_ALIAS"]) {
    config.alias = process.env["ONEC_INFOBASE_ALIAS"];
  }
  if (!config.password && process.env["ONEC_DEBUG_PASSWORD"]) {
    config.password = process.env["ONEC_DEBUG_PASSWORD"];
  }

  // 3. Project config file (only for values still missing)
  if (!config.url || !config.alias) {
    const projectConfig = findProjectConfig();
    if (projectConfig) {
      if (!config.url && projectConfig.url) config.url = projectConfig.url;
      if (!config.alias && projectConfig.alias) config.alias = projectConfig.alias;
      if (!config.password && projectConfig.password) config.password = projectConfig.password;
    }
  }

  return config;
}
