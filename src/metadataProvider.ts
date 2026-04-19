import { promises as fsp } from "fs";
import { join, resolve } from "path";

/**
 * Maps objectID (UUID from XML) → human-readable module path
 * e.g. "87dad256-..." → "CommonModule.ОбновлениеИнформационнойБазы"
 */
export class MetadataProvider {
  private readonly objectIdToName = new Map<string, string>();
  private readonly objectIdToExtension = new Map<string, string>();
  private _ready = false;
  private _cfPath?: string;
  private _cfePaths?: string[];
  private _epfPaths?: string[];

  get isReady(): boolean { return this._ready; }
  get moduleCount(): number { return this.objectIdToName.size; }

  constructor() {
    // Empty — call load() after MCP server has started
  }

  async load(cfPath?: string, cfePaths?: string[], epfPaths?: string[]): Promise<void> {
    this._cfPath = cfPath;
    this._cfePaths = cfePaths;
    this._epfPaths = epfPaths;
    await this._doLoad(cfPath, cfePaths, epfPaths, false);
  }

  async reload(skipCache = false): Promise<{ moduleCount: number }> {
    this._ready = false;
    this.objectIdToName.clear();
    this.objectIdToExtension.clear();
    await this._doLoad(this._cfPath, this._cfePaths, this._epfPaths, skipCache);
    return { moduleCount: this.objectIdToName.size };
  }

  private async _doLoad(cfPath?: string, cfePaths?: string[], epfPaths?: string[], skipCache = false): Promise<void> {
    // Note: TypeScript version doesn't implement caching yet
    // skipCache parameter is accepted for API compatibility with Go version
    if (skipCache) {
      process.stderr.write(`[MetadataProvider] skipCache requested (not implemented in TS version)\n`);
    }

    if (cfPath) {
      const absPath = resolve(process.cwd(), cfPath);
      if (await this.exists(absPath)) {
        await this.scan(absPath, "");
        process.stderr.write(`[MetadataProvider] Loaded ${this.objectIdToName.size} modules from ${absPath}\n`);
      } else {
        process.stderr.write(`[MetadataProvider] cfPath not found: ${absPath}\n`);
      }
    }

    if (cfePaths) {
      for (const cfePath of cfePaths) {
        const absPath = resolve(process.cwd(), cfePath);
        if (!await this.exists(absPath)) {
          process.stderr.write(`[MetadataProvider] cfePath not found: ${absPath}\n`);
          continue;
        }
        const configXml = join(absPath, "Configuration.xml");
        let extensionDirs: string[];
        if (await this.exists(configXml)) {
          extensionDirs = [absPath];
        } else {
          const entries = await fsp.readdir(absPath);
          extensionDirs = [];
          for (const entry of entries) {
            const p = join(absPath, entry);
            if (await this.exists(join(p, "Configuration.xml"))) {
              extensionDirs.push(p);
            }
          }
        }

        for (const extDir of extensionDirs) {
          const extName = await this.extractExtensionName(extDir) ?? extDir.split(/[\\/]/).pop() ?? extDir;
          const before = this.objectIdToName.size;
          await this.scan(extDir, extName);
          process.stderr.write(`[MetadataProvider] Loaded ${this.objectIdToName.size - before} modules from extension ${extName} (${extDir})\n`);
        }
      }
    }

    if (epfPaths) {
      for (const epfPath of epfPaths) {
        const absPath = resolve(process.cwd(), epfPath);
        if (!await this.exists(absPath)) {
          process.stderr.write(`[MetadataProvider] epfPath not found: ${absPath}\n`);
          continue;
        }
        const before = this.objectIdToName.size;
        await this.scanEpf(absPath);
        process.stderr.write(`[MetadataProvider] Loaded ${this.objectIdToName.size - before} modules from EPF path ${absPath}\n`);
      }
    }

    this._ready = true;
  }

  resolveModuleName(objectID: string): string | undefined {
    return this.objectIdToName.get(objectID.toLowerCase());
  }

  resolveExtensionName(objectID: string): string {
    return this.objectIdToExtension.get(objectID.toLowerCase()) ?? "";
  }

  /** Find objectID by module label, e.g. "CommonModule.ОбновлениеИнформационнойБазы" or just "ОбновлениеИнформационнойБазы" */
  resolveObjectId(moduleName: string): string | undefined {
    const lower = moduleName.toLowerCase();
    for (const [uuid, label] of this.objectIdToName) {
      if (label.toLowerCase() === lower) return uuid;
      // match by short name after last dot, e.g. "ОбновлениеИнформационнойБазы"
      const short = label.split(".").pop()?.toLowerCase();
      if (short === lower) return uuid;
    }
    return undefined;
  }

  private async exists(p: string): Promise<boolean> {
    return fsp.access(p).then(() => true).catch(() => false);
  }

