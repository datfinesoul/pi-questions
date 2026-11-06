// Adapted from amosblomqvist/pi-config. See README.md, Attribution.
export interface AskOption {
	label: string;
	value: string;
	description?: string;
}

export interface DisplayOption extends AskOption {
	id: string;
	index?: number;
	isOther?: boolean;
	isSubmit?: boolean;
}

export interface TextAnswer {
	type: "text";
	label: string;
	value: string;
}

export interface OptionAnswer {
	type: "option";
	label: string;
	value: string;
	index: number;
}

export interface OtherAnswer {
	type: "other";
	label: string;
	value: string;
}

export type AskAnswer = TextAnswer | OptionAnswer | OtherAnswer;
export type AskUserQuestionStatus = "answered" | "cancelled" | "unavailable";
export type AskUserQuestionMode = "text" | "single-select" | "multi-select";

export interface AskUserQuestionResultDetails {
	status: AskUserQuestionStatus;
	question: string;
	context?: string;
	mode: AskUserQuestionMode;
	answers: AskAnswer[];
	message?: string;
}

