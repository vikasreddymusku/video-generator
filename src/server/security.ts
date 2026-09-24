import ipaddr from "ipaddr.js";
import path from "node:path";
import { realpath } from "node:fs/promises";
export class ClientError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function safeMessage(error: unknown): string {
  let message = error instanceof Error ? error.message : "Operation failed.";
  for (const [key, value] of Object.entries(process.env))
    if (value && /KEY|SECRET|TOKEN|PASSWORD/i.test(key))
      message = message.split(value).join("[redacted]");
  return message
    .replace(/(?:Bearer\s+|sk-)[\w.-]+/gi, "[redacted]")
    .replace(/[A-Z]:[\\/][^\s"'<>]+/gi, "[local path]")
    .replace(/\/(?:home|Users|tmp|var)\/[^\s"'<>]+/g, "[local path]")
    .slice(0, 1200);
}
export function validateName(name: string) {
  if (
    !name ||
    name.length > 200 ||
    /[\\/:]/.test(name) ||
    [...name].some((char) => char.charCodeAt(0) < 32) ||
    name === "." ||
    name === ".."
  )
    throw new ClientError("Use a plain filename without directory paths.");
  return name;
}
export function publicAddress(address: string) {
  try {
    return ipaddr.process(address).range() === "unicast";
  } catch {
    return false;
  }
}
export function validateUrl(reference: string) {
  let url: URL;
  try {
    url = new URL(reference);
  } catch {
    throw new ClientError("Enter a valid HTTPS URL.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    reference.length > 2048
  )
    throw new ClientError(
      "Sources must use HTTPS on port 443 without credentials.",
    );
  if (
    !host.includes(".") ||
    /(?:^|\.)(localhost|local|internal|home|test|invalid)$/.test(host) ||
    (ipaddr.isValid(host) && !publicAddress(host))
  )
    throw new ClientError("Local and private network sources are not allowed.");
  url.hash = "";
  return url;
}
export async function confinedFile(base: string, file: string) {
  const [realBase, realFile] = await Promise.all([
    realpath(base),
    realpath(file),
  ]);
  const relative = path.relative(realBase, realFile);
  if (relative.startsWith("..") || path.isAbsolute(relative) || !relative)
    throw new ClientError("Artifact unavailable.", 404);
  return realFile;
}
