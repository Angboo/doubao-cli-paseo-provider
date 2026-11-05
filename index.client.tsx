import type { PluginClientContext } from "@getpaseo/plugin/client";

export default function contribute(_client: PluginClientContext) {
  // Provider is registered on the daemon server subprocess.
  return () => {};
}
