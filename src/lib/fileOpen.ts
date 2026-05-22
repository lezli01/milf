// Single chokepoint for Tauri's dialog, fs (read AND write), and window APIs.
// No other module in the app should import @tauri-apps/plugin-dialog,
// @tauri-apps/plugin-fs, or @tauri-apps/api/webviewWindow — grep for those
// module names to verify.
//
// Companion chokepoints (added in Feature 007):
//   - src/lib/session.ts        owns load_session / save_session
//   - src/lib/launchFiles.ts    owns get_pending_files + milf://open-files event

import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

export type OpenResult =
  | { kind: "ok"; name: string; path: string; content: string }
  | { kind: "cancelled" }
  | { kind: "error"; message: string };

export type SaveResult = { kind: "ok" } | { kind: "error"; message: string };

export type SaveAsResult =
  | { kind: "ok"; name: string; path: string }
  | { kind: "cancelled" }
  | { kind: "error"; message: string };

function basename(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

function friendlyMessage(err: unknown): string {
  const raw = typeof err === "string" ? err : err instanceof Error ? err.message : "";
  const lower = raw.toLowerCase();
  if (lower.includes("permission") || lower.includes("denied")) {
    return "Could not open this file: permission denied.";
  }
  if (
    lower.includes("not found") ||
    lower.includes("no such file") ||
    lower.includes("does not exist")
  ) {
    return "Could not open this file: it may have been moved or deleted.";
  }
  if (
    lower.includes("utf-8") ||
    lower.includes("invalid") ||
    lower.includes("stream did not contain") ||
    lower.includes("not a text")
  ) {
    return "Could not open this file: it does not appear to be a text file.";
  }
  return "This file could not be accessed. It may be locked, read-only, or you may not have permission.";
}

export async function openMarkdownFileByPath(path: string): Promise<OpenResult> {
  if (typeof path !== "string" || path.length === 0) {
    return { kind: "error", message: "Empty path." };
  }
  try {
    const content = await readTextFile(path);
    return { kind: "ok", name: basename(path), path, content };
  } catch (err) {
    console.warn("Failed to read file by path:", err);
    return { kind: "error", message: friendlyMessage(err) };
  }
}

export async function openMarkdownFile(): Promise<OpenResult> {
  let picked: string | string[] | null;
  try {
    picked = await open({
      multiple: false,
      directory: false,
      filters: [
        { name: "Markdown", extensions: ["md", "markdown"] },
        { name: "All Files", extensions: ["*"] },
      ],
    });
  } catch (err) {
    console.warn("Open dialog failed:", err);
    return { kind: "error", message: friendlyMessage(err) };
  }

  if (picked === null) {
    return { kind: "cancelled" };
  }

  const path = Array.isArray(picked) ? picked[0] : picked;
  if (typeof path !== "string" || path.length === 0) {
    return { kind: "cancelled" };
  }

  try {
    const content = await readTextFile(path);
    return { kind: "ok", name: basename(path), path, content };
  } catch (err) {
    console.warn("Failed to read file:", err);
    return { kind: "error", message: friendlyMessage(err) };
  }
}

export async function saveMarkdownFile(
  path: string,
  content: string,
): Promise<SaveResult> {
  try {
    await writeTextFile(path, content);
    return { kind: "ok" };
  } catch (err) {
    console.warn("Failed to save file:", err);
    return { kind: "error", message: friendlyMessage(err) };
  }
}

export async function saveMarkdownFileAs(
  content: string,
  defaultName?: string,
): Promise<SaveAsResult> {
  let picked: string | null;
  try {
    picked = await save({
      filters: [
        { name: "Markdown", extensions: ["md", "markdown"] },
        { name: "All Files", extensions: ["*"] },
      ],
      defaultPath: defaultName,
    });
  } catch (err) {
    console.warn("Save dialog failed:", err);
    return { kind: "error", message: friendlyMessage(err) };
  }

  if (picked === null) {
    return { kind: "cancelled" };
  }

  try {
    await writeTextFile(picked, content);
    return { kind: "ok", name: basename(picked), path: picked };
  } catch (err) {
    console.warn("Failed to save file:", err);
    return { kind: "error", message: friendlyMessage(err) };
  }
}

export async function setWindowTitle(fileName: string | null): Promise<void> {
  try {
    const win = getCurrentWebviewWindow();
    await win.setTitle(fileName ? `${fileName} — MILF` : "MILF");
  } catch (err) {
    console.warn("Failed to set window title:", err);
  }
}
