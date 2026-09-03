import { getDb } from "@/lib/db";

export class McqNotFoundError extends Error {
	constructor(message = "Question not found") {
		super(message);
		this.name = "McqNotFoundError";
	}
}

export class McqInvalidChoiceError extends Error {
	constructor(message = "Choice does not belong to this question") {
		super(message);
		this.name = "McqInvalidChoiceError";
	}
}

export type McqChoice = {
	id: string;
	label: string;
	isCorrect: boolean;
	position: number;
};

export type McqListItem = {
	id: string;
	name: string;
	description: string;
	createdAt: string;
	updatedAt: string;
};

export type Mcq = McqListItem & {
	choices: McqChoice[];
};

export type McqChoiceInput = {
	label: string;
	isCorrect: boolean;
};

export type McqInput = {
	name: string;
	description?: string;
	choices: McqChoiceInput[];
};

export type McqAttempt = {
	id: string;
	mcqId: string;
	choiceId: string;
	isCorrect: boolean;
	createdAt: string;
};

type McqRow = {
	id: string;
	name: string;
	description: string;
	created_at: string;
	updated_at: string;
};

type ChoiceRow = {
	id: string;
	mcq_id: string;
	label: string;
	is_correct: number;
	position: number;
};

type AttemptRow = {
	id: string;
	mcq_id: string;
	choice_id: string;
	is_correct: number;
	created_at: string;
};

