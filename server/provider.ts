import { createHash } from "node:crypto";
import { execCommand } from "@getpaseo/plugin/server";
import {
  negotiateProviderCapabilities,
  requireProviderCapabilities,
  type ProviderCatalog,
  type ProviderConnection,
  type ProviderEvent,
  type ProviderInput,
  type ProviderLaunch,
  type ProviderRegistration,
  type ProviderStatus,
} from "@getpaseo/plugin/server/provider";
import {
  fetchDynamicCatalog,
} from "./catalog.js";
import { listSessions } from "./list-sessions.js";
import { Session } from "./session.js";
import { DoubaoError } from "./wire.js";

const SUPPORTED_CAPABILITIES = [
  "prompt.message",
  "session.configure",
  "session.persistence",
  "session.can_stop_runtime",
  "session.list",
] as const;

export function createDoubaoProvider(): ProviderRegistration {
  return {
    id: "doubao",
    label: "Doubao CLI",
    description: "Doubao Coding Agent via official doubao CLI",
    icon: "icon.svg",
    command: ["doubao"],

    async status({ launch }): Promise<ProviderStatus> {
      if (!launch) {
        return {
          available: false,
          diagnostic:
            "doubao command not found. Please install doubao CLI and ensure it is in your PATH.",
        };
      }

      try {
        const { stdout, stderr } = await execCommand(
          launch.command,
          [...launch.args, "auth", "status"],
          {
            env: launch.env,
            timeout: 5000,
          },
        );

        if (
          stdout.includes("登录成功") ||
          stdout.includes("用户 ID") ||
          stderr.includes("登录成功")
        ) {
          return { available: true };
        }

        return {
          available: false,
          diagnostic:
            "Doubao CLI is installed but not logged in. Please run `doubao login` in your terminal.",
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          available: false,
          diagnostic: `Failed to probe doubao CLI: ${message}`,
        };
      }
    },

    async getCatalogCacheKey({ launch }) {
      if (!launch) return undefined;
      const env = Object.entries(launch.env).sort(([a], [b]) =>
        a.localeCompare(b),
      );
      return createHash("sha256")
        .update(JSON.stringify([launch.command, launch.args, env]))
        .digest("hex");
    },

    async connect(request) {
      if (!request.versions.includes(1)) {
        throw new DoubaoError("Provider protocol version 1 is required");
      }
      if (!request.launch) {
        throw new DoubaoError("The daemon must supply the Doubao launch parameters");
      }
      const negotiated = negotiateProviderCapabilities(
        request.capabilities,
        SUPPORTED_CAPABILITIES,
      );
      return createConnection(request.launch, negotiated);
    },
  };
}

function createConnection(
  launch: ProviderLaunch,
  negotiated: readonly string[],
): ProviderConnection {
  const sessions = new Map<string, Session>();
  const listeners = new Set<(event: ProviderEvent) => void>();
  let discovered: ProviderCatalog | null = null;
  let closed = false;
  let pending = Promise.resolve();

  function emit(event: ProviderEvent): void {
    if (closed) return;
    for (const listener of listeners) {
      listener(event);
    }
  }

  async function catalog(cwd?: string): Promise<ProviderCatalog> {
    if (discovered === null) {
      discovered = await fetchDynamicCatalog(launch, cwd);
    }
    return discovered;
  }

  function getSession(id: string): Session {
    const s = sessions.get(id);
    if (!s) {
      throw new DoubaoError(`Unknown Doubao session: ${id}`);
    }
    return s;
  }

  async function dispatch(input: ProviderInput): Promise<void> {
    switch (input.type) {
      case "catalog":
        discovered = await fetchDynamicCatalog(launch, input.cwd);
        emit({
          type: "catalog",
          requestId: input.requestId,
          catalog: discovered,
        });
        return;

      case "sessions": {
        const sessionSummaries = await listSessions(launch, input.cwd);
        emit({
          type: "sessions",
          requestId: input.requestId,
          sessions: sessionSummaries,
        });
        return;
      }

      case "session.open": {
        if (sessions.has(input.sessionId)) {
          throw new DoubaoError(`Session already exists: ${input.sessionId}`);
        }
        if (discovered === null) {
          discovered = await fetchDynamicCatalog(launch, input.config.cwd);
        }

        const opened = new Session({
          id: input.sessionId,
          config: input.config,
          persistence: input.persistence,
          launch,
          catalog: () => discovered ?? {
            models: [],
            modes: [],
            thinkingOptions: [],
          },
          emit,
        });

        sessions.set(input.sessionId, opened);

        try {
          await opened.open(input.requestId, negotiated);
        } catch (error) {
          sessions.delete(input.sessionId);
          await opened.close();
          throw error;
        }
        return;
      }

      case "session.prompt":
        await getSession(input.sessionId).prompt(input.prompt);
        return;

      case "session.configure":
        getSession(input.sessionId).configure(input.changes);
        break;

      case "session.interrupt":
        await getSession(input.sessionId).interrupt();
        break;

      case "session.can_stop_runtime": {
        const s = sessions.get(input.sessionId);
        emit({
          type: "session.can_stop_runtime",
          requestId: input.requestId,
          sessionId: input.sessionId,
          canStop: s ? s.canStopRuntime() : true,
        });
        return;
      }

      case "session.close": {
        const s = sessions.get(input.sessionId);
        if (s) {
          await s.close();
          sessions.delete(input.sessionId);
        }
        emit({ type: "session.closed", sessionId: input.sessionId });
        break;
      }

      default:
        throw new DoubaoError(
          `Unsupported operation for Doubao provider: ${(input as { type: string }).type}`,
        );
    }

    emit({ type: "request.completed", requestId: input.requestId });
  }

  function failed(input: ProviderInput, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    const code = error instanceof DoubaoError ? error.code : "DOUBAO_ERROR";

    if (input.type === "session.prompt") {
      emit({
        type: "session.prompt_result",
        sessionId: input.sessionId,
        clientMessageId: input.prompt.clientMessageId,
        result: { type: "failed", error: { message, code } },
      });
    } else if ("requestId" in input) {
      emit({
        type: "request.failed",
        requestId: input.requestId,
        error: { message, code },
      });
    }
  }

  return {
    version: 1,
    capabilities: negotiated,

    async send(input) {
      if (closed) {
        throw new DoubaoError("Doubao connection is closed");
      }
      requireProviderCapabilities(negotiated, input);
      pending = pending
        .then(async () => {
          if (!closed) {
            await dispatch(input);
          }
        })
        .catch((error) => failed(input, error));
    },

    onEvent(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async close() {
      if (closed) return;
      closed = true;
      await pending;
      await Promise.all([...sessions.values()].map((s) => s.close()));
      sessions.clear();
      listeners.clear();
    },
  };
}
