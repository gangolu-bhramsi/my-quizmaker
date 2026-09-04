import { getCloudflareContext } from "@opennextjs/cloudflare";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	UserConflictError,
	createUser,
	deleteUser,
	findById,
	findByLoginIdentifier,
	findByUsername,
	findPasswordHashByLoginIdentifier,
	findPasswordHashByUsername,
	updateUser,
} from "@/lib/services/user";

vi.mock("@opennextjs/cloudflare", () => ({
	getCloudflareContext: vi.fn(),
}));

type QueryCall = { sql: string; params: unknown[] };

function createMockD1() {
	const calls: QueryCall[] = [];
	let nextResults: Record<string, unknown>[] = [];
	let queuedResults: Record<string, unknown>[][] = [];
	let nextError: Error | null = null;

	const db = {
		prepare(sql: string) {
			return {
				bind(...params: unknown[]) {
					calls.push({ sql, params });
					return {
						async all() {
							if (nextError) {
								const error = nextError;
								nextError = null;
								throw error;
							}
							const queued = queuedResults.shift();
							return { results: queued ?? nextResults };
						},
						async run() {
							if (nextError) {
								const error = nextError;
								nextError = null;
								throw error;
							}
							return { success: true, meta: { changes: 1 } };
						},
					};
				},
			};
		},
	};

	return {
		db,
		calls,
		setResults(rows: Record<string, unknown>[]) {
			nextResults = rows;
			queuedResults = [];
		},
		queueResults(...batches: Record<string, unknown>[][]) {
			queuedResults = batches;
		},
		setError(error: Error) {
			nextError = error;
		},
	};
}

const adaRow = {
	id: "user-1",
	first_name: "Ada",
	last_name: "Lovelace",
	username: "alovelace",
	email: "ada@school.edu",
};

const adaPublic = {
	id: "user-1",
	firstName: "Ada",
	lastName: "Lovelace",
	username: "alovelace",
	email: "ada@school.edu",
};

