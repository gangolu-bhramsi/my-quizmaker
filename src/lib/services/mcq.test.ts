import { getCloudflareContext } from "@opennextjs/cloudflare";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	McqInvalidChoiceError,
	McqNotFoundError,
	createMcq,
	createMcqAttempt,
	deleteMcq,
	findMcqById,
	listMcqs,
	updateMcq,
} from "@/lib/services/mcq";

vi.mock("@opennextjs/cloudflare", () => ({
	getCloudflareContext: vi.fn(),
}));

type QueryCall = { sql: string; params: unknown[] };

function createMockD1() {
	const calls: QueryCall[] = [];
	const resultsQueue: Record<string, unknown>[][] = [];
	let nextError: Error | null = null;
	let batchCount = 0;

	function consumeResult() {
		if (nextError) {
			const error = nextError;
			nextError = null;
			throw error;
		}
		return { results: resultsQueue.shift() ?? [] };
	}

	const db = {
		prepare(sql: string) {
			return {
				bind(...params: unknown[]) {
					calls.push({ sql, params });
					return {
						async all() {
							return consumeResult();
						},
						async run() {
							consumeResult();
							return { success: true, meta: { changes: 1 } };
						},
					};
				},
			};
		},
		async batch(statements: { all: () => Promise<{ results: Record<string, unknown>[] }> }[]) {
			batchCount += 1;
			const results = [];
			for (const statement of statements) {
				results.push(await statement.all());
			}
			return results;
		},
	};

	return {
		db,
		calls,
		get batchCount() {
			return batchCount;
		},
		enqueueResults(rows: Record<string, unknown>[]) {
			resultsQueue.push(rows);
		},
		setError(error: Error) {
			nextError = error;
		},
		reset() {
			calls.length = 0;
			resultsQueue.length = 0;
			nextError = null;
			batchCount = 0;
		},
	};
}

const mcqRow = {
	id: "mcq-1",
	name: "What is 2 + 2?",
	description: "Basic arithmetic",
	created_at: "2026-09-03 12:00:00",
	updated_at: "2026-09-03 12:00:00",
};

const choiceRows = [
	{
		id: "choice-1",
		mcq_id: "mcq-1",
		label: "3",
		is_correct: 0,
		position: 0,
	},
	{
		id: "choice-2",
		mcq_id: "mcq-1",
		label: "4",
		is_correct: 1,
		position: 1,
	},
];

const listedMcq = {
	id: "mcq-1",
	name: "What is 2 + 2?",
	description: "Basic arithmetic",
	createdAt: "2026-09-03 12:00:00",
	updatedAt: "2026-09-03 12:00:00",
};

const fullMcq = {
	...listedMcq,
	choices: [
		{ id: "choice-1", label: "3", isCorrect: false, position: 0 },
		{ id: "choice-2", label: "4", isCorrect: true, position: 1 },
	],
};

const createInput = {
	name: "What is 2 + 2?",
	description: "Basic arithmetic",
	choices: [
		{ label: "3", isCorrect: false },
		{ label: "4", isCorrect: true },
	],
};

