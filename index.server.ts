import type { PluginServerContext } from "@getpaseo/plugin/server";
import { createDoubaoProvider } from "./server/provider.js";

export default function contribute(server: PluginServerContext) {
  server.registerProvider(createDoubaoProvider());
  return () => {};
}
