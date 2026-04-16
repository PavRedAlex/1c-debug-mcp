export const NS = "http://v8.1c.ru/8.3/debugger/debugRDBGRequestResponse";

export enum StepAction {
  CONTINUE = "Continue",
  STEP_IN = "StepIn",
  STEP_OUT = "StepOut",
  STEP_OVER = "StepOver",
}

export enum ModuleType {
  CommonModule = "CommonModule",
  ObjectModule = "ObjectModule",
  ManagerModule = "ManagerModule",
  FormModule = "FormModule",
  RecordSetModule = "RecordSetModule",
  ValueManagerModule = "ValueManagerModule",
  ApplicationModule = "ApplicationModule",
  ExternalConnectionModule = "ExternalConnectionModule",
  SessionModule = "SessionModule",
  OrdinaryApplicationModule = "OrdinaryApplicationModule",
}

export enum DebugTargetType {
  Client = "Client",
  Server = "Server",
  ServerEmulation = "ServerEmulation",
  BackgroundJob = "BackgroundJob",
  WebClient = "WebClient",
  MobileClient = "MobileClient",
  MobileServer = "MobileServer",
}

export interface TargetID {
  id: string;
  seqno: number;
  appID?: string;
  targetIDStr?: string;
}

export interface ModuleID {
  type: ModuleType;
  name: string;
  url?: string;
  objectID?: string;
  propertyID?: string;
  extensionName?: string;
}

export interface Breakpoint {
  line: number;
}

export interface BPWorkspaceObject {
  moduleID: ModuleID;
  bp: Breakpoint[];
}

export interface BPWorkspaceInternal {
  obj: BPWorkspaceObject[];
}

export interface DebuggerOptions {
  noDebug?: boolean;
}

export interface RDBGBaseRequest {
  idOfDebuggerUI: string;
  infoBaseAlias: string;
}

export interface RDBGAttachDebugUIRequest extends RDBGBaseRequest {
  credentials?: string;
  options?: DebuggerOptions;
}

export interface RDBGDetachDebugUIRequest extends RDBGBaseRequest {}

export interface RDBGPingDebugUIRequest {
  idOfDebuggerUI: string;
}

export interface RDBGSetBreakpointsRequest extends RDBGBaseRequest {
  bpWorkspace: BPWorkspaceInternal;
}

export interface RDBGStepRequest extends RDBGBaseRequest {
  targetID: TargetID;
  action: StepAction;
}

export interface RDBGGetCallStackRequest extends RDBGBaseRequest {
  id: TargetID;
}

export interface CalculationSourceDataStorage {
  expression: string;
  presentationFormat?: string;
}

export interface RDBGEvalLocalVariablesRequest extends RDBGBaseRequest {
  targetID: TargetID;
  expr: CalculationSourceDataStorage[];
  calcWaitingTime?: number;
}

export interface RDBGGetTargetsRequest extends RDBGBaseRequest {}

export interface RDBGSetAutoAttachRequest extends RDBGBaseRequest {
  autoAttachSettings: {
    targetType: DebugTargetType[];
    areaName: string[];
  };
}

export interface RDBGAttachDetachDebugTargetsRequest extends RDBGBaseRequest {
  attach: boolean;
  id: TargetID[];
}

export interface RDBGTestRequest {}

export interface RDBGInitSettingsRequest extends RDBGBaseRequest {
  data: {
    breakOnNextLine?: boolean;
    bpWorkspace?: BPWorkspaceInternal;
  };
}
