import type { ProviderContent, ProviderPrompt } from "@getpaseo/plugin/server/provider";

export function formatPromptContent(content: ProviderContent[]): string {
  const parts: string[] = [];

  for (const item of content) {
    switch (item.type) {
      case "text":
        if (item.text.trim()) {
          parts.push(item.text);
        }
        break;
      case "image":
        parts.push(`[Image attachment: ${item.mimeType}]`);
        break;
      case "uploaded_file":
        parts.push(`[Attached file: ${item.fileName} (${item.path})]`);
        break;
      case "github_pr":
      case "forge_change_request":
        parts.push(
          `[PR #${item.number}: ${item.title}]\nURL: ${item.url}\n${item.body ?? ""}`,
        );
        break;
      case "github_issue":
      case "forge_issue":
        parts.push(
          `[Issue #${item.number}: ${item.title}]\nURL: ${item.url}\n${item.body ?? ""}`,
        );
        break;
      case "review": {
        const commentSummaries = item.comments
          .map(
            (c) =>
              `- ${c.filePath}:${c.lineNumber} (${c.side}): ${c.body}`,
          )
          .join("\n");
        parts.push(`[Code Review Comments]\n${commentSummaries}`);
        break;
      }
    }
  }

  return parts.join("\n\n");
}

export function extractPromptText(prompt: ProviderPrompt): string {
  if (prompt.input.type === "command") {
    return `/${prompt.input.name} ${prompt.input.arguments}`.trim();
  }
  return formatPromptContent(prompt.input.content);
}
