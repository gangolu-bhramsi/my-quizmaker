import { getDb } from "@/lib/db";

export class UserConflictError extends Error {
	constructor(message = "Username or email already taken") {
		super(message);
		this.name = "UserConflictError";
	}
}

export type User = {
	id: string;
	firstName: string;
	lastName: string;
	username: string;
	email: string;
};

export type CreateUserInput = {
	firstName: string;
	lastName: string;
	username: string;
	email: string;
	passwordHash: string;
};

export type UpdateUserInput = {
	firstName: string;
	lastName: string;
	username: string;
	email: string;
};

type UserRow = {
	id: string;
	first_name: string;
	last_name: string;
	username: string;
	email: string;
};

function toUser(row: UserRow): User {
	return {
		id: row.id,
		firstName: row.first_name,
		lastName: row.last_name,
		username: row.username,
		email: row.email,
	};
}

function normalizeName(value: string): string {
	return value.trim();
}

function normalizeUsername(value: string): string {
	return value.trim().toLowerCase();
}

function normalizeEmail(value: string): string {
	return value.trim().toLowerCase();
}

function isUniqueConstraintError(error: unknown): boolean {
	const parts: string[] = [];
	let current: unknown = error;
	for (let depth = 0; depth < 4 && current; depth += 1) {
		if (current instanceof Error) {
			parts.push(current.message);
			current = current.cause;
			continue;
		}
		if (typeof current === "string") {
			parts.push(current);
		}
		break;
	}
	return /UNIQUE constraint failed/i.test(parts.join(" "));
}

async function withUserConstraint<T>(operation: () => Promise<T>): Promise<T> {
	try {
		return await operation();
	} catch (error) {
		if (isUniqueConstraintError(error)) {
			throw new UserConflictError();
		}
		throw error;
	}
}

export async function createUser(input: CreateUserInput): Promise<User> {
	const db = await getDb();
	const id = crypto.randomUUID();

	return withUserConstraint(async () => {
		const { results } = await db
			.prepare(
				`INSERT INTO users (id, first_name, last_name, username, email, password_hash)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         RETURNING id, first_name, last_name, username, email`,
			)
			.bind(
				id,
				normalizeName(input.firstName),
				normalizeName(input.lastName),
				normalizeUsername(input.username),
				normalizeEmail(input.email),
				input.passwordHash,
			)
			.all<UserRow>();

		const row = results[0];
		if (!row) {
			throw new Error("Failed to create user");
		}
		return toUser(row);
	});
}

export async function findByUsername(username: string): Promise<User | null> {
	const db = await getDb();
	const { results } = await db
		.prepare(
			`SELECT id, first_name, last_name, username, email
       FROM users
       WHERE username = ?1`,
		)
		.bind(normalizeUsername(username))
		.all<UserRow>();

	const row = results[0];
	return row ? toUser(row) : null;
}

export async function findByLoginIdentifier(identifier: string): Promise<User | null> {
	const db = await getDb();
	const normalized = normalizeUsername(identifier);
	const { results } = await db
		.prepare(
			`SELECT id, first_name, last_name, username, email
       FROM users
       WHERE username = ?1 OR email = ?1
       ORDER BY CASE WHEN username = ?1 THEN 0 ELSE 1 END
       LIMIT 1`,
		)
		.bind(normalized)
		.all<UserRow>();

	const row = results[0];
	return row ? toUser(row) : null;
}

export async function findPasswordHashByUsername(username: string): Promise<string | null> {
	const db = await getDb();
	const { results } = await db
		.prepare(`SELECT password_hash FROM users WHERE username = ?1`)
		.bind(normalizeUsername(username))
		.all<{ password_hash: string }>();

	return results[0]?.password_hash ?? null;
}

export async function findPasswordHashByLoginIdentifier(
	identifier: string,
): Promise<string | null> {
	const db = await getDb();
	const normalized = normalizeUsername(identifier);
	const { results } = await db
		.prepare(
			`SELECT password_hash
       FROM users
       WHERE username = ?1 OR email = ?1
       ORDER BY CASE WHEN username = ?1 THEN 0 ELSE 1 END
       LIMIT 1`,
		)
		.bind(normalized)
		.all<{ password_hash: string }>();

	return results[0]?.password_hash ?? null;
}

export async function findById(id: string): Promise<User | null> {
	const db = await getDb();
	const { results } = await db
		.prepare(
			`SELECT id, first_name, last_name, username, email
       FROM users
       WHERE id = ?1`,
		)
		.bind(id)
		.all<UserRow>();

	const row = results[0];
	return row ? toUser(row) : null;
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<User> {
	const db = await getDb();

	return withUserConstraint(async () => {
		const { results } = await db
			.prepare(
				`UPDATE users
         SET first_name = ?1,
             last_name = ?2,
             username = ?3,
             email = ?4,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?5
         RETURNING id, first_name, last_name, username, email`,
			)
			.bind(
				normalizeName(input.firstName),
				normalizeName(input.lastName),
				normalizeUsername(input.username),
				normalizeEmail(input.email),
				id,
			)
			.all<UserRow>();

		const row = results[0];
		if (!row) {
			throw new Error("User not found");
		}
		return toUser(row);
	});
}

export async function deleteUser(id: string): Promise<void> {
	const db = await getDb();
	await db.prepare(`DELETE FROM users WHERE id = ?1`).bind(id).run();
}
