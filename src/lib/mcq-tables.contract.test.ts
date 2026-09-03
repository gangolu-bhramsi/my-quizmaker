import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

const MCQ_COLUMNS = ["id", "name", "description", "created_at", "updated_at"] as const;
const CHOICE_COLUMNS = [
	"id",
	"mcq_id",
	"label",
	"is_correct",
	"position",
	"created_at",
	"updated_at",
] as const;
const ATTEMPT_COLUMNS = ["id", "mcq_id", "choice_id", "is_correct", "created_at"] as const;

function readMigrationSql(): string {
	const migrationsDir = join(repoRoot, "migrations");
	expect(existsSync(migrationsDir), "expected a migrations/ directory").toBe(true);

	const sqlFiles = readdirSync(migrationsDir).filter((file) => file.endsWith(".sql"));
	expect(sqlFiles.length, "expected at least one .sql migration").toBeGreaterThan(0);

	return sqlFiles.map((file) => readFileSync(join(migrationsDir, file), "utf8")).join("\n");
}

function tableBlock(sql: string, tableName: string): string {
	const match = sql.match(new RegExp(`CREATE TABLE\\s+${tableName}\\s*\\(([\\s\\S]*?)\\);`, "i"));
	const block = match?.[1] ?? "";
	expect(block.length, `expected a CREATE TABLE ${tableName} block`).toBeGreaterThan(0);
	return block;
}

describe("mcq tables contract", () => {
	it("defines an mcqs table with the required columns", () => {
		const sql = readMigrationSql();

		expect(sql).toMatch(/CREATE TABLE\s+mcqs\b/i);

		const mcqsBlock = tableBlock(sql, "mcqs");
		for (const column of MCQ_COLUMNS) {
			expect(mcqsBlock, `mcqs must include column ${column}`).toContain(column);
		}
	});

	it("defines mcq_choices with a cascading foreign key to mcqs", () => {
		const sql = readMigrationSql();

		expect(sql).toMatch(/CREATE TABLE\s+mcq_choices\b/i);

		const choicesBlock = tableBlock(sql, "mcq_choices");
		for (const column of CHOICE_COLUMNS) {
			expect(choicesBlock, `mcq_choices must include column ${column}`).toContain(column);
		}

		expect(choicesBlock).toMatch(/FOREIGN KEY\s*\(\s*mcq_id\s*\)\s*REFERENCES\s+mcqs\s*\(\s*id\s*\)/i);
		expect(choicesBlock).toMatch(/ON DELETE CASCADE/i);
	});

	it("defines mcq_attempts with cascading foreign keys to mcqs and mcq_choices", () => {
		const sql = readMigrationSql();

		expect(sql).toMatch(/CREATE TABLE\s+mcq_attempts\b/i);

		const attemptsBlock = tableBlock(sql, "mcq_attempts");
		for (const column of ATTEMPT_COLUMNS) {
			expect(attemptsBlock, `mcq_attempts must include column ${column}`).toContain(column);
		}

		expect(attemptsBlock).toMatch(/FOREIGN KEY\s*\(\s*mcq_id\s*\)\s*REFERENCES\s+mcqs\s*\(\s*id\s*\)/i);
		expect(attemptsBlock).toMatch(
			/FOREIGN KEY\s*\(\s*choice_id\s*\)\s*REFERENCES\s+mcq_choices\s*\(\s*id\s*\)/i,
		);
		expect(attemptsBlock).toMatch(/ON DELETE CASCADE/i);
	});

	it("indexes foreign keys used to look up choices and attempts", () => {
		const sql = readMigrationSql();

		expect(sql).toMatch(/CREATE INDEX\s+\S+\s+ON\s+mcq_choices\s*\(\s*mcq_id\s*\)/i);
		expect(sql).toMatch(/CREATE INDEX\s+\S+\s+ON\s+mcq_attempts\s*\(\s*mcq_id\s*\)/i);
		expect(sql).toMatch(/CREATE INDEX\s+\S+\s+ON\s+mcq_attempts\s*\(\s*choice_id\s*\)/i);
	});
});
