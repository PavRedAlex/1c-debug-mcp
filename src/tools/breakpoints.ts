import type { DebugClient } from "../debugClient.js";
import type { SessionManager } from "../sessionManager.js";
import type { MetadataProvider } from "../metadataProvider.js";
import { ModuleType } from "../types/requests.js";

// PropertyID GUIDs for each module type (from onec-debug-adapter MetadataProvider.cs)
const MODULE_PROPERTY_ID: Record<string, string> = {
  ObjectModule:              "a637f77f-3840-441d-a1c3-699c8c5cb7e0",
  ManagerModule:             "d1b64a2c-8078-4982-8190-8f81aefda192",
  RecordSetModule:           "9f36fd70-4bf4-47f6-b235-935f73aab43f",
  ValueManagerModule:        "3e58c91f-9aaa-4f42-8999-4baf33907b75",
  FormModule:                "32e087ab-1491-49b6-aba7-43571b41ac2b",
  CommandModule:             "078a6af8-d22c-4248-9c33-7e90075a3d2c",
  CommonModule:              "d5963243-262e-4398-b4d7-fb16d06484f6",
  ApplicationModule:         "d22e852a-cf8a-4f77-8ccb-3548e7792bea",
  SessionModule:             "9b7bbbae-9771-46f2-9e4d-2489e0ffc702",
  ExternalConnectionModule:  "a4a9c1e2-1e54-4c7f-af06-4ca341198fac",
  OrdinaryApplicationModule: "a78d9ce3-4e0c-48d5-9863-ae7342eedf94",
};

// Mapping from simple moduleType to 1C platform composite type
const MODULE_TYPE_PREFIX: Record<string, string> = {
  ObjectModule: "DocumentObject",
  ManagerModule: "DocumentManager",
  FormModule: "DocumentForm",
  RecordSetModule: "DocumentRecordSet",
  CommonModule: "CommonModule",
  ApplicationModule: "ApplicationModule",
  SessionModule: "SessionModule",
  ExternalConnectionModule: "ExternalConnectionModule",
  OrdinaryApplicationModule: "OrdinaryApplicationModule",
  ValueManagerModule: "InformationRegisterValueManager",
};

/**
 * Build the composite module type string expected by 1C platform.
 * For CommonModule: just the module name.
 * For object modules: "DocumentObject.ModuleName" etc.
 */
function buildModuleType(moduleType: string, moduleName: string): string {
  if (moduleType === ModuleType.CommonModule) {
    return moduleName;
  }
  const prefix = MODULE_TYPE_PREFIX[moduleType];
  if (prefix) {
    return `${prefix}.${moduleName}`;
  }
  return `${moduleType}.${moduleName}`;
}

export function createSetBreakpointsTool(
  debugClient: DebugClient,
  sessionManager: SessionManager,
  metadata?: MetadataProvider,
) {
  return async (args: {
    moduleName: string;
    moduleType?: string;
    lines: number[];
    objectID?: string;
    targetId?: string;
  }) => {
    const { moduleName, moduleType = ModuleType.CommonModule, lines, targetId } = args;
    // Auto-resolve objectID from metadata if not provided
    let objectID = args.objectID;
    if (!objectID && metadata) {
      // Try "CommonModule.ModuleName", "Document.ModuleName", etc.
      objectID = metadata.resolveObjectId(`${MODULE_TYPE_PREFIX[moduleType] ?? moduleType}.${moduleName}`)
        ?? metadata.resolveObjectId(moduleName);
      if (objectID) {
        process.stderr.write(`[breakpoints] Auto-resolved objectID for ${moduleName}: ${objectID}\n`);
      }
    }

    if (!lines || lines.length === 0) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "Validation error", message: "At least one line number is required" }) }],
        isError: true,
      };
    }

    let session;
    try {
      session = sessionManager.requireSession();
    } catch {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "No active session" }) }],
        isError: true,
      };
    }

    try {
      await debugClient.setBreakpoints(session, {
        obj: [{
          moduleID: {
            type: buildModuleType(moduleType, moduleName) as ModuleType,
            name: moduleName,
            url: `e1cib/data/${buildModuleType(moduleType, moduleName)}`,
            objectID,
            propertyID: objectID ? MODULE_PROPERTY_ID[moduleType] : undefined,
            extensionName: objectID ? (metadata?.resolveExtensionName(objectID) ?? "") : "",
          },
          bp: lines.map((line) => ({ line })),
        }],
      }, targetId ? { id: targetId, seqno: 0 } : undefined);

      // Save breakpoints for re-sending to new targets
      const bpWorkspace = {
        obj: [{
          moduleID: {
            type: buildModuleType(moduleType, moduleName) as ModuleType,
            name: moduleName,
            url: `e1cib/data/${buildModuleType(moduleType, moduleName)}`,
            objectID,
            propertyID: objectID ? MODULE_PROPERTY_ID[moduleType] : undefined,
            extensionName: objectID ? (metadata?.resolveExtensionName(objectID) ?? "") : "",
          },
          bp: lines.map((line) => ({ line })),
        }],
      };
      session.lastBreakpoints = bpWorkspace;
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ success: true, moduleName, lines }) }],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "Failed to set breakpoints", details: String(err) }) }],
        isError: true,
      };
    }
  };
}

export function createClearBreakpointsTool(
  debugClient: DebugClient,
  sessionManager: SessionManager,
) {
  return async (args: { moduleName?: string; moduleType?: string }) => {
    let session;
    try {
      session = sessionManager.requireSession();
    } catch {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "No active session" }) }],
        isError: true,
      };
    }

    try {
      await debugClient.setBreakpoints(session, { obj: [] });
      session.lastBreakpoints = undefined;
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ success: true }) }],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: "Failed to clear breakpoints", details: String(err) }) }],
        isError: true,
      };
    }
  };
}
