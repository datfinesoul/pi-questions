// Adapted from amosblomqvist/pi-config. See README.md, Attribution.
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import type { AskUserQuestionMode, AskUserQuestionResultDetails } from "./types.ts";
import { askText, askChoice } from "./ui.ts";
import { normalizeOptions, getOtherLabel, cancelledResult, unavailableResult, buildResult, withUILock } from "../../src/questions.ts";
import { CONFIRMATION_GUIDELINES, installRuleBlock, readConfig, writeConfig } from "../../src/decision-rule.ts";

const RULE_YES = "Yes";
const RULE_NO = "No";
const RULE_QUESTION = "Register a decision-question rule in AGENTS.md?";
const RULE_DETAILS =
	"The extension saves your Yes or No answer for this project. If you press Escape, it asks again at the next session start. Yes adds a marked rule block to AGENTS.md. Later, edit decisionRule in .pi/questions.json to change the answer, or delete that file to see this prompt again.";
const STATUS_KEY = "pi-questions";
const RELOAD_STATUS = "Run /reload to load the decision rule";

function reportInvalidBlock(ctx: ExtensionContext, path: string) {
	ctx.ui.notify(
		`pi-questions: ${path} has one decision-rule marker but not the other. Fix the markers and run /reload.`,
		"warning",
	);
}

async function applyDecisionRule(ctx: ExtensionContext, announceUnchanged: boolean) {
	const result = await installRuleBlock(ctx.cwd);
	if (result.action === "invalid") {
		reportInvalidBlock(ctx, result.path);
		return;
	}
	await writeConfig(ctx.cwd, { decisionRule: "on" });
	if (result.action === "unchanged") {
		if (announceUnchanged) {
			ctx.ui.notify(`The decision rule is already in ${result.path}. No reload is needed.`, "info");
		}
		return;
	}
	const verb = result.action === "replaced" ? "updated in" : "added to";
	ctx.ui.notify(`Decision rule ${verb} ${result.path}. Run /reload to load it.`, "info");
	// Pi replaces the last chat status line with its own reload message, so keep
	// the hint in the footer until the next session start clears it.
	ctx.ui.setStatus?.(STATUS_KEY, RELOAD_STATUS);
}

// Offer the rule once per project, then keep the extension-owned block current.
async function reconcileDecisionRule(ctx: ExtensionContext) {
	if (!ctx.hasUI) return;
	if (typeof ctx.isProjectTrusted === "function" && ctx.isProjectTrusted() === false) return;

	// A reached session start means the rule from the last reload is loaded.
	ctx.ui.setStatus?.(STATUS_KEY, undefined);

	const config = await readConfig(ctx.cwd);
	if (config.error) {
		ctx.ui.notify(`pi-questions: ${config.error}. Fix or delete ${config.path}.`, "warning");
	}

	const state = config.settings.decisionRule;
	if (state === "off") return;

	if (state === "on") {
		await applyDecisionRule(ctx, false);
		return;
	}

	// The configuration file is the only record of the decision. A rule block that
	// is already in the file means an accept writes nothing, not that the offer is
	// skipped.
	// Use select, not confirm: confirm reports Escape as false, so a dismissed
	// dialog would look like an explicit No. Only an explicit answer is saved.
	const choice = await withUILock(() => ctx.ui.select(`${RULE_QUESTION}\n${RULE_DETAILS}`, [RULE_YES, RULE_NO]));
	if (choice !== RULE_YES && choice !== RULE_NO) return;
	if (choice === RULE_NO) {
		await writeConfig(ctx.cwd, { decisionRule: "off" });
		return;
	}
	await applyDecisionRule(ctx, true);
}

const OptionSchema = Type.Object({
	label: Type.String({
		description:
			'Use a short, plain label, usually 2–6 words. Do not mark, rank, or order options by preference.',
	}),
	value: Type.Optional(
		Type.String({
			description: "Optional machine-readable value returned for the option. Defaults to the label.",
		}),
	),
	description: Type.Optional(Type.String({
		description: "Optional explanation of the main benefit or trade-off. Use one short sentence. Omit it when the label is clear.",
	})),
});

const AskUserQuestionParams = Type.Object({
	question: Type.String({
		description: "Ask exactly one direct question. Use plain words, aim for 25 words or fewer, and refer to the context message by a named subject.",
	}),
	details: Type.Optional(
		Type.String({
			description: "Optional context the user must see while the dialog is open. Prefer 1–2 short sentences and usually 50 words or fewer. Write longer context in the message before the call. Omit details when the question and choices are clear. Preserve essential risks and conditions, even when they need more words.",
		}),
	),
	options: Type.Optional(
		Type.Array(OptionSchema, {
			description:
				"Optional multiple-choice options. Omit or pass an empty array for free-form text input. Choice lists always include a custom text row: [Feedback] in single-select and [Other] in multi-select. If an option has that label, the row reads [Feedback (custom)] or [Other (custom)].",
		}),
	),
	multiSelect: Type.Optional(
		Type.Boolean({
			description: "Set to true to allow multiple answers to be selected for a question.",
		}),
	),
});

