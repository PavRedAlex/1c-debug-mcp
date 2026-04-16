export interface Config {
  url?: string;
  alias?: string;
  password?: string;
  cfPath?: string;
  cfePaths?: string[]; // paths to extension folders, e.g. ["src/cfe/MyExt"]
  epfPaths?: string[]; // paths to external data processor folders, e.g. ["src/epf"]
}

/**
 * Parse configuration with priority (highest → lowest):
 * 1. CLI arguments (--url, --alias, --password, --cf-path)
 * 2. Environment variables (ONEC_DEBUG_URL, ONEC_INFOBASE_ALIAS, ONEC_DEBUG_PASSWORD, ONEC_CF_PATH)
 *
 * All settings come from mcp.json env section (project-level overrides global-level).
 */
export function parseConfig(argv: string[] = process.argv.slice(2)): Config {
  const config: Config = {};

  // 1. CLI args
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--url=")) config.url = arg.slice("--url=".length);
    else if (arg === "--url" && argv[i + 1]) config.url = argv[++i];
    else if (arg.startsWith("--alias=")) config.alias = arg.slice("--alias=".length);
    else if (arg === "--alias" && argv[i + 1]) config.alias = argv[++i];
    else if (arg.startsWith("--password=")) config.password = arg.slice("--password=".length);
    else if (arg === "--password" && argv[i + 1]) config.password = argv[++i];
    else if (arg.startsWith("--cf-path=")) config.cfPath = arg.slice("--cf-path=".length);
    else if (arg === "--cf-path" && argv[i + 1]) config.cfPath = argv[++i];
  }

  // 2. Env vars
  if (!config.url && process.env["ONEC_DEBUG_URL"]) config.url = process.env["ONEC_DEBUG_URL"];
  if (!config.alias && process.env["ONEC_INFOBASE_ALIAS"]) config.alias = process.env["ONEC_INFOBASE_ALIAS"];
  if (!config.password && process.env["ONEC_DEBUG_PASSWORD"]) config.password = process.env["ONEC_DEBUG_PASSWORD"];
  if (!config.cfPath && process.env["ONEC_CF_PATH"]) config.cfPath = process.env["ONEC_CF_PATH"];
  // ONEC_CFE_PATHS — semicolon-separated list of extension paths
  if (!config.cfePaths && process.env["ONEC_CFE_PATHS"]) {
    config.cfePaths = process.env["ONEC_CFE_PATHS"].split(";").map(p => p.trim()).filter(Boolean);
  }
  if (!config.epfPaths && process.env["ONEC_EPF_PATHS"]) {
    config.epfPaths = process.env["ONEC_EPF_PATHS"].split(";").map(p => p.trim()).filter(Boolean);
  }

  return config;
}
