// Single chokepoint for session persistence (load/save the per-launch tabs+active state).
// The on-disk session.json is owned by the Rust side (src-tauri/src/session.rs); this module
// is the only TS importer of `invoke("load_session" | "save_session")`. The schema mirrors
// the Rust SessionRecord struct exactly (snake_case fields, version=1).

import { invoke } from "@tauri-apps/api/core";

export type SessionTabEntry = { path: string };

export type SessionRecord = {
  version: 1;
  tabs: SessionTabEntry[];
  active_index: number | null;
};

export async function loadSession(): Promise<SessionRecord> {
  try {
    return await invoke<SessionRecord>("load_session");
  } catch (err) {
    console.warn("load_session failed; treating as empty session:", err);
    return { version: 1, tabs: [], active_index: null };
  }
}

export async function saveSession(record: SessionRecord): Promise<void> {
  try {
    await invoke<void>("save_session", { record });
  } catch (err) {
    console.warn("save_session failed; session not persisted this round:", err);
  }
}
