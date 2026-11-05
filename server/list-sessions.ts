import { execCommand } from "@getpaseo/plugin/server";
import type {
  ProviderLaunch,
  ProviderSessionSummary,
} from "@getpaseo/plugin/server/provider";

export async function listSessions(
  launch: ProviderLaunch,
  cwd?: string,
): Promise<ProviderSessionSummary[]> {
  try {
    const { stdout } = await execCommand(
      launch.command,
      [...launch.args, "--list"],
      {
        env: launch.env,
        timeout: 10000,
        maxBuffer: 1024 * 1024,
      },
    );

    const summaries: ProviderSessionSummary[] = [];
    const lines = stdout.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Format: "<session_id>  <title>"
      const match = /^([0-9a-zA-Z_-]+)\s+(.+)$/.exec(trimmed);
      if (match) {
        const [, sessionId, title] = match;
        summaries.push({
          persistence: {
            version: 1,
            data: { doubaoSessionId: sessionId },
          },
          cwd: cwd ?? process.cwd(),
          title: title.trim(),
        });
      }
    }

    return summaries;
  } catch {
    return [];
  }
}
