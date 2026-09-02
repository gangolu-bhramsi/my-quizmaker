import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserConflictError } from "@/lib/services/user";

const { createUser } = vi.hoisted(() => ({
	createUser: vi.fn(),
}));

vi.mock("@/lib/services/user", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/services/user")>();
	return {
		...actual,
		createUser,
	};
});

const ada = {
	id: "user-1",
	firstName: "Ada",
	lastName: "Lovelace",
	username: "alovelace",
	email: "ada@school.edu",
};

const validHash = "a".repeat(64);

function registerRequest(body: unknown) {
	return new Request("http://localhost/api/auth/register", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: typeof body === "string" ? body : JSON.stringify(body),
	});
}

describe("POST /api/auth/register", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		createUser.mockResolvedValue(ada);
	});

	it("returns 201 with public user fields and no password hash", async () => {
		const { POST } = await import("./route");
		const response = await POST(
			registerRequest({
				firstName: "Ada",
				lastName: "Lovelace",
				username: "alovelace",
				email: "ada@school.edu",
				passwordHash: validHash,
			}),
		);

		expect(response.status).toBe(201);
		const json = await response.json();
		expect(json).toEqual(ada);
		expect(json).not.toHaveProperty("passwordHash");
		expect(json).not.toHaveProperty("password_hash");
		expect(createUser).toHaveBeenCalledWith({
			firstName: "Ada",
			lastName: "Lovelace",
			username: "alovelace",
			email: "ada@school.edu",
			passwordHash: validHash,
		});
	});

	it("accepts username equal to email", async () => {
		const { POST } = await import("./route");
		const shared = "ada@school.edu";
		createUser.mockResolvedValue({ ...ada, username: shared, email: shared });

		const response = await POST(
			registerRequest({
				firstName: "Ada",
				lastName: "Lovelace",
				username: shared,
				email: shared,
				passwordHash: validHash,
			}),
		);

		expect(response.status).toBe(201);
		expect(createUser).toHaveBeenCalled();
	});

	it("returns 400 when fields are missing or passwordHash is not 64-char hex", async () => {
		const { POST } = await import("./route");

		const missing = await POST(registerRequest({ firstName: "Ada" }));
		expect(missing.status).toBe(400);
		expect(createUser).not.toHaveBeenCalled();

		const badHash = await POST(
			registerRequest({
				firstName: "Ada",
				lastName: "Lovelace",
				username: "alovelace",
				email: "ada@school.edu",
				passwordHash: "not-a-hash",
			}),
		);
		expect(badHash.status).toBe(400);
		expect(createUser).not.toHaveBeenCalled();
	});

	it("returns 409 when the user service reports a conflict", async () => {
		const { POST } = await import("./route");
		createUser.mockRejectedValue(new UserConflictError());

		const response = await POST(
			registerRequest({
				firstName: "Ada",
				lastName: "Lovelace",
				username: "alovelace",
				email: "ada@school.edu",
				passwordHash: validHash,
			}),
		);

		expect(response.status).toBe(409);
		const json = await response.json();
		expect(json.error).toMatch(/already taken/i);
	});

	it("returns 500 without hash or stack on unexpected errors", async () => {
		const { POST } = await import("./route");
		createUser.mockRejectedValue(new Error(`boom ${validHash}\n    at secret.ts:12:3`));

		const response = await POST(
			registerRequest({
				firstName: "Ada",
				lastName: "Lovelace",
				username: "alovelace",
				email: "ada@school.edu",
				passwordHash: validHash,
			}),
		);

		expect(response.status).toBe(500);
		const text = await response.text();
		expect(text).not.toContain(validHash);
		expect(text).not.toContain("secret.ts");
		expect(text).not.toContain("at ");
		const json = JSON.parse(text) as { error: string };
		expect(json.error).toBe("Internal server error");
	});
});
