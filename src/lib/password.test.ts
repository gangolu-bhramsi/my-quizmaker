import { describe, expect, it } from "vitest";
import { hashPassword, hashesMatch } from "@/lib/password";

describe("hashPassword", () => {
	it("returns a 64-character lowercase hex string", async () => {
		const hash = await hashPassword("correct-horse-battery");

		expect(hash).toMatch(/^[0-9a-f]{64}$/);
	});

	it("produces the same hash for the same plaintext", async () => {
		const first = await hashPassword("same-password");
		const second = await hashPassword("same-password");

		expect(first).toBe(second);
	});

	it("produces a different hash for different plaintext", async () => {
		const first = await hashPassword("password-one");
		const second = await hashPassword("password-two");

		expect(first).not.toBe(second);
	});

	it("does not return the plaintext", async () => {
		const plaintext = "not-the-hash";
		const hash = await hashPassword(plaintext);

		expect(hash).not.toBe(plaintext);
	});
});

describe("hashesMatch", () => {
	it("is true for identical hashes", () => {
		const hash = "a".repeat(64);

		expect(hashesMatch(hash, hash)).toBe(true);
	});

	it("is false for different hashes", () => {
		expect(hashesMatch("a".repeat(64), "b".repeat(64))).toBe(false);
	});
});
