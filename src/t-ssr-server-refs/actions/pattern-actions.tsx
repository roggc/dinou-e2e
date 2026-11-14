"use server";

import { SERVER_VAULT_SECRET } from "../lib/server-only-guard";
import PatternTaskUpdater from "../components/pattern-updater";
import PatternTasksList, {
  type PatternTaskItem,
} from "../components/pattern-tasks-list";

const tasksByScope = new Map<string, PatternTaskItem[]>();
const readCountsByScope = new Map<string, number>();
let nextSeq = 1;

export async function addPatternTask(scope: string, text: string) {
  const trimmed = (text ?? "").trim();
  if (trimmed.length < 3) {
    const err = new Error("Task must be at least 3 characters long.") as Error & {
      digest?: string;
    };
    err.digest = "TASK_TOO_SHORT";
    throw err;
  }

  if (!SERVER_VAULT_SECRET.startsWith("sk_live_")) {
    throw new Error("Unexpected server vault secret format.");
  }

  const id = `task-${scope}-${nextSeq++}`;
  const current = tasksByScope.get(scope) ?? [];
  current.push({ id, text: trimmed });
  tasksByScope.set(scope, current);

  return <PatternTaskUpdater key={id} scope={scope} id={id} />;
}

export async function fetchPatternTasks(scope: string) {
  const nextReads = (readCountsByScope.get(scope) ?? 0) + 1;
  readCountsByScope.set(scope, nextReads);
  const snapshot = [...(tasksByScope.get(scope) ?? [])];
  return <PatternTasksList tasks={snapshot} passAReadCount={nextReads} />;
}

export async function resetPatternTasks(scope: string) {
  tasksByScope.delete(scope);
  readCountsByScope.delete(scope);
  return { ok: true };
}

export async function getScopePassAReadCount(scope: string) {
  return readCountsByScope.get(scope) ?? 0;
}

export async function formStampAction(formData: FormData): Promise<void> {
  void formData.get("stampTag");
}

export async function boundFormStampAction(
  scope: string,
  formData: FormData
): Promise<void> {
  void scope;
  void formData.get("stampTag");
}

export default async function defaultVaultCheckAction(
  scope: string,
  tag: string
): Promise<string> {
  return `VaultOK:${scope}:${tag}:len=${SERVER_VAULT_SECRET.length}`;
}

