import { existsSync, readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";

/**
 * Maps objectID (UUID from XML) → human-readable module path
 * e.g. "87dad256-..." → "CommonModule.ОбновлениеИнформационнойБазы"
 */
export class MetadataProvider {
  private readonly objectIdToName = new Map<string, string>();
  private readonly objectIdToExtension = new Map<string, string>();

  constructor(cfPath?: string, cfePaths?: string[], epfPaths?: string[]) {
    if (cfPath) {
      const absPath = resolve(process.cwd(), cfPath);
      if (existsSync(absPath)) {
        this.scan(absPath, "");
        process.stderr.write(`[MetadataProvider] Loaded ${this.objectIdToName.size} modules from ${absPath}\n`);
      } else {
        process.stderr.write(`[MetadataProvider] cfPath not found: ${absPath}\n`);
      }
    }

    if (cfePaths) {
      for (const cfePath of cfePaths) {
        const absPath = resolve(process.cwd(), cfePath);
        if (!existsSync(absPath)) {
          process.stderr.write(`[MetadataProvider] cfePath not found: ${absPath}\n`);
          continue;
        }
        const configXml = join(absPath, "Configuration.xml");
        const extensionDirs = existsSync(configXml)
          ? [absPath]
          : readdirSync(absPath)
              .map(entry => join(absPath, entry))
              .filter(p => existsSync(join(p, "Configuration.xml")));

        for (const extDir of extensionDirs) {
          const extName = this.extractExtensionName(extDir) ?? extDir.split(/[\\/]/).pop() ?? extDir;
          const before = this.objectIdToName.size;
          this.scan(extDir, extName);
          process.stderr.write(`[MetadataProvider] Loaded ${this.objectIdToName.size - before} modules from extension ${extName} (${extDir})\n`);
        }
      }
    }

    if (epfPaths) {
      for (const epfPath of epfPaths) {
        const absPath = resolve(process.cwd(), epfPath);
        if (!existsSync(absPath)) {
          process.stderr.write(`[MetadataProvider] epfPath not found: ${absPath}\n`);
          continue;
        }
        const before = this.objectIdToName.size;
        this.scanEpf(absPath);
        process.stderr.write(`[MetadataProvider] Loaded ${this.objectIdToName.size - before} modules from EPF path ${absPath}\n`);
      }
    }
  }

  resolveModuleName(objectID: string): string | undefined {
    return this.objectIdToName.get(objectID.toLowerCase());
  }

  resolveExtensionName(objectID: string): string {
    return this.objectIdToExtension.get(objectID.toLowerCase()) ?? "";
  }

  private scan(cfPath: string, extensionName: string): void {
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
      if (!existsSync(folderPath)) continue;

      for (const entry of readdirSync(folderPath)) {
        if (!entry.endsWith(".xml")) continue;
        const xmlPath = join(folderPath, entry);
        const name = entry.replace(/\.xml$/, "");
        try {
          const uuid = this.extractUuid(xmlPath);
          if (uuid) {
            const label = extensionName ? `${extensionName}:${typePrefix}.${name}` : `${typePrefix}.${name}`;
            this.objectIdToName.set(uuid.toLowerCase(), label);
            this.objectIdToExtension.set(uuid.toLowerCase(), extensionName);
          }
        } catch { /* skip */ }

        const formsPath = join(folderPath, name, "Forms");
        if (existsSync(formsPath)) {
          for (const formEntry of readdirSync(formsPath)) {
            if (!formEntry.endsWith(".xml")) continue;
            const formXmlPath = join(formsPath, formEntry);
            const formName = formEntry.replace(/\.xml$/, "");
            try {
              const formUuid = this.extractUuid(formXmlPath);
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

  /** Scan external data processors/reports (EPF/ERF).
   * Structure: <epfRoot>/<ProcessorName>/<ProcessorName>.xml + <ProcessorName>/Forms/
   * Each subfolder of epfRoot is a separate processor.
   */
  private scanEpf(epfRoot: string): void {
    const processXml = (xmlPath: string, objDir: string) => {
      const name = xmlPath.replace(/\.xml$/, "").split(/[\\/]/).pop()!;
      try {
        const uuid = this.extractUuid(xmlPath);
        if (!uuid) return;
        const content = readFileSync(xmlPath, "utf-8");
        const typeMatch = content.match(/<(ExternalDataProcessor|ExternalReport)\s+uuid=/);
        const typePrefix = typeMatch?.[1] === "ExternalReport" ? "ExternalReport" : "ExternalDataProcessor";
        this.objectIdToName.set(uuid.toLowerCase(), `${typePrefix}.${name}`);
        this.objectIdToExtension.set(uuid.toLowerCase(), "");

        const formsPath = join(objDir, "Forms");
        if (existsSync(formsPath)) {
          for (const formEntry of readdirSync(formsPath)) {
            if (!formEntry.endsWith(".xml")) continue;
            const formXmlPath = join(formsPath, formEntry);
            const formName = formEntry.replace(/\.xml$/, "");
            try {
              const formUuid = this.extractUuid(formXmlPath);
              if (formUuid) {
                this.objectIdToName.set(formUuid.toLowerCase(), `${typePrefix}.${name}/Form/${formName}`);
                this.objectIdToExtension.set(formUuid.toLowerCase(), "");
              }
            } catch { /* skip */ }
          }
        }
      } catch { /* skip */ }
    };

    // Each subfolder of epfRoot is a separate processor:
    // epfRoot/ProcessorName/ProcessorName.xml + epfRoot/ProcessorName/ProcessorName/Forms/
    for (const entry of readdirSync(epfRoot)) {
      const processorDir = join(epfRoot, entry);
      if (!existsSync(processorDir)) continue;

      const xmlPath = join(processorDir, `${entry}.xml`);
      const objDir = join(processorDir, entry);

      if (existsSync(xmlPath)) {
        processXml(xmlPath, objDir);
      }
    }
  }

  private extractUuid(xmlPath: string): string | null {
    const content = readFileSync(xmlPath, "utf-8");
    const match = content.match(/uuid="([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})"/);
    return match ? match[1] : null;
  }

  private extractExtensionName(cfePath: string): string | null {
    const configXml = join(cfePath, "Configuration.xml");
    if (!existsSync(configXml)) return null;
    const content = readFileSync(configXml, "utf-8");
    const match = content.match(/<Name>([^<]+)<\/Name>/);
    return match ? match[1] : null;
  }
}
