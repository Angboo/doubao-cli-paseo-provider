import { randomUUID } from "node:crypto";
import type { ChildProcess } from "node:child_process";
import { spawnProcess, terminateProcess } from "@getpaseo/plugin/server";
import type {
  ProviderCatalog,
  ProviderConfigChanges,
  ProviderEvent,
  ProviderLaunch,
  ProviderPersistence,
  ProviderPrompt,
  ProviderSessionConfig,
} from "@getpaseo/plugin/server/provider";
import { extractPromptText } from "./prompt.js";
import { DoubaoError } from "./wire.js";

interface SessionOptions {
  id: string;
  config: ProviderSessionConfig;
  launch: ProviderLaunch;
  catalog(): ProviderCatalog;
  persistence?: ProviderPersistence;
  emit(event: ProviderEvent): void;
}

export class Session {
  public readonly id: string;
  private config: ProviderSessionConfig;
  private readonly launch: ProviderLaunch;
  private readonly getCatalog: () => ProviderCatalog;
  private readonly emit: (event: ProviderEvent) => void;

  private doubaoSessionId: string | null = null;
  private activeProcess: ChildProcess | null = null;
  private interrupted = false;
  private closed = false;

  constructor(options: SessionOptions) {
    this.id = options.id;
    this.config = {
      ...options.config,
      model: options.config.model ?? "Auto",
      mode: options.config.mode ?? "ask_risky",
      thinkingOption: options.config.thinkingOption ?? "high",
    };
    this.launch = options.launch;
    this.getCatalog = options.catalog;
    this.emit = options.emit;

    if (
      options.persistence?.data &&
      typeof options.persistence.data === "object" &&
      "doubaoSessionId" in options.persistence.data &&
      typeof options.persistence.data.doubaoSessionId === "string"
    ) {
      this.doubaoSessionId = options.persistence.data.doubaoSessionId;
    }
  }

  public getPersistence(): ProviderPersistence | undefined {
    if (!this.doubaoSessionId) return undefined;
    return {
      version: 1,
      data: { doubaoSessionId: this.doubaoSessionId },
    };
  }

  public async open(
    requestId: string,
    capabilities: readonly string[],
  ): Promise<void> {
    this.emit({
      type: "session.opened",
      requestId,
      sessionId: this.id,
      capabilities,
      restoration: "core",
      persistence: this.getPersistence(),
      cwd: this.config.cwd,
      title: this.config.title ?? "Doubao Session",
    });

    this.publishConfig();

    this.emit({
      type: "session.commands",
      sessionId: this.id,
      commands: [
        { name: "help", description: "查看帮助说明" },
        { name: "auth status", description: "查看账号登录状态" },
      ],
    });

    this.emit({
      type: "session.ready",
      requestId,
      sessionId: this.id,
    });
  }

  public publishConfig(): void {
    const catalog = this.getCatalog();
    this.emit({
      type: "session.config",
      sessionId: this.id,
      config: {
        model: this.config.model ?? catalog.defaultModel ?? "Auto",
        mode: this.config.mode ?? catalog.defaultMode ?? "ask_risky",
        thinkingOption:
          this.config.thinkingOption ?? catalog.defaultThinkingOption ?? "high",
        models: catalog.models,
        modes: catalog.modes,
        thinkingOptions: catalog.thinkingOptions ?? [],
        settings: [],
      },
    });
  }

  public configure(changes: ProviderConfigChanges): void {
    if (changes.model !== undefined && changes.model !== null) {
      this.config.model = changes.model;
    }
    if (changes.mode !== undefined && changes.mode !== null) {
      this.config.mode = changes.mode;
    }
    if (
      changes.thinkingOption !== undefined &&
      changes.thinkingOption !== null
    ) {
      this.config.thinkingOption = changes.thinkingOption;
    }
    this.publishConfig();
  }