export default function askUserQuestion(pi: ExtensionAPI) {
	pi.registerTool({
		name: "ask_user_question",
		label: "ask_user_question",
		description:
			"Ask the user one focused question and wait for their answer. Use this when missing information or a user decision materially affects the work. Avoid interrupting for minor choices that have a reasonable default.",
		promptSnippet:
			"Ask one focused question when missing information or an unresolved user decision materially affects the work.",
		promptGuidelines: [
			"Ask exactly one question per tool call.",
			...CONFIRMATION_GUIDELINES,
			"Before the ask_user_question call, write one short message with the context the user needs to decide. State the facts, the trade-off, and any constraint. This message does not replace the tool call.",
			"Keep the question and choices short, and refer to that message by a named subject. Do not rely only on positions such as 'option 2 above'. The question and choices must still make sense when the message has scrolled away.",
			"Treat an answer as authorization only for the action explicitly asked about. Selecting an approach does not by itself authorize its execution. Cancellation, unavailable UI, and empty text do not imply approval.",
			"If the user replies with a question or asks for clarification, answer it in prose and end the turn. For clarification replies, do not repeat or rephrase the pending decision in that turn, and wait for the user's next message.",
			"If the user cancels a question, do not repeat or rephrase it unless the user requests it.",
			"After clarification or cancellation, you may briefly state that the decision remains open in prose.",
			"Use STE100-inspired wording in questions, details, and choices: plain words, active voice, and one idea per sentence. Avoid jargon, filler, and semicolons.",
			"Keep the question direct, usually 25 words or fewer. Give each choice a short label, usually 2–6 words.",
			"Name the concrete change and its effect on the user. Do not refer to code identifiers, file paths, or a list position such as item 12 without naming the subject.",
			"Use details only for the context the user must see while the dialog is open. Prefer 1–2 short sentences and usually 50 words or fewer. Write longer context in the message before the tool call. Omit details when the question and choices are clear.",
			"Use at most one short sentence for each choice description. State its main benefit or trade-off. Omit descriptions that repeat labels.",
			"Preserve essential risks, conditions, uncertainty, and technical names. Use more words when needed for a safe, informed choice. Never truncate text to meet a length target.",
			"Ask only questions that materially affect the work. Use separate calls for distinct decisions, and avoid unnecessary follow-up questions.",
			'A choice question always offers custom text: the [Feedback] row in single-select and the [Other] row in multi-select.',
			'For a single-select question, the user can select one option, custom text, or both together.',
			"Use multiSelect: true when options are independent and any combination can be valid. Keep options as distinct answers; do not fold their combinations into additional options.",
			"Express related decisions as separate options in one multi-select, or as separate questions in separate calls. Do not pre-combine decision dimensions into options.",
			'Present neutral options and let the user analyze them. Do not mark or order options by preference. In the context message and details, state only facts: applicable project rules, constraints, and what each option changes.',
			"Use reasonable defaults for minor choices. Ask when an assumption would materially affect correctness, scope, safety, or user intent.",
			"Use this tool when multiple valid implementation paths exist and the preferred path depends on user choice.",
		].map((guideline) => `ask_user_question: ${guideline}`),
		parameters: AskUserQuestionParams,
		exposure: "model-only",

		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const options = normalizeOptions(params.options);
			const context = params.details?.trim() || undefined;
			const mode: AskUserQuestionMode = options.length === 0 ? "text" : params.multiSelect ? "multi-select" : "single-select";

			if (signal?.aborted) {
				return cancelledResult(params.question, mode, context);
			}

			if (!ctx.hasUI || ctx.mode !== "tui") {
				return unavailableResult(params.question, mode, "ask_user_question requires interactive mode UI", context);
			}

			return withUILock(async () => {
				// Calls can be aborted while another tool holds the shared UI lock.
				if (signal?.aborted) return cancelledResult(params.question, mode, context);
				if (mode === "text") {
					const answer = await askText(ctx, params.question, context, signal);
					if (answer === undefined) {
						return cancelledResult(params.question, mode, context);
					}
					return buildResult(params.question, context, mode, [
						{ type: "text", label: answer.trim(), value: answer.trim() },
					]);
				}

				const answers = await askChoice(ctx, params.question, context, options, mode, signal);
				if (!answers) {
					return cancelledResult(params.question, mode, context);
				}
				return buildResult(params.question, context, mode, answers);
			});
		},

		renderCall(args, theme) {
			const options = normalizeOptions(args.options as Array<{ label: string; value?: string; description?: string }> | undefined);
			let text = theme.fg("toolTitle", theme.bold("ask_user_question ")) + theme.fg("muted", args.question);
			if (args.multiSelect) {
				text += theme.fg("dim", " [multi-select]");
			}
			if (options.length > 0) {
				const custom = getOtherLabel(options, args.multiSelect ? "Other" : "Feedback");
				const labels = [...options.map((option) => option.label), `[${custom}]`].join(", ");
				text += `\n${theme.fg("dim", `  Options: ${labels}`)}`;
			}
			return new Text(text, 0, 0);
		},

		renderResult(result, _options, theme) {
			const details = result.details as AskUserQuestionResultDetails | undefined;
			if (!details) {
				const first = result.content[0];
				return new Text(first?.type === "text" ? first.text : "", 0, 0);
			}

			if (details.status === "cancelled") {
				return new Text(theme.fg("warning", details.message || "Cancelled"), 0, 0);
			}

			if (details.status === "unavailable") {
				return new Text(theme.fg("warning", details.message || "ask_user_question unavailable"), 0, 0);
			}

			const lines = details.answers.map((answer) => {
				switch (answer.type) {
					case "text":
						return `${theme.fg("success", "✓ ")}${theme.fg("accent", answer.label || "(empty response)")}`;
					case "custom":
						return `${theme.fg("success", "✓ ")}${theme.fg("muted", `${details.mode === "single-select" ? "Feedback" : "Other"}: `)}${theme.fg("accent", answer.label)}`;
					case "option":
						return `${theme.fg("success", "✓ ")}${theme.fg("accent", `${answer.index}. ${answer.label}`)}`;
				}
			});
			return new Text(lines.join("\n"), 0, 0);
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		try {
			await reconcileDecisionRule(ctx);
		} catch (error) {
			ctx.ui.notify(`pi-questions: decision-rule setup failed: ${(error as Error).message}`, "error");
		}
	});
}