describe("user service", () => {
	const mock = createMockD1();

	beforeEach(() => {
		vi.clearAllMocks();
		mock.calls.length = 0;
		mock.setResults([]);
		mock.queueResults();
		vi.mocked(getCloudflareContext).mockResolvedValue({
			env: { DB: mock.db },
		} as never);
	});

	it("create binds first name, last name, lowercase username and email, and passwordHash", async () => {
		mock.setResults([adaRow]);

		const created = await createUser({
			firstName: "Ada",
			lastName: "Lovelace",
			username: "ALovelace",
			email: "Ada@School.EDU",
			passwordHash: "a".repeat(64),
		});

		expect(created).toEqual(adaPublic);
		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0]?.sql).toMatch(/\?1/);
		expect(mock.calls[0]?.sql).toMatch(/\?2/);
		expect(mock.calls[0]?.params).toEqual(
			expect.arrayContaining(["Ada", "Lovelace", "alovelace", "ada@school.edu", "a".repeat(64)]),
		);
		expect(mock.calls[0]?.sql.toLowerCase()).not.toContain("alovelace");
		expect(mock.calls[0]?.sql.toLowerCase()).not.toContain("ada@school.edu");
	});

	it("create succeeds when username and email are the same value", async () => {
		const shared = "ada@school.edu";
		mock.setResults([
			{
				...adaRow,
				username: shared,
				email: shared,
			},
		]);

		const created = await createUser({
			firstName: "Ada",
			lastName: "Lovelace",
			username: shared,
			email: shared,
			passwordHash: "a".repeat(64),
		});

		expect(created.username).toBe(shared);
		expect(created.email).toBe(shared);
	});

	it("findByUsername returns the user without a password hash", async () => {
		mock.setResults([{ ...adaRow, password_hash: "should-not-leak" }]);

		const user = await findByUsername("ALovelace");

		expect(user).toEqual(adaPublic);
		expect(user).not.toHaveProperty("passwordHash");
		expect(user).not.toHaveProperty("password_hash");
		expect(mock.calls[0]?.params).toEqual(["alovelace"]);
	});

	it("findByUsername returns null when no row exists", async () => {
		mock.setResults([]);

		await expect(findByUsername("missing")).resolves.toBeNull();
	});

	it("findPasswordHashByUsername returns the stored hash without leaking it from findByUsername", async () => {
		const storedHash = "b".repeat(64);
		mock.setResults([{ password_hash: storedHash }]);

		const hash = await findPasswordHashByUsername("alovelace");
		expect(hash).toBe(storedHash);

		mock.setResults([adaRow]);
		const publicUser = await findByUsername("alovelace");
		expect(publicUser).not.toHaveProperty("passwordHash");
		expect(publicUser).not.toHaveProperty("password_hash");
	});

	it("findByLoginIdentifier matches username without querying email", async () => {
		mock.setResults([adaRow]);

		const user = await findByLoginIdentifier("ALovelace");

		expect(user).toEqual(adaPublic);
		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0]?.sql).toMatch(/WHERE\s+username\s*=\s*\?1/i);
		expect(mock.calls[0]?.sql).not.toMatch(/OR\s+email/i);
		expect(mock.calls[0]?.params).toEqual(["alovelace"]);
	});

	it("findByLoginIdentifier falls back to an email-only query after username misses", async () => {
		mock.queueResults([], [{ ...adaRow, password_hash: "should-not-leak" }]);

		const user = await findByLoginIdentifier("Ada@School.EDU");

		expect(user).toEqual(adaPublic);
		expect(user).not.toHaveProperty("passwordHash");
		expect(user).not.toHaveProperty("password_hash");
		expect(mock.calls).toHaveLength(2);
		expect(mock.calls[0]?.sql).toMatch(/WHERE\s+username\s*=\s*\?1/i);
		expect(mock.calls[0]?.params).toEqual(["ada@school.edu"]);
		expect(mock.calls[1]?.sql).toMatch(/WHERE\s+email\s*=\s*\?1/i);
		expect(mock.calls[1]?.sql).not.toMatch(/\bOR\b/i);
		expect(mock.calls[1]?.params).toEqual(["ada@school.edu"]);
	});

	it("findPasswordHashByLoginIdentifier looks up the hash by email after username misses", async () => {
		const storedHash = "c".repeat(64);
		mock.queueResults([], [{ password_hash: storedHash }]);

		const hash = await findPasswordHashByLoginIdentifier("ada@school.edu");

		expect(hash).toBe(storedHash);
		expect(mock.calls).toHaveLength(2);
		expect(mock.calls[0]?.sql).toMatch(/WHERE\s+username\s*=\s*\?1/i);
		expect(mock.calls[1]?.sql).toMatch(/WHERE\s+email\s*=\s*\?1/i);
		expect(mock.calls[1]?.params).toEqual(["ada@school.edu"]);
	});

	it("findById returns the public user for a matching id", async () => {
		mock.setResults([adaRow]);

		await expect(findById("user-1")).resolves.toEqual(adaPublic);
		expect(mock.calls[0]?.sql).toMatch(/WHERE\s+id\s*=\s*\?1/i);
		expect(mock.calls[0]?.params).toEqual(["user-1"]);
	});

	it("update binds the new profile fields for the given id", async () => {
		mock.setResults([
			{
				...adaRow,
				first_name: "Ada",
				last_name: "Byron",
			},
		]);

		const updated = await updateUser("user-1", {
			firstName: "Ada",
			lastName: "Byron",
			username: "abyron",
			email: "ada@school.edu",
		});

		expect(updated.lastName).toBe("Byron");
		expect(mock.calls[0]?.sql).toMatch(/UPDATE\s+users/i);
		expect(mock.calls[0]?.sql).toMatch(/\?1/);
		expect(mock.calls[0]?.params).toEqual(
			expect.arrayContaining(["Ada", "Byron", "abyron", "ada@school.edu", "user-1"]),
		);
	});

	it("delete issues a delete for the given id", async () => {
		await deleteUser("user-1");

		expect(mock.calls[0]?.sql).toMatch(/DELETE\s+FROM\s+users/i);
		expect(mock.calls[0]?.params).toEqual(["user-1"]);
	});

	it("surfaces duplicate username or email as UserConflictError", async () => {
		mock.setError(new Error("D1_ERROR: UNIQUE constraint failed: users.username"));

		await expect(
			createUser({
				firstName: "Ada",
				lastName: "Lovelace",
				username: "alovelace",
				email: "ada@school.edu",
				passwordHash: "a".repeat(64),
			}),
		).rejects.toBeInstanceOf(UserConflictError);
	});
});
