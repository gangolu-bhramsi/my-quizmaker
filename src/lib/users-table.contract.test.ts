import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

const REQUIRED_COLUMNS = [
	"id",
	"first_name",
	"last_name",
	"username",
	"email",
	"password_hash",
	"created_at",
	"updated_at",
] as const;

function readMigrationSql(): string {
	const migrationsDir = join(repoRoot, "migrations");
	expect(existsSync(migrationsDir), "expected a migrations/ directory").toBe(true);

	const sqlFiles = readdirSync(migrationsDir).filter((file) => file.endsWith(".sql"));
	expect(sqlFiles.length, "expected at least one .sql migration").toBeGreaterThan(0);

	return sqlFiles.map((file) => readFileSync(join(migrationsDir, file), "utf8")).join("\n");
}

describe("users table contract", () => {
	it("defines a users table with the required columns", () => {
		const sql = readMigrationSql();

		expect(sql).toMatch(/CREATE TABLE\s+users\b/i);

		for (const column of REQUIRED_COLUMNS) {
			expect(sql, `migration SQL must include column ${column}`).toContain(column);
		}
	});

	it("declares unique indexes on username and email", () => {
		const sql = readMigrationSql();

		expect(sql).toMatch(/CREATE UNIQUE INDEX\s+\S+\s+ON\s+users\s*\(\s*username\s*\)/i);
		expect(sql).toMatch(/CREATE UNIQUE INDEX\s+\S+\s+ON\s+users\s*\(\s*email\s*\)/i);
	});

	it("binds D1 as DB in wrangler.jsonc", () => {
		const wrangler = readFileSync(join(repoRoot, "wrangler.jsonc"), "utf8");

		expect(wrangler).toMatch(/"d1_databases"\s*:/);
		expect(wrangler).toMatch(/"binding"\s*:\s*"DB"/);
	});
});