function toListItem(row: McqRow): McqListItem {
	return {
		id: row.id,
		name: row.name,
		description: row.description,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function toChoice(row: ChoiceRow): McqChoice {
	return {
		id: row.id,
		label: row.label,
		isCorrect: row.is_correct === 1,
		position: row.position,
	};
}

function toMcq(row: McqRow, choices: ChoiceRow[]): Mcq {
	return {
		...toListItem(row),
		choices: choices.map(toChoice),
	};
}

function toAttempt(row: AttemptRow): McqAttempt {
	return {
		id: row.id,
		mcqId: row.mcq_id,
		choiceId: row.choice_id,
		isCorrect: row.is_correct === 1,
		createdAt: row.created_at,
	};
}

function normalizeName(value: string): string {
	return value.trim();
}

function normalizeDescription(value: string | undefined): string {
	return value?.trim() ?? "";
}

function normalizeLabel(value: string): string {
	return value.trim();
}

function firstRow<T>(result: D1Result<T> | undefined): T | undefined {
	return result?.results[0];
}

function choiceInsert(db: D1Database, mcqId: string, choice: McqChoiceInput, position: number) {
	const id = crypto.randomUUID();
	return db
		.prepare(
			`INSERT INTO mcq_choices (id, mcq_id, label, is_correct, position)
       VALUES (?1, ?2, ?3, ?4, ?5)
       RETURNING id, mcq_id, label, is_correct, position`,
		)
		.bind(id, mcqId, normalizeLabel(choice.label), choice.isCorrect ? 1 : 0, position);
}

export async function listMcqs(): Promise<McqListItem[]> {
	const db = await getDb();
	const { results } = await db
		.prepare(
			`SELECT id, name, description, created_at, updated_at
       FROM mcqs
       ORDER BY created_at DESC`,
		)
		.bind()
		.all<McqRow>();

	return results.map(toListItem);
}

export async function findMcqById(id: string): Promise<Mcq | null> {
	const db = await getDb();
	const { results: mcqResults } = await db
		.prepare(
			`SELECT id, name, description, created_at, updated_at
       FROM mcqs
       WHERE id = ?1`,
		)
		.bind(id)
		.all<McqRow>();

	const mcqRow = mcqResults[0];
	if (!mcqRow) {
		return null;
	}

	const { results: choiceResults } = await db
		.prepare(
			`SELECT id, mcq_id, label, is_correct, position
       FROM mcq_choices
       WHERE mcq_id = ?1
       ORDER BY position ASC`,
		)
		.bind(id)
		.all<ChoiceRow>();

	return toMcq(mcqRow, choiceResults);
}

export async function createMcq(input: McqInput): Promise<Mcq> {
	const db = await getDb();
	const id = crypto.randomUUID();

	const mcqStatement = db
		.prepare(
			`INSERT INTO mcqs (id, name, description)
       VALUES (?1, ?2, ?3)
       RETURNING id, name, description, created_at, updated_at`,
		)
		.bind(id, normalizeName(input.name), normalizeDescription(input.description));

	const choiceStatements = input.choices.map((choice, position) =>
		choiceInsert(db, id, choice, position),
	);

	const batchResults = await db.batch<McqRow | ChoiceRow>([mcqStatement, ...choiceStatements]);
	const row = firstRow(batchResults[0] as D1Result<McqRow>);
	if (!row) {
		throw new Error("Failed to create question");
	}

	const choiceRows = batchResults.slice(1).map((result, index) => {
		const choiceRow = firstRow(result as D1Result<ChoiceRow>);
		if (!choiceRow) {
			throw new Error(`Failed to create choice at position ${index}`);
		}
		return choiceRow;
	});

	return toMcq(row, choiceRows);
}

export async function updateMcq(id: string, input: McqInput): Promise<Mcq> {
	const db = await getDb();

	const { results: existing } = await db
		.prepare(`SELECT id FROM mcqs WHERE id = ?1`)
		.bind(id)
		.all<{ id: string }>();

	if (!existing[0]) {
		throw new McqNotFoundError();
	}

	const updateStatement = db
		.prepare(
			`UPDATE mcqs
       SET name = ?1,
           description = ?2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?3
       RETURNING id, name, description, created_at, updated_at`,
		)
		.bind(normalizeName(input.name), normalizeDescription(input.description), id);

	const deleteChoices = db.prepare(`DELETE FROM mcq_choices WHERE mcq_id = ?1`).bind(id);
	const choiceStatements = input.choices.map((choice, position) =>
		choiceInsert(db, id, choice, position),
	);

	const batchResults = await db.batch<McqRow | ChoiceRow>([
		updateStatement,
		deleteChoices,
		...choiceStatements,
	]);

	const row = firstRow(batchResults[0] as D1Result<McqRow>);
	if (!row) {
		throw new McqNotFoundError();
	}

	const choiceRows = batchResults.slice(2).map((result, index) => {
		const choiceRow = firstRow(result as D1Result<ChoiceRow>);
		if (!choiceRow) {
			throw new Error(`Failed to create choice at position ${index}`);
		}
		return choiceRow;
	});

	return toMcq(row, choiceRows);
}

export async function deleteMcq(id: string): Promise<void> {
	const db = await getDb();
	const { results } = await db
		.prepare(`SELECT id FROM mcqs WHERE id = ?1`)
		.bind(id)
		.all<{ id: string }>();

	if (!results[0]) {
		throw new McqNotFoundError();
	}

	await db.prepare(`DELETE FROM mcqs WHERE id = ?1`).bind(id).run();
}

export async function createMcqAttempt(mcqId: string, choiceId: string): Promise<McqAttempt> {
	const db = await getDb();

	const { results: mcqResults } = await db
		.prepare(`SELECT id FROM mcqs WHERE id = ?1`)
		.bind(mcqId)
		.all<{ id: string }>();

	if (!mcqResults[0]) {
		throw new McqNotFoundError();
	}

	const { results: choiceResults } = await db
		.prepare(`SELECT id, mcq_id, is_correct FROM mcq_choices WHERE id = ?1`)
		.bind(choiceId)
		.all<{ id: string; mcq_id: string; is_correct: number }>();

	const choice = choiceResults[0];
	if (!choice || choice.mcq_id !== mcqId) {
		throw new McqInvalidChoiceError();
	}

	const id = crypto.randomUUID();
	const { results } = await db
		.prepare(
			`INSERT INTO mcq_attempts (id, mcq_id, choice_id, is_correct)
       VALUES (?1, ?2, ?3, ?4)
       RETURNING id, mcq_id, choice_id, is_correct, created_at`,
		)
		.bind(id, mcqId, choiceId, choice.is_correct)
		.all<AttemptRow>();

	const row = results[0];
	if (!row) {
		throw new Error("Failed to create attempt");
	}
	return toAttempt(row);
}
