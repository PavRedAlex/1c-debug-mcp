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

export type DebugEventUnion = StopEvent | StartedEvent | QuitEvent;
