import { z } from "zod";

const choiceBodySchema = z.object({
	label: z.string().trim().min(1).max(500),
	isCorrect: z.boolean(),
});

export const mcqBodySchema = z
	.object({
		name: z.string().trim().min(1).max(200),
		description: z.string().trim().max(2000).optional().default(""),
		choices: z.array(choiceBodySchema).min(2).max(6),
	})
	.refine((value) => value.choices.filter((choice) => choice.isCorrect).length === 1, {
		message: "Exactly one choice must be marked correct",
		path: ["choices"],
	});

export const attemptBodySchema = z.object({
	choiceId: z.string().trim().min(1),
});
