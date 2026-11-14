import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

// The extension owns only the text between these markers. Everything else in
// AGENTS.md stays untouched.
export const RULE_START = "<!-- pi-questions:decision-rule:start -->";
export const RULE_END = "<!-- pi-questions:decision-rule:end -->";

export const RULE_FILE = "AGENTS.md";
export const CONFIG_DIR = ".pi";
export const CONFIG_NAME = "questions.json";

export type DecisionRule = "on" | "off";
export type Settings = { decisionRule?: DecisionRule };
export type UpsertAction = "created" | "appended" | "replaced" | "unchanged" | "invalid";

const RULE_LINES = [
  RULE_START,
  "## Decision questions",
  "",
  "When the next step depends on a choice, call the `ask_user_question` tool before you continue.",
  "Do not list open decisions as prose.",
  "Ask one question per tool call.",
  "Give options when the choices are known.",
  "",
  RULE_END,
];

export function buildRuleBlock(): string {
  return RULE_LINES.join("\n");
}

export function hasRuleBlock(text: string): boolean {
  return text.includes(RULE_START) && text.includes(RULE_END);
}

export function hasPartialRuleBlock(text: string): boolean {
  const start = text.includes(RULE_START);
  const end = text.includes(RULE_END);
  return start !== end;
}

// Replace only the marked block. Append it when the file has no markers.
// Return the input unchanged when one marker is missing, so a damaged file is
// never rewritten.
export function upsertRuleBlock(text: string): { content: string; action: UpsertAction } {
  const current = typeof text === "string" ? text : "";
  if (hasPartialRuleBlock(current)) {
    return { content: current, action: "invalid" };
  }
  if (hasRuleBlock(current)) {
    const start = current.indexOf(RULE_START);
    const end = current.indexOf(RULE_END) + RULE_END.length;
    const content = current.slice(0, start) + buildRuleBlock() + current.slice(end);
    return { content, action: content === current ? "unchanged" : "replaced" };
  }
  if (current.trim().length === 0) {
    return { content: `${buildRuleBlock()}\n`, action: "created" };
  }
  const separator = current.endsWith("\n\n") ? "" : current.endsWith("\n") ? "\n" : "\n\n";
  return { content: `${current}${separator}${buildRuleBlock()}\n`, action: "appended" };
}

export function parseDecisionRule(value: unknown): DecisionRule | undefined {
  return value === "on" || value === "off" ? value : undefined;
}

export function parseConfig(text: string | null): { settings: Settings; raw: Record<string, unknown>; error?: string } {
  if (typeof text !== "string" || text.trim().length === 0) {
    return { settings: {}, raw: {} };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { settings: {}, raw: {}, error: "the configuration is not valid JSON" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { settings: {}, raw: {}, error: "the configuration must be a JSON object" };
  }
  const raw = parsed as Record<string, unknown>;
  const settings: Settings = {};
  let error: string | undefined;
  if (raw.decisionRule !== undefined) {
    const decisionRule = parseDecisionRule(raw.decisionRule);
    if (decisionRule) {
      settings.decisionRule = decisionRule;
    } else {
      error = 'decisionRule must be "on" or "off"';
    }
  }
  return error ? { settings, raw, error } : { settings, raw };
}

export function configPath(cwd: string): string {
  return join(cwd, CONFIG_DIR, CONFIG_NAME);
}

export function rulePath(cwd: string): string {
  return join(cwd, RULE_FILE);
}

export async function readRuleFile(cwd: string): Promise<string | null> {
  return readTextFile(rulePath(cwd));
}

async function readTextFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as { code?: string })?.code === "ENOENT") return null;
    throw error;
  }
}

export async function readConfig(cwd: string): Promise<{
  settings: Settings;
  raw: Record<string, unknown>;
  error?: string;
  path: string;
  exists: boolean;
}> {
  const path = configPath(cwd);
  const text = await readTextFile(path);
  const parsed = parseConfig(text);
  return { ...parsed, path, exists: text !== null };
}

// Keep unknown keys so another feature or a newer version can share the file.
export async function writeConfig(cwd: string, patch: Settings): Promise<string> {
  const path = configPath(cwd);
  const text = await readTextFile(path);
  const { raw } = parseConfig(text);
  const next = { ...raw, ...patch };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return path;
}

export async function installRuleBlock(cwd: string): Promise<{ content: string; action: UpsertAction; path: string }> {
  const path = rulePath(cwd);
  const current = await readTextFile(path);
  const result = upsertRuleBlock(current ?? "");
  if (result.action !== "unchanged" && result.action !== "invalid") {
    await writeFile(path, result.content, "utf8");
  }
  return { ...result, path };
}
