import { beforeEach, describe, expect, it, vi } from "vitest";

const createUser = vi.fn();
const findByUsername = vi.fn();
const findPasswordHashByUsername = vi.fn();
const updateUser = vi.fn();
const deleteUser = vi.fn();

vi.mock("@/lib/services/user", () => ({
	createUser,
	findByUsername,
	findPasswordHashByUsername,
	updateUser,
	deleteUser,
}));

describe("POST /api/auth/logout", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 200 with ok true", async () => {
		const { POST } = await import("./route");
		const response = await POST(new Request("http://localhost/api/auth/logout", { method: "POST" }));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
	});

	it("does not call the user service", async () => {
		const { POST } = await import("./route");
		await POST(new Request("http://localhost/api/auth/logout", { method: "POST" }));

		expect(createUser).not.toHaveBeenCalled();
		expect(findByUsername).not.toHaveBeenCalled();
		expect(findPasswordHashByUsername).not.toHaveBeenCalled();
		expect(updateUser).not.toHaveBeenCalled();
		expect(deleteUser).not.toHaveBeenCalled();
	});
});
