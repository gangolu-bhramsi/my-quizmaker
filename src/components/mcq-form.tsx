"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type ChoiceDraft = {
	label: string;
	isCorrect: boolean;
};

function emptyChoices(): ChoiceDraft[] {
	return [
		{ label: "", isCorrect: false },
		{ label: "", isCorrect: false },
	];
}

export function McqForm({ mcqId }: { mcqId?: string }) {
	const router = useRouter();
	const isEdit = Boolean(mcqId);
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [choices, setChoices] = useState<ChoiceDraft[]>(emptyChoices);
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	const [missing, setMissing] = useState(false);
	const [ready, setReady] = useState(!isEdit);

	useEffect(() => {
		if (!mcqId) {
			return;
		}

		let cancelled = false;
		void (async () => {
			const response = await fetch(`/api/mcqs/${mcqId}`);
			if (!response.ok) {
				if (!cancelled) {
					setMissing(true);
				}
				return;
			}
			const mcq = (await response.json()) as {
				name: string;
				description: string;
				choices: { label: string; isCorrect: boolean }[];
			};
			if (cancelled) {
				return;
			}
			setName(mcq.name);
			setDescription(mcq.description);
			setChoices(mcq.choices.map((choice) => ({ label: choice.label, isCorrect: choice.isCorrect })));
			setReady(true);
		})();

		return () => {
			cancelled = true;
		};
	}, [mcqId]);

	function updateChoice(index: number, patch: Partial<ChoiceDraft>) {
		setChoices((current) =>
			current.map((choice, choiceIndex) =>
				choiceIndex === index ? { ...choice, ...patch } : choice,
			),
		);
	}

	function markCorrect(index: number) {
		setChoices((current) =>
			current.map((choice, choiceIndex) => ({
				...choice,
				isCorrect: choiceIndex === index,
			})),
		);
	}

	function addChoice() {
		if (choices.length >= 6) {
			return;
		}
		setChoices((current) => [...current, { label: "", isCorrect: false }]);
	}

	function removeChoice(index: number) {
		if (choices.length <= 2) {
			return;
		}
		setChoices((current) => current.filter((_, choiceIndex) => choiceIndex !== index));
	}

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const trimmedName = name.trim();
		const trimmedChoices = choices.map((choice) => ({
			label: choice.label.trim(),
			isCorrect: choice.isCorrect,
		}));

		if (!trimmedName) {
			setError("Name is required.");
			return;
		}
		if (trimmedChoices.some((choice) => !choice.label)) {
			setError("Each choice needs a label.");
			return;
		}
		if (trimmedChoices.filter((choice) => choice.isCorrect).length !== 1) {
			setError("Mark one choice as the correct answer.");
			return;
		}

		setError(null);
		setPending(true);
		try {
			const response = await fetch(isEdit ? `/api/mcqs/${mcqId}` : "/api/mcqs", {
				method: isEdit ? "PUT" : "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: trimmedName,
					description: description.trim(),
					choices: trimmedChoices,
				}),
			});

			if (response.status === 201 || response.status === 200) {
				router.push("/mcqs");
				return;
			}

			let message = "Unable to save the question.";
			try {
				const body = (await response.json()) as { error?: string };
				if (typeof body.error === "string") {
					message = body.error;
				}
			} catch {
				// keep default
			}
			setError(message);
		} finally {
			setPending(false);
		}
	}

	if (missing) {
		return (
			<Card className="w-full max-w-2xl">
				<CardHeader>
					<CardTitle>Question not found</CardTitle>
					<CardDescription>That question is no longer in the bank.</CardDescription>
				</CardHeader>
				<CardContent>
					<Button type="button" variant="outline" onClick={() => router.push("/mcqs")}>
						Back to Question Bank
					</Button>
				</CardContent>
			</Card>
		);
	}

	if (!ready) {
		return <p className="text-muted-foreground">Loading question…</p>;
	}

	return (
		<Card className="w-full max-w-2xl">
			<CardHeader>
				<CardTitle>
					<h1>{isEdit ? "Edit question" : "Create question"}</h1>
				</CardTitle>
				<CardDescription>
					{isEdit
						? "Update the name, description, and choices, then save."
						: "Add a name, optional description, and two to six choices."}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form onSubmit={onSubmit}>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor="name">Name</FieldLabel>
							<Input
								id="name"
								name="name"
								value={name}
								onChange={(event) => setName(event.target.value)}
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="description">Description</FieldLabel>
							<Textarea
								id="description"
								name="description"
								value={description}
								onChange={(event) => setDescription(event.target.value)}
							/>
						</Field>
						{choices.map((choice, index) => (
							<Field key={index} orientation="horizontal">
								<FieldLabel htmlFor={`choice-${index}`}>Choice {index + 1}</FieldLabel>
								<Input
									id={`choice-${index}`}
									name={`choice-${index}`}
									value={choice.label}
									onChange={(event) => updateChoice(index, { label: event.target.value })}
								/>
								<label className="flex items-center gap-2 text-sm whitespace-nowrap">
									<input
										type="radio"
										name="correct-choice"
										checked={choice.isCorrect}
										onChange={() => markCorrect(index)}
										aria-label={`Mark choice ${index + 1} as correct`}
									/>
									Correct
								</label>
								<Button
									type="button"
									variant="outline"
									onClick={() => removeChoice(index)}
									disabled={choices.length <= 2}
									aria-label={`Remove choice ${index + 1}`}
								>
									Remove
								</Button>
							</Field>
						))}
						<Button
							type="button"
							variant="outline"
							onClick={addChoice}
							disabled={choices.length >= 6}
						>
							Add choice
						</Button>
						{error ? (
							<Field>
								<FieldError errors={[{ message: error }]} />
							</Field>
						) : null}
						<Field orientation="horizontal">
							<Button type="submit" disabled={pending}>
								Save
							</Button>
							<Button type="button" variant="outline" onClick={() => router.push("/mcqs")}>
								Cancel
							</Button>
						</Field>
					</FieldGroup>
				</form>
			</CardContent>
		</Card>
	);
}
