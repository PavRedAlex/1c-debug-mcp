import { v4 as uuidv4 } from "uuid";
import type { BPWorkspaceInternal } from "./types/requests.js";

export interface Session {
  id: string;
  url: string;
  alias: string;
  password?: string;
  lastBreakpoints?: BPWorkspaceInternal;
}

export class NoSessionError extends Error {
  constructor() {
    super("No active debug session. Call 'attach' first.");
    this.name = "NoSessionError";
  }
}

export class SessionManager {
  private session: Session | null = null;

  getSession(): Session | null {
    return this.session;
  }

  createSession(url: string, alias: string, password?: string): Session {
    this.session = {
      id: uuidv4(),
      url,
      alias,
      password,
    };
    return this.session;
  }

  clearSession(): void {
    this.session = null;
  }

  requireSession(): Session {
    if (!this.session) {
      throw new NoSessionError();
    }
    return this.session;
  }
}

export const sessionManager = new SessionManager();
