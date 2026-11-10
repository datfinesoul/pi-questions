// Adapted from amosblomqvist/pi-config. See README.md, Attribution.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import type { AskUserQuestionMode, AskUserQuestionResultDetails } from "./types.ts";
import { askText, askSingleChoice, askMultiChoice } from "./ui.ts";
import { normalizeOptions, getOtherLabel, cancelledResult, unavailableResult, buildResult, withUILock } from "../../src/questions.ts";

const OptionSchema = Type.Object({
	label: Type.String({
		description:
			'Use a short, plain label, usually 2–6 words. Place the recommended option first. Append "(Recommended)" to its label.',
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
		description: "Ask exactly one direct question. Use plain words and aim for 20 words or fewer.",
	}),
	details: Type.Optional(
		Type.String({
			description: "Optional context needed to answer. Prefer 1–2 short sentences, at most 40 words in total. Omit repeated background and option summaries. Preserve essential risks and conditions, even when they need more words.",
		}),
	),
	options: Type.Optional(
		Type.Array(OptionSchema, {
			description:
				"Optional multiple-choice options. Omit or pass an empty array for free-form text input. Users will always be able to choose Other and type a custom answer when options are provided.",
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
			"Use this tool to ask exactly one clarifying question, missing-requirement question, preference question, or decision question before continuing.",
		promptGuidelines: [
			"Ask exactly one question per tool call.",
			"Make each question self-contained. When referring to an earlier proposal, use a clear reference and briefly name the proposal. Do not rely only on positions such as 'option 2 above'.",
			"Treat an answer as authorization only for the action explicitly asked about. Selecting an approach does not by itself authorize its execution. Cancellation, unavailable UI, and empty text do not imply approval.",
			"Use STE100-inspired wording in questions, details, and choices: plain words, active voice, and one idea per sentence. Avoid jargon, filler, and semicolons.",
			"Keep the question direct, usually 20 words or fewer. Give each choice a short label, usually 2–6 words.",
			"Omit details unless the user needs them to decide. Prefer 1–2 sentences and at most 40 words in total. Explain only why the decision matters or a key constraint. Do not repeat the question, prior discussion, or choice descriptions.",
			"Use at most one short sentence for each choice description. State its main benefit or trade-off. Omit descriptions that repeat labels.",
			"Preserve essential risks, conditions, uncertainty, and technical names. Use more words when needed for a safe, informed choice. Never truncate text to meet a length target.",
			"Ask only questions that materially affect the work. Use separate calls for distinct decisions, and avoid unnecessary follow-up questions.",
			'Users will always be able to select "Other" to provide custom text input when options are provided.',
			"Use multiSelect: true only when you need multiple answers to the same question.",
			'If you recommend a specific option, make it the first option in the list and add "(Recommended)" at the end of the label.',
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

				if (mode === "single-select") {
					const answer = await askSingleChoice(ctx, params.question, context, options, signal);
					if (!answer) {
						return cancelledResult(params.question, mode, context);
					}
					return buildResult(params.question, context, mode, [answer]);
				}

				const answers = await askMultiChoice(ctx, params.question, context, options, signal);
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
				const labels = [...options.map((option) => option.label), getOtherLabel(options)].join(", ");
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
					case "other":
						return `${theme.fg("success", "✓ ")}${theme.fg("muted", "Other: ")}${theme.fg("accent", answer.label)}`;
					case "option":
						return `${theme.fg("success", "✓ ")}${theme.fg("accent", `${answer.index}. ${answer.label}`)}`;
				}
			});
			return new Text(lines.join("\n"), 0, 0);
		},
	});
}
