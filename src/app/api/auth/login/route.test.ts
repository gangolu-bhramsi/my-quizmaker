import { beforeEach, describe, expect, it, vi } from "vitest";

const { findByLoginIdentifier, findPasswordHashByLoginIdentifier } = vi.hoisted(() => ({
	findByLoginIdentifier: vi.fn(),
	findPasswordHashByLoginIdentifier: vi.fn(),
}));

vi.mock("@/lib/services/user", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/services/user")>();
	return {
		...actual,
		findByLoginIdentifier,
		findPasswordHashByLoginIdentifier,
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

function loginRequest(body: unknown) {
	return new Request("http://localhost/api/auth/login", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: typeof body === "string" ? body : JSON.stringify(body),
	});
}

describe("POST /api/auth/login", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		findPasswordHashByLoginIdentifier.mockResolvedValue(validHash);
		findByLoginIdentifier.mockResolvedValue(ada);
	});

	it("returns 200 with public user fields and no password hash", async () => {
		const { POST } = await import("./route");
		const response = await POST(
			loginRequest({
				username: "alovelace",
				passwordHash: validHash,
			}),
		);

		expect(response.status).toBe(200);
		const json = await response.json();
		expect(json).toEqual(ada);
		expect(json).not.toHaveProperty("passwordHash");
		expect(json).not.toHaveProperty("password_hash");
	});

	it("returns 200 when the username field contains an email", async () => {
		const { POST } = await import("./route");
		const response = await POST(
			loginRequest({
				username: "ada@school.edu",
				passwordHash: validHash,
			}),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(ada);
		expect(findPasswordHashByLoginIdentifier).toHaveBeenCalledWith("ada@school.edu");
		expect(findByLoginIdentifier).toHaveBeenCalledWith("ada@school.edu");
	});

	it("returns 401 with the same message for an unknown user", async () => {
		const { POST } = await import("./route");
		findPasswordHashByLoginIdentifier.mockResolvedValue(null);

		const response = await POST(
			loginRequest({
				username: "missing",
				passwordHash: validHash,
			}),
		);

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: "Invalid username or password" });
		expect(findByLoginIdentifier).not.toHaveBeenCalled();
	});

	it("returns 401 with the same message for a hash mismatch", async () => {
		const { POST } = await import("./route");
		findPasswordHashByLoginIdentifier.mockResolvedValue("b".repeat(64));

		const response = await POST(
			loginRequest({
				username: "alovelace",
				passwordHash: validHash,
			}),
		);

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: "Invalid username or password" });
		expect(findByLoginIdentifier).not.toHaveBeenCalled();
	});

	it("returns 400 for an invalid body", async () => {
		const { POST } = await import("./route");

		const response = await POST(
			loginRequest({
				username: "alovelace",
				passwordHash: "short",
			}),
		);

		expect(response.status).toBe(400);
		expect(findPasswordHashByLoginIdentifier).not.toHaveBeenCalled();
	});
});
