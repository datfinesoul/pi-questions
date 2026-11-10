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
				addWrapped(lines, theme.fg("text", question), width);
				if (context) addWrapped(lines, theme.fg("muted", context), width);
				lines.push(...editor.render(width));
				lines.push(truncateToWidth(theme.fg("dim", "Enter submit • Esc cancel"), width));
				return lines;
			},
		};
	});
}

export async function askSingleChoice(
	ctx: any,
	question: string,
	context: string | undefined,
	options: AskOption[],
	signal?: AbortSignal,
): Promise<AskAnswer | null> {
	const otherLabel = getOtherLabel(options);
	const allOptions: DisplayOption[] = [
		...options.map((option, index) => ({ ...option, id: `option:${index}`, index: index + 1 })),
		{ id: "other", label: otherLabel, value: "__other__", isOther: true },
	];

	return ctx.ui.custom<AskAnswer | null>((tui: any, theme: any, _kb: any, done: (result: AskAnswer | null) => void) => {
		const dispose = bindAbort(signal, () => done(null));
		let optionIndex = 0;
		let editMode = false;
		let cachedLines: string[] | undefined;
		let cachedWidth = -1;
		const editor = new Editor(tui, createEditorTheme(theme));

		editor.onSubmit = (value) => {
			const trimmed = value.trim();
			if (!trimmed) return;
			done({ type: "other", label: trimmed, value: trimmed });
		};

		function refresh() {
			cachedLines = undefined;
			tui.requestRender();
		}

		function handleInput(data: string) {
			if (editMode) {
				if (matchesKey(data, Key.escape)) {
					editMode = false;
					editor.setText("");
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
				optionIndex = Math.min(allOptions.length - 1, optionIndex + 1);
				refresh();
				return;
			}
			if (matchesKey(data, Key.enter)) {
				const selected = allOptions[optionIndex];
				if (selected.isOther) {
					editMode = true;
					editor.setText("");
					refresh();
					return;
				}
				done({
					type: "option",
					label: selected.label,
					value: selected.value,
					index: selected.index!,
				});
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

			for (let i = 0; i < allOptions.length; i++) {
				const option = allOptions[i];
				const selected = i === optionIndex;
				const prefix = selected ? theme.fg("accent", "> ") : "  ";
				const label = option.isOther ? option.label : `${option.index}. ${option.label}`;
				const styled = selected ? theme.fg("accent", label) : theme.fg("text", label);
				add(`${prefix}${styled}`);
				if (option.description) {
					addWrapped(lines, theme.fg("muted", option.description), width, "     ");
				}
			}

			if (editMode) {
				lines.push("");
				add(theme.fg("muted", " Write your custom answer:"));
				for (const line of editor.render(Math.max(1, width - 2))) {
					add(` ${line}`);
				}
				lines.push("");
				add(theme.fg("dim", " Enter to submit • Esc to go back"));
			} else {
				lines.push("");
				add(theme.fg("dim", " ↑↓ navigate • Enter select • Esc cancel"));
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

export async function askMultiChoice(
	ctx: any,
	question: string,
	context: string | undefined,
	options: AskOption[],
	signal?: AbortSignal,
): Promise<AskAnswer[] | null> {
	const otherLabel = getOtherLabel(options);
	const choiceItems: DisplayOption[] = options.map((option, index) => ({
		...option,
		id: `option:${index}`,
		index: index + 1,
	}));
	const submitItem: DisplayOption = { id: "submit", label: "Submit", value: "__submit__", isSubmit: true };
	const allItems: DisplayOption[] = [
		...choiceItems,
		{ id: "other", label: otherLabel, value: "__other__", isOther: true },
		submitItem,
	];

	return ctx.ui.custom<AskAnswer[] | null>((tui: any, theme: any, _kb: any, done: (result: AskAnswer[] | null) => void) => {
		let optionIndex = 0;
		let editMode = false;
		let cachedLines: string[] | undefined;
		let cachedWidth = -1;
		const dispose = bindAbort(signal, () => done(null));
		const selected = new Map<string, AskAnswer>();
		const editor = new Editor(tui, createEditorTheme(theme));

		editor.onSubmit = (value) => {
			const trimmed = value.trim();
			if (!trimmed) return;
			selected.set("other", { type: "other", label: trimmed, value: trimmed });
			editMode = false;
			refresh();
		};

		function refresh() {
			cachedLines = undefined;
			tui.requestRender();
		}

		function toggleOption(item: DisplayOption) {
			if (selected.has(item.id)) {
				selected.delete(item.id);
			} else {
				selected.set(item.id, {
					type: "option",
					label: item.label,
					value: item.value,
					index: item.index!,
				});
			}
			refresh();
		}

		function handleInput(data: string) {
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

			const current = allItems[optionIndex];
			if (matchesKey(data, Key.space)) {
				if (current.isSubmit) return;
				if (current.isOther) {
					if (selected.has("other")) {
						selected.delete("other");
						refresh();
					} else {
						editMode = true;
						editor.setText("");
						refresh();
					}
					return;
				}
				toggleOption(current);
				return;
			}

			if (matchesKey(data, Key.enter)) {
				if (current.isSubmit) {
					if (selected.size > 0) {
						done(sortAnswers(Array.from(selected.values())));
					}
					return;
				}
				if (current.isOther) {
					editMode = true;
					editor.setText(selected.get("other")?.label || "");
					refresh();
					return;
				}
				toggleOption(current);
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
					const label = selected.size > 0 ? `✓ ${item.label} (${selected.size} selected)` : `○ ${item.label}`;
					const styled = isFocused
						? theme.fg("accent", label)
						: theme.fg(selected.size > 0 ? "success" : "dim", label);
					add(`${prefix}${styled}`);
					continue;
				}

				if (item.isOther) {
					const other = selected.get("other");
					const marker = other ? "[x]" : "[ ]";
					const suffix = other ? ` — ${other.label}` : "";
					const styled = isFocused
						? theme.fg("accent", `${marker} ${item.label}${suffix}`)
						: theme.fg(other ? "success" : "text", `${marker} ${item.label}${suffix}`);
					add(`${prefix}${styled}`);
					continue;
				}

				const checked = selected.has(item.id);
				const marker = checked ? "[x]" : "[ ]";
				const label = `${marker} ${item.index}. ${item.label}`;
				const styled = isFocused
					? theme.fg("accent", label)
					: theme.fg(checked ? "success" : "text", label);
				add(`${prefix}${styled}`);
				if (item.description) {
					addWrapped(lines, theme.fg("muted", item.description), width, "     ");
				}
			}

			if (editMode) {
				lines.push("");
				add(theme.fg("muted", " Write your custom answer:"));
				for (const line of editor.render(Math.max(1, width - 2))) {
					add(` ${line}`);
				}
				lines.push("");
				add(theme.fg("dim", " Enter to save • Esc to go back"));
			} else {
				lines.push("");
				if (selected.size === 0) {
					add(theme.fg("warning", " Select at least one answer before submitting."));
				}
				add(theme.fg("dim", " ↑↓ navigate • Space toggle • Enter edit/submit • Esc cancel"));
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

