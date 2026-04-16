import type { ModuleID, TargetID } from "./requests.js";

export interface StackFrame {
  moduleID: ModuleID;
  procedureName?: string;
  lineNo: number;
}

export interface DebugTarget {
  targetID: TargetID;
  targetIDStr?: string;
  targetType: string;
  suspended: boolean;
  seqno?: number;
}

export interface Variable {
  name: string;
  typeName: string;
  value: string;
  expandable?: boolean;
}

export interface ContextPropertyData {
  propName: string;       // base64 encoded
  isReadable?: boolean;
  isWritable?: boolean;
  isReaded?: boolean;
  errorStr?: string;      // base64 encoded, present when isReaded=false
}

export interface BaseValueInfoData {
  typeCode?: number;
  typeName?: string;
  pres?: string;          // base64 encoded
  presProcessedCorrectly?: boolean;
}

export interface CalculationResultContextPropertyInfo {
  propInfo: ContextPropertyData;
  valueInfo?: BaseValueInfoData;
}

export interface CalculationResultObjData {
  viewInterface?: string;
  valueOfContextPropInfo: CalculationResultContextPropertyInfo | CalculationResultContextPropertyInfo[];
}

export interface CalculationResultBaseData {
  evalResultState?: string;
  expressionResultID?: string;
  errorOccurred?: boolean;
  calculationResult?: CalculationResultObjData;
}

// Debug events from ping
export interface DBGUIExtCmdInfoBase {
  cmdId: string;
  targetID?: TargetID;
}

export interface DBGUIExtCmdInfoStarted extends DBGUIExtCmdInfoBase {
  cmdId: "DBGUIExtCmdInfoStarted";
}

export interface DBGUIExtCmdInfoQuit extends DBGUIExtCmdInfoBase {
  cmdId: "DBGUIExtCmdInfoQuit";
}

export interface DBGUIExtCmdInfoCallStackFormed extends DBGUIExtCmdInfoBase {
  cmdId: "DBGUIExtCmdInfoCallStackFormed";
  callStack: StackFrame[];
}

export type DebugEvent =
  | DBGUIExtCmdInfoStarted
  | DBGUIExtCmdInfoQuit
  | DBGUIExtCmdInfoCallStackFormed;

// Response wrappers
export interface RDBGPingDebugUIResponse {
  result: DebugEvent[];
}

export interface RDBGAttachDebugUIResponse {
  result: "Registered" | "RegisteredAndStarted" | "NotRegistered";
}

export interface RDBGDetachDebugUIResponse {
  result: boolean;
}

export interface RDBGGetDbgAllTargetStatesResponse {
  item: DebugTarget[];
}

export interface RDBGGetCallStackResponse {
  callStack: StackFrame[];
}

export interface RDBGEvalLocalVariablesResponse {
  result: CalculationResultBaseData | CalculationResultBaseData[];
}

export interface RDBGSetBreakpointsResponse {}
export interface RDBGStepResponse {
  item: DebugTarget[];
}
export interface RDBGTestResponse {}
export interface RDBGSetAutoAttachSettingsResponse {}
export interface RDBGAttachDetachDebugTargetsResponse {
  result: boolean;
}
export interface RDBGSetInitialDebugSettingsResponse {}
