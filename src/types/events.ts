import type { StackFrame } from "./responses.js";

export interface StopEvent {
  type: "DBGUIExtCmdInfoCallStackFormed";
  targetId: string;
  moduleName: string;
  lineNo: number;
  callStack: StackFrame[];
}

export interface StartedEvent {
  type: "DBGUIExtCmdInfoStarted";
  targetId: string;
}

export interface QuitEvent {
  type: "DBGUIExtCmdInfoQuit";
  targetId: string;
}

export interface ExprEvaluatedEvent {
  type: "DBGUIExtCmdInfoExprEvaluated";
  targetId: string;
  expressionResultID: string;
  evalData: unknown;
}

export type DebugEventUnion = StopEvent | StartedEvent | QuitEvent | ExprEvaluatedEvent;
