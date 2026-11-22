// Adapted from amosblomqvist/pi-config. See README.md, Attribution.
import { Editor, type EditorTheme, Key, matchesKey, truncateToWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { AskOption, DisplayOption, AskAnswer } from "./types.ts";
import { getOtherLabel, sortAnswers } from "../../src/questions.ts";

function createEditorTheme(theme: any): EditorTheme {
	return {
		borderColor: (s) => theme.fg("accent", s),
		selectList: {
			selectedPrefix: (t) => theme.fg("accent", t),
			selectedText: (t) => theme.fg("accent", t),
			description: (t) => theme.fg("muted", t),
			scrollInfo: (t) => theme.fg("dim", t),
			noMatch: (t) => theme.fg("warning", t),
		},
	};
}

function addWrapped(lines: string[], text: string, width: number, indent = ""): void {
	const contentWidth = Math.max(1, width - indent.length);
	for (const line of wrapTextWithAnsi(text, contentWidth)) {
		lines.push(truncateToWidth(`${indent}${line}`, width));
	}
}

// Custom dialogs expose done(), unlike ctx.ui.editor(), so all modes can
// close on abort. Dispose removes listeners when Pi removes the component.
function bindAbort(signal: AbortSignal | undefined, cancel: () => void): () => void {
	signal?.addEventListener("abort", cancel, { once: true });
	if (signal?.aborted) queueMicrotask(cancel);
	return () => signal?.removeEventListener("abort", cancel);
}

export async function askText(ctx: any, question: string, context: string | undefined, signal?: AbortSignal): Promise<string | undefined> {
	return ctx.ui.custom((tui: any, theme: any, _kb: any, done: (value: string | undefined) => void) => {
		const editor = new Editor(tui, createEditorTheme(theme));
		const dispose = bindAbort(signal, () => done(undefined));
		editor.onSubmit = (value) => done(value);
		return {
			dispose,
			invalidate: () => editor.invalidate(),
			handleInput(data: string) {
				if (matchesKey(data, Key.escape)) done(undefined);
				else editor.handleInput(data);
				tui.requestRender();
			},
			render(width: number) {
				const lines: string[] = [];
				lines.push(truncateToWidth(theme.fg("accent", "─".repeat(width)), width));
				addWrapped(lines, theme.fg("text", ` ${question}`), width);
				if (context) {
					lines.push("");
					addWrapped(lines, theme.fg("muted", ` ${context}`), width);
				}
				lines.push("");
				addWrapped(lines, theme.fg("accent", "Your answer"), width);
				lines.push(...editor.render(width).map((line) => truncateToWidth(line, width)));
				lines.push(truncateToWidth(theme.fg("dim", "Enter submit • Esc cancel"), width));
				lines.push(truncateToWidth(theme.fg("accent", "─".repeat(width)), width));
				return lines;
			},
		};
	});
}

// Undocumented convenience key: submit from any row, or save the Other text and
// submit in one step. Terminals without the Kitty keyboard protocol or
// modifyOtherKeys send plain Enter instead, so this key is never the only path.
const SUBMIT_ANYWHERE = "ctrl+enter";

export async function askChoice(
	ctx: any,
	question: string,
	context: string | undefined,
	options: AskOption[],
	maxSelections: number,
	signal?: AbortSignal,
): Promise<AskAnswer[] | null> {
	const single = maxSelections === 1;
	// Single-select words the custom row as a note: it can add to one option
	// instead of replacing it, so "Other" reads wrong there.
	const otherLabel = getOtherLabel(options, single ? "Note" : "Other");
	const choiceItems: DisplayOption[] = options.map((option, index) => ({
		...option,
		id: `option:${index}`,
		index: index + 1,
	}));
	const otherItem: DisplayOption = {
		id: "other",
		label: `[${otherLabel}]`,
		value: "__other__",
		isOther: true,
		index: choiceItems.length + 1,
	};
	const submitItem: DisplayOption = { id: "submit", label: "Submit", value: "__submit__", isSubmit: true };
	const allItems: DisplayOption[] = [...choiceItems, otherItem, submitItem];

	return ctx.ui.custom<AskAnswer[] | null>((tui: any, theme: any, _kb: any, done: (result: AskAnswer[] | null) => void) => {
		let optionIndex = 0;
		let editMode = false;
		let cachedLines: string[] | undefined;
		let cachedWidth = -1;
		const dispose = bindAbort(signal, () => done(null));
		const selected = new Map<string, AskAnswer>();
		const editor = new Editor(tui, createEditorTheme(theme));

		function refresh() {
			cachedLines = undefined;
			tui.requestRender();
		}

		// Empty input clears the row. The renderer fills the circle as soon as the
		// editor opens, so the row follows the user instead of the saved value.
		function storeOther(value: string) {
			const trimmed = value.trim();
			if (trimmed) selected.set("other", { type: "other", label: trimmed, value: trimmed });
			else selected.delete("other");
			refresh();
			return trimmed.length > 0;
		}

		function submit() {
			if (selected.size === 0) return;
			done(sortAnswers(Array.from(selected.values())));
		}

		function editOther() {
			editMode = true;
			editor.setText(selected.get("other")?.label || "");
			refresh();
		}

		editor.onSubmit = (value) => {
			storeOther(value);
			editMode = false;
			refresh();
		};

		function toggleOption(item: DisplayOption) {
			if (selected.has(item.id)) {
				selected.delete(item.id);
				refresh();
				return;
			}
			// Other text does not count against the limit, so a single answer can
			// still carry custom text. A full selection is replaced, not extended.
			const listed = [...selected.keys()].filter((id) => id !== "other");
			if (listed.length >= maxSelections) {
				for (const id of listed) selected.delete(id);
			}
			selected.set(item.id, {
				type: "option",
				label: item.label,
				value: item.value,
				index: item.index!,
			});
			refresh();
		}

		function handleInput(data: string) {
			if (matchesKey(data, SUBMIT_ANYWHERE)) {
				if (editMode) {
					if (!storeOther(editor.getText())) return;
					editMode = false;
				}
				submit();
				return;
			}

			if (editMode) {
				if (matchesKey(data, Key.escape)) {
					editMode = false;
					editor.setText(selected.get("other")?.label || "");
					refresh();
					return;
				}
				editor.handleInput(data);
				refresh();
				return;
			}

			if (matchesKey(data, Key.up)) {
				optionIndex = Math.max(0, optionIndex - 1);
				refresh();
				return;
			}
			if (matchesKey(data, Key.down)) {
				optionIndex = Math.min(allItems.length - 1, optionIndex + 1);
				refresh();
				return;
			}

			const number = ["1", "2", "3", "4", "5", "6", "7", "8", "9"].find((key) => matchesKey(data, key));
			const numberedItem = number ? allItems[Number(number) - 1] : undefined;
			if (numberedItem && !numberedItem.isSubmit) {
				optionIndex = Number(number) - 1;
				// Other has no value until the user types one, so its number opens
				// the editor instead of toggling a selection.
				if (numberedItem.isOther) editOther();
				else toggleOption(numberedItem);
				return;
			}

			const current = allItems[optionIndex];
			if (matchesKey(data, Key.space)) {
				if (current.isSubmit) return;
				if (current.isOther) {
					if (selected.has("other")) {
						selected.delete("other");
						refresh();
					} else {
						editOther();
					}
					return;
				}
				toggleOption(current);
				return;
			}

			if (matchesKey(data, Key.enter)) {
				if (current.isOther) {
					editOther();
					return;
				}
				// Enter belongs to the two rows that do something: the editor and
				// Submit. On an option row it must not confirm a selection made
				// somewhere else.
				if (current.isSubmit) submit();
				return;
			}

			if (matchesKey(data, Key.escape)) {
				done(null);
			}
		}

		function render(width: number): string[] {
			// The cache MUST be keyed on width: pi-tui calls requestRender() but NOT
			// invalidate() on terminal resize, so render() can be re-entered with a
			// new width. Returning stale wider lines trips the TUI width guard and
			// crashes the process.
			if (cachedLines && cachedWidth === width) return cachedLines;

			const lines: string[] = [];
			const add = (text: string) => lines.push(truncateToWidth(text, width));

			add(theme.fg("accent", "─".repeat(width)));
			addWrapped(lines, theme.fg("text", ` ${question}`), width);
			if (context) {
				lines.push("");
				addWrapped(lines, theme.fg("muted", ` ${context}`), width);
			}
			lines.push("");

			for (let i = 0; i < allItems.length; i++) {
				const item = allItems[i];
				const isFocused = i === optionIndex;
				const prefix = isFocused ? theme.fg("accent", "> ") : "  ";

				if (item.isSubmit) {
					// No selection marker: Submit acts on the selection, it is not one.
					const label = selected.size > 0 ? `${item.label} (${selected.size} selected)` : item.label;
					const styled = isFocused
						? theme.fg("accent", theme.bold(label))
						: theme.fg(selected.size > 0 ? "success" : "dim", theme.bold(label));
					add(`${prefix}${styled}`);
					continue;
				}

				if (item.isOther) {
					const other = selected.get("other");
					const opened = Boolean(other) || editMode;
					const marker = opened ? theme.fg("success", "●") : theme.fg("dim", "○");
					const suffix = other ? ` — ${other.label}` : "";
					const number = item.index! <= 9 ? String(item.index) : "·";
					add(`${prefix}${number} ${marker} ${theme.fg("text", `${item.label}${suffix}`)}`);
					continue;
				}

				const checked = selected.has(item.id);
				const marker = checked ? theme.fg("success", "●") : theme.fg("dim", "○");
				const number = item.index! <= 9 ? String(item.index) : "·";
				add(`${prefix}${number} ${marker} ${theme.fg("text", item.label)}`);
				if (item.description) {
					addWrapped(lines, theme.fg("muted", item.description), width, "     ");
				}
			}

			if (editMode) {
				lines.push("");
				addWrapped(lines, theme.fg("accent", "Your answer"), width);
				lines.push(...editor.render(width).map((line) => truncateToWidth(line, width)));
				add(theme.fg("dim", "Enter save • Esc go back"));
			} else {
				lines.push("");
				if (selected.size === 0) {
					add(theme.fg("warning", " Select at least one answer before submitting."));
				}
				const action = single ? "select" : "toggle";
				add(theme.fg("dim", ` ↑↓ navigate • 1-9/${theme.bold("SPACE")} ${action} • Enter Submit/Other • Esc cancel`));
			}

			add(theme.fg("accent", "─".repeat(width)));
			cachedLines = lines;
			cachedWidth = width;
			return lines;
		}

		return {
			render,
			invalidate: () => {
				cachedLines = undefined;
			},
			handleInput,
			dispose,
		};
	});
}