describe("mcq service", () => {
	const mock = createMockD1();

	beforeEach(() => {
		vi.clearAllMocks();
		mock.reset();
		vi.mocked(getCloudflareContext).mockResolvedValue({
			env: { DB: mock.db },
		} as never);
	});

	it("create inserts the question then its choices with numbered placeholders", async () => {
		mock.enqueueResults([mcqRow]);
		mock.enqueueResults([choiceRows[0]!]);
		mock.enqueueResults([choiceRows[1]!]);

		const created = await createMcq(createInput);

		expect(created).toEqual(fullMcq);

		const insertMcq = mock.calls.find((call) => /INSERT\s+INTO\s+mcqs\b/i.test(call.sql));
		expect(insertMcq).toBeTruthy();
		expect(insertMcq?.sql).toMatch(/\?1/);
		expect(insertMcq?.sql).toMatch(/\?2/);
		expect(insertMcq?.sql.toLowerCase()).not.toContain("what is 2 + 2?");
		expect(insertMcq?.params).toEqual(
			expect.arrayContaining(["What is 2 + 2?", "Basic arithmetic"]),
		);

		const choiceInserts = mock.calls.filter((call) => /INSERT\s+INTO\s+mcq_choices\b/i.test(call.sql));
		expect(choiceInserts).toHaveLength(2);
		expect(choiceInserts[0]?.params).toEqual(expect.arrayContaining(["3", 0, 0]));
		expect(choiceInserts[1]?.params).toEqual(expect.arrayContaining(["4", 1, 1]));
		expect(created.choices[0]?.isCorrect).toBe(false);
		expect(created.choices[1]?.isCorrect).toBe(true);
	});

	it("create assigns position from array order", async () => {
		mock.enqueueResults([mcqRow]);
		mock.enqueueResults([{ ...choiceRows[0], position: 0 }]);
		mock.enqueueResults([{ ...choiceRows[1], position: 1 }]);

		await createMcq(createInput);

		const choiceInserts = mock.calls.filter((call) => /INSERT\s+INTO\s+mcq_choices\b/i.test(call.sql));
		expect(choiceInserts[0]?.params).toContain(0);
		expect(choiceInserts[1]?.params).toContain(1);
	});

	it("create writes the question and choices in one batch so a failed choice rolls back", async () => {
		mock.enqueueResults([mcqRow]);
		mock.enqueueResults([choiceRows[0]!]);
		mock.enqueueResults([choiceRows[1]!]);

		await createMcq(createInput);

		expect(mock.batchCount).toBe(1);
	});

	it("list selects from mcqs without joining choices, newest first", async () => {
		mock.enqueueResults([mcqRow]);

		const items = await listMcqs();

		expect(items).toEqual([listedMcq]);
		expect(items[0]).not.toHaveProperty("choices");
		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0]?.sql).toMatch(/FROM\s+mcqs\b/i);
		expect(mock.calls[0]?.sql).not.toMatch(/mcq_choices/i);
		expect(mock.calls[0]?.sql).toMatch(/ORDER BY\s+created_at\s+DESC/i);
	});

	it("findById returns the question plus choices ordered by position", async () => {
		mock.enqueueResults([mcqRow]);
		mock.enqueueResults(choiceRows);

		const found = await findMcqById("mcq-1");

		expect(found).toEqual(fullMcq);
		expect(mock.calls[0]?.sql).toMatch(/FROM\s+mcqs\b/i);
		expect(mock.calls[0]?.sql).toMatch(/WHERE\s+id\s*=\s*\?1/i);
		expect(mock.calls[0]?.params).toEqual(["mcq-1"]);
		expect(mock.calls[1]?.sql).toMatch(/FROM\s+mcq_choices\b/i);
		expect(mock.calls[1]?.sql).toMatch(/ORDER BY\s+position/i);
		expect(mock.calls[1]?.params).toEqual(["mcq-1"]);
	});

	it("findById returns null when no row exists", async () => {
		mock.enqueueResults([]);

		await expect(findMcqById("missing")).resolves.toBeNull();
	});

	it("update updates name and description, replaces choices, and bumps updated_at", async () => {
		const updatedRow = {
			...mcqRow,
			name: "What is 3 + 3?",
			description: "Still arithmetic",
			updated_at: "2026-09-03 13:00:00",
		};
		mock.enqueueResults([{ id: "mcq-1" }]);
		mock.enqueueResults([updatedRow]);
		mock.enqueueResults([]);
		mock.enqueueResults([{ id: "choice-3", mcq_id: "mcq-1", label: "5", is_correct: 0, position: 0 }]);
		mock.enqueueResults([{ id: "choice-4", mcq_id: "mcq-1", label: "6", is_correct: 1, position: 1 }]);

		const updated = await updateMcq("mcq-1", {
			name: "What is 3 + 3?",
			description: "Still arithmetic",
			choices: [
				{ label: "5", isCorrect: false },
				{ label: "6", isCorrect: true },
			],
		});

		expect(updated.name).toBe("What is 3 + 3?");
		expect(updated.description).toBe("Still arithmetic");
		expect(updated.updatedAt).toBe("2026-09-03 13:00:00");
		expect(updated.choices).toHaveLength(2);

		const updateSql = mock.calls.find((call) => /UPDATE\s+mcqs\b/i.test(call.sql));
		expect(updateSql).toBeTruthy();
		expect(updateSql?.sql).toMatch(/updated_at\s*=\s*CURRENT_TIMESTAMP/i);
		expect(updateSql?.params).toEqual(
			expect.arrayContaining(["What is 3 + 3?", "Still arithmetic", "mcq-1"]),
		);

		const deleteChoices = mock.calls.find((call) =>
			/DELETE\s+FROM\s+mcq_choices\b/i.test(call.sql),
		);
		expect(deleteChoices).toBeTruthy();
		expect(deleteChoices?.params).toEqual(["mcq-1"]);

		const choiceInserts = mock.calls.filter((call) => /INSERT\s+INTO\s+mcq_choices\b/i.test(call.sql));
		expect(choiceInserts).toHaveLength(2);
		expect(mock.batchCount).toBe(1);
	});

	it("delete issues a delete for the given mcq id", async () => {
		mock.enqueueResults([{ id: "mcq-1" }]);

		await deleteMcq("mcq-1");

		const deleteCall = mock.calls.find((call) => /DELETE\s+FROM\s+mcqs\b/i.test(call.sql));
		expect(deleteCall).toBeTruthy();
		expect(deleteCall?.sql).toMatch(/\?1/);
		expect(deleteCall?.params).toEqual(["mcq-1"]);
	});

	it("createAttempt binds mcq id, choice id, and the choice correctness flag", async () => {
		mock.enqueueResults([{ id: "mcq-1" }]);
		mock.enqueueResults([{ id: "choice-2", mcq_id: "mcq-1", is_correct: 1 }]);
		mock.enqueueResults([
			{
				id: "attempt-1",
				mcq_id: "mcq-1",
				choice_id: "choice-2",
				is_correct: 1,
				created_at: "2026-09-03 14:00:00",
			},
		]);

		const attempt = await createMcqAttempt("mcq-1", "choice-2");

		expect(attempt).toEqual({
			id: "attempt-1",
			mcqId: "mcq-1",
			choiceId: "choice-2",
			isCorrect: true,
			createdAt: "2026-09-03 14:00:00",
		});

		const insert = mock.calls.find((call) => /INSERT\s+INTO\s+mcq_attempts\b/i.test(call.sql));
		expect(insert).toBeTruthy();
		expect(insert?.sql).toMatch(/\?1/);
		expect(insert?.params).toEqual(expect.arrayContaining(["mcq-1", "choice-2", 1]));
	});

	it("createAttempt rejects a choice that does not belong to the question", async () => {
		mock.enqueueResults([{ id: "mcq-1" }]);
		mock.enqueueResults([{ id: "choice-9", mcq_id: "other-mcq", is_correct: 1 }]);

		await expect(createMcqAttempt("mcq-1", "choice-9")).rejects.toBeInstanceOf(McqInvalidChoiceError);
	});

	it("surfaces a typed not-found error when the question is missing", async () => {
		mock.enqueueResults([]);
		await expect(updateMcq("missing", createInput)).rejects.toBeInstanceOf(McqNotFoundError);

		mock.reset();
		vi.mocked(getCloudflareContext).mockResolvedValue({
			env: { DB: mock.db },
		} as never);
		mock.enqueueResults([]);
		await expect(deleteMcq("missing")).rejects.toBeInstanceOf(McqNotFoundError);

		mock.reset();
		vi.mocked(getCloudflareContext).mockResolvedValue({
			env: { DB: mock.db },
		} as never);
		mock.enqueueResults([]);
		await expect(createMcqAttempt("missing", "choice-1")).rejects.toBeInstanceOf(McqNotFoundError);
	});
});