  private async scan(cfPath: string, extensionName: string): Promise<void> {
    const mdFolders: Record<string, string> = {
      CommonModules:               "CommonModule",
      Documents:                   "Document",
      Catalogs:                    "Catalog",
      DataProcessors:              "DataProcessor",
      Reports:                     "Report",
      InformationRegisters:        "InformationRegister",
      AccumulationRegisters:       "AccumulationRegister",
      AccountingRegisters:         "AccountingRegister",
      BusinessProcesses:           "BusinessProcess",
      Tasks:                       "Task",
      ExchangePlans:               "ExchangePlan",
      ChartsOfAccounts:            "ChartOfAccounts",
      ChartsOfCalculationTypes:    "ChartOfCalculationTypes",
      ChartsOfCharacteristicTypes: "ChartOfCharacteristicTypes",
      Constants:                   "Constant",
      Sequences:                   "Sequence",
      ScheduledJobs:               "ScheduledJob",
    };

    for (const [folder, typePrefix] of Object.entries(mdFolders)) {
      const folderPath = join(cfPath, folder);
      if (!await this.exists(folderPath)) continue;

      const entries = await fsp.readdir(folderPath);
      for (const entry of entries) {
        if (!entry.endsWith(".xml")) continue;
        const xmlPath = join(folderPath, entry);
        const name = entry.replace(/\.xml$/, "");
        try {
          const uuid = await this.extractUuid(xmlPath);
          if (uuid) {
            const label = extensionName ? `${extensionName}:${typePrefix}.${name}` : `${typePrefix}.${name}`;
            this.objectIdToName.set(uuid.toLowerCase(), label);
            this.objectIdToExtension.set(uuid.toLowerCase(), extensionName);
          }
        } catch { /* skip */ }

        const formsPath = join(folderPath, name, "Forms");
        if (await this.exists(formsPath)) {
          const formEntries = await fsp.readdir(formsPath);
          for (const formEntry of formEntries) {
            if (!formEntry.endsWith(".xml")) continue;
            const formXmlPath = join(formsPath, formEntry);
            const formName = formEntry.replace(/\.xml$/, "");
            try {
              const formUuid = await this.extractUuid(formXmlPath);
              if (formUuid) {
                const label = extensionName
                  ? `${extensionName}:${typePrefix}.${name}/Form/${formName}`
                  : `${typePrefix}.${name}/Form/${formName}`;
                this.objectIdToName.set(formUuid.toLowerCase(), label);
                this.objectIdToExtension.set(formUuid.toLowerCase(), extensionName);
              }
            } catch { /* skip */ }
          }
        }
      }
    }
  }

  private async scanEpf(epfRoot: string): Promise<void> {
    const entries = await fsp.readdir(epfRoot);
    for (const entry of entries) {
      const processorDir = join(epfRoot, entry);
      const xmlPath = join(processorDir, `${entry}.xml`);
      const objDir = join(processorDir, entry);

      if (!await this.exists(xmlPath)) continue;
      try {
        const uuid = await this.extractUuid(xmlPath);
        if (!uuid) continue;
        const content = await fsp.readFile(xmlPath, "utf-8");
        const typeMatch = content.match(/<(ExternalDataProcessor|ExternalReport)\s+uuid=/);
        const typePrefix = typeMatch?.[1] === "ExternalReport" ? "ExternalReport" : "ExternalDataProcessor";
        this.objectIdToName.set(uuid.toLowerCase(), `${typePrefix}.${entry}`);
        this.objectIdToExtension.set(uuid.toLowerCase(), "");

        const formsPath = join(objDir, "Forms");
        if (await this.exists(formsPath)) {
          const formEntries = await fsp.readdir(formsPath);
          for (const formEntry of formEntries) {
            if (!formEntry.endsWith(".xml")) continue;
            try {
              const formUuid = await this.extractUuid(join(formsPath, formEntry));
              if (formUuid) {
                const formName = formEntry.replace(/\.xml$/, "");
                this.objectIdToName.set(formUuid.toLowerCase(), `${typePrefix}.${entry}/Form/${formName}`);
                this.objectIdToExtension.set(formUuid.toLowerCase(), "");
              }
            } catch { /* skip */ }
          }
        }
      } catch { /* skip */ }
    }
  }

  private async extractUuid(xmlPath: string): Promise<string | null> {
    const content = await fsp.readFile(xmlPath, "utf-8");
    const match = content.match(/uuid="([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})"/);
    return match ? match[1] : null;
  }

  private async extractExtensionName(cfePath: string): Promise<string | null> {
    const configXml = join(cfePath, "Configuration.xml");
    if (!await this.exists(configXml)) return null;
    const content = await fsp.readFile(configXml, "utf-8");
    const match = content.match(/<Name>([^<]+)<\/Name>/);
    return match ? match[1] : null;
  }
}