  public async prompt(prompt: ProviderPrompt): Promise<void> {
    if (this.closed) {
      throw new DoubaoError("Session is closed");
    }
    if (this.activeProcess) {
      throw new DoubaoError("A turn is already running in this session", "TURN_ACTIVE");
    }

    const text = extractPromptText(prompt);
    if (!text.trim()) {
      throw new DoubaoError("Prompt cannot be empty");
    }

    const turnId = randomUUID();
    this.interrupted = false;

    // 1. Emit user message
    this.emit({
      type: "timeline.item",
      sessionId: this.id,
      item: {
        type: "user_message",
        id: `user:${turnId}`,
        text,
        clientMessageId: prompt.clientMessageId,
      },
    });

    // 2. Report turn accepted
    this.emit({
      type: "session.prompt_result",
      sessionId: this.id,
      clientMessageId: prompt.clientMessageId,
      result: { type: "turn", turnId },
    });

    // 3. Mark turn started
    this.emit({
      type: "session.turn",
      sessionId: this.id,
      turnId,
      state: "started",
    });

    // 4. Build CLI arguments
    const args: string[] = [];

    if (this.doubaoSessionId) {
      args.push("--resume", this.doubaoSessionId);
    }

    args.push("-p", text);

    if (this.config.cwd) {
      args.push("-C", this.config.cwd);
    }

    if (this.config.model && this.config.model !== "Auto") {
      args.push("--model", this.config.model);
    }

    if (this.config.thinkingOption) {
      args.push("--effort", this.config.thinkingOption);
    }

    if (this.config.mode) {
      args.push("--permission-mode", this.config.mode);
    }

    // 5. Spawn Doubao CLI process
    // Note: stdin must be 'ignore' so node binds /dev/null to fd 0.
    const child = spawnProcess(
      this.launch.command,
      [...this.launch.args, ...args],
      {
        cwd: this.config.cwd,
        env: this.launch.env,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    this.activeProcess = child;

    let accumulatedText = "";
    let stderrText = "";

    child.stderr?.on("data", (chunk: Buffer) => {
      const chunkStr = chunk.toString();
      stderrText += chunkStr;

      // Extract session ID metadata if not yet captured
      // Doubao emits `{"type":"session","session_id":"..."}` to stderr
      const match = /\{"type":\s*"session",\s*"session_id":\s*"([^"]+)"\}/.exec(
        chunkStr,
      );
      if (match && !this.doubaoSessionId) {
        this.doubaoSessionId = match[1];
        const persistence = this.getPersistence();
        if (persistence) {
          this.emit({
            type: "session.persistence",
            sessionId: this.id,
            persistence,
          });
        }
      }
    });

    child.stdout?.on("data", (chunk: Buffer) => {
      const chunkStr = chunk.toString();
      accumulatedText += chunkStr;

      this.emit({
        type: "timeline.item",
        sessionId: this.id,
        item: {
          type: "assistant_message",
          id: `assistant:${turnId}`,
          text: accumulatedText,
        },
      });
    });

    await new Promise<void>((resolve) => {
      child.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
        this.activeProcess = null;

        if (this.interrupted || signal === "SIGINT" || signal === "SIGTERM") {
          this.emit({
            type: "session.turn",
            sessionId: this.id,
            turnId,
            state: "canceled",
          });
        } else if (code === 0) {
          // If no stdout was received but process succeeded, show a fallback message
          if (!accumulatedText.trim()) {
            this.emit({
              type: "timeline.item",
              sessionId: this.id,
              item: {
                type: "assistant_message",
                id: `assistant:${turnId}`,
                text: "（任务已完成，无额外文本输出）",
              },
            });
          }

          this.emit({
            type: "session.turn",
            sessionId: this.id,
            turnId,
            state: "completed",
          });
        } else {
          const errorMessage =
            stderrText.trim() || `Doubao CLI process exited with code ${code}`;
          this.emit({
            type: "session.turn",
            sessionId: this.id,
            turnId,
            state: "failed",
            error: {
              message: errorMessage,
              code: `EXIT_${code}`,
            },
          });
        }

        resolve();
      });

      child.on("error", (error: Error) => {
        this.activeProcess = null;
        this.emit({
          type: "session.turn",
          sessionId: this.id,
          turnId,
          state: "failed",
          error: {
            message: error.message,
            code: "SPAWN_ERROR",
          },
        });
        resolve();
      });
    });
  }

  public async interrupt(): Promise<void> {
    if (!this.activeProcess) return;
    this.interrupted = true;
    try {
      await terminateProcess(this.activeProcess, "SIGINT");
    } catch {
      // Ignore if process already exited
    }
  }

  public async close(): Promise<void> {
    this.closed = true;
    if (this.activeProcess) {
      await this.interrupt();
    }
  }

  public canStopRuntime(): boolean {
    return this.activeProcess === null;
  }
}
