import { spawnProcess } from "@getpaseo/plugin/server";
import type {
  ProviderCatalog,
  ProviderLaunch,
  ProviderModel,
  ProviderMode,
  ProviderThinkingOption,
} from "@getpaseo/plugin/server/provider";

const PROBE_FLAG = "__probe_options__";

export const FALLBACK_MODELS: ProviderModel[] = [
  { id: "Auto", label: "Auto", isDefault: true },
];

export const FALLBACK_THINKING_OPTIONS: ProviderThinkingOption[] = [
  { id: "high", label: "high", isDefault: true },
];

export const FALLBACK_MODES: ProviderMode[] = [
  { id: "ask_risky", label: "ask_risky" },
  { id: "ask_always", label: "ask_always" },
  { id: "always_allow", label: "always_allow", isUnattended: true },
];

let cachedCatalog: ProviderCatalog | null = null;

export async function fetchDynamicCatalog(
  launch?: ProviderLaunch,
  cwd?: string,
): Promise<ProviderCatalog> {
  if (cachedCatalog) {
    return cachedCatalog;
  }

  if (!launch) {
    return {
      models: FALLBACK_MODELS,
      modes: FALLBACK_MODES,
      thinkingOptions: FALLBACK_THINKING_OPTIONS,
      defaultModel: "Auto",
      defaultMode: "ask_risky",
      defaultThinkingOption: "high",
    };
  }

  const [models, thinkingOptions, modes] = await Promise.all([
    probeModels(launch, cwd),
    probeThinkingOptions(launch, cwd),
    probeModes(launch, cwd),
  ]);

  cachedCatalog = {
    models: models.length > 0 ? models : FALLBACK_MODELS,
    modes: modes.length > 0 ? modes : FALLBACK_MODES,
    thinkingOptions:
      thinkingOptions.length > 0 ? thinkingOptions : FALLBACK_THINKING_OPTIONS,
    defaultModel:
      models.find((m) => m.isDefault)?.id ?? models[0]?.id ?? "Auto",
    defaultMode: modes[0]?.id ?? "ask_risky",
    defaultThinkingOption:
      thinkingOptions.find((t) => t.isDefault)?.id ??
      thinkingOptions[0]?.id ??
      "high",
  };

  return cachedCatalog;
}

export function clearCatalogCache(): void {
  cachedCatalog = null;
}

function runProbeCommand(
  command: string,
  args: string[],
  env: Record<string, string>,
  cwd?: string,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    try {
      const child = spawnProcess(command, args, {
        cwd,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on("close", () => {
        resolve({ stdout, stderr });
      });
      child.on("error", () => {
        resolve({ stdout, stderr });
      });
    } catch {
      resolve({ stdout: "", stderr: "" });
    }
  });
}

async function probeModels(
  launch: ProviderLaunch,
  cwd?: string,
): Promise<ProviderModel[]> {
  try {
    const { stdout, stderr } = await runProbeCommand(
      launch.command,
      [...launch.args, "--model", PROBE_FLAG, "-p", "probe"],
      launch.env,
      cwd,
    );

    const output = `${stdout}\n${stderr}`;
    // Format: "Available models: Auto, Doubao 2.1 Lite, ... Start doubao without ..."
    const match = /Available models:\s*([^\n\r]+?)(?:\.\s*Start|\.\s*$|$)/i.exec(
      output,
    );
    if (!match) return [];

    const rawList = match[1]
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    return rawList.map((modelName) => ({
      id: modelName,
      label: modelName,
      isDefault: modelName.toLowerCase() === "auto",
    }));
  } catch {
    return [];
  }
}

async function probeThinkingOptions(
  launch: ProviderLaunch,
  cwd?: string,
): Promise<ProviderThinkingOption[]> {
  try {
    const { stdout, stderr } = await runProbeCommand(
      launch.command,
      [...launch.args, "--effort", PROBE_FLAG, "-p", "probe"],
      launch.env,
      cwd,
    );

    const output = `${stdout}\n${stderr}`;
    // Format: "--effort must be one of: none, minimal, ... (invalid_arguments)"
    const match = /--effort must be one of:\s*([^\n\r]+?)(?:\.\s*\(|\.\s*$|$)/i.exec(
      output,
    );
    if (!match) return [];

    const rawList = match[1]
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    return rawList.map((effort) => ({
      id: effort,
      label: effort,
      isDefault: effort === "high",
    }));
  } catch {
    return [];
  }
}

async function probeModes(
  launch: ProviderLaunch,
  cwd?: string,
): Promise<ProviderMode[]> {
  try {
    const { stdout, stderr } = await runProbeCommand(
      launch.command,
      [...launch.args, "--permission-mode", PROBE_FLAG, "-p", "probe"],
      launch.env,
      cwd,
    );

    const output = `${stdout}\n${stderr}`;
    // Format: "--permission-mode must be one of: ask_always, ... (invalid_arguments)"
    const match = /--permission-mode must be one of:\s*([^\n\r]+?)(?:\.\s*\(|\.\s*$|$)/i.exec(
      output,
    );
    if (!match) return [];

    const rawList = match[1]
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    return rawList.map((mode) => ({
      id: mode,
      label: mode,
      isUnattended: mode === "always_allow",
    }));
  } catch {
    return [];
  }
}
