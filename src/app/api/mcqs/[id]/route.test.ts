import { beforeEach, describe, expect, it, vi } from "vitest";
import { McqNotFoundError } from "@/lib/services/mcq";

const { findMcqById, updateMcq, deleteMcq } = vi.hoisted(() => ({
	findMcqById: vi.fn(),
	updateMcq: vi.fn(),
	deleteMcq: vi.fn(),
}));

vi.mock("@/lib/services/mcq", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/services/mcq")>();
	return {
		...actual,
		findMcqById,
		updateMcq,
		deleteMcq,
	};
});

const mcq = {
	id: "mcq-1",
	name: "What is 2 + 2?",
	description: "Basic arithmetic",
	createdAt: "2026-09-03 12:00:00",
	updatedAt: "2026-09-03 12:00:00",
	choices: [
		{ id: "choice-1", label: "3", isCorrect: false, position: 0 },
		{ id: "choice-2", label: "4", isCorrect: true, position: 1 },
	],
};

const validBody = {
	name: "What is 3 + 3?",
	description: "Still arithmetic",
	choices: [
		{ label: "5", isCorrect: false },
		{ label: "6", isCorrect: true },
	],
};

function context(id = "mcq-1") {
	return { params: Promise.resolve({ id }) };
}

function request(method: string, body?: unknown) {
	return new Request(`http://localhost/api/mcqs/mcq-1`, {
		method,
		headers: { "Content-Type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
}

describe("GET /api/mcqs/:id", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		findMcqById.mockResolvedValue(mcq);
	});

	it("returns 200 when the question exists", async () => {
		const { GET } = await import("./route");
		const response = await GET(request("GET"), context());

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual(mcq);
		expect(findMcqById).toHaveBeenCalledWith("mcq-1");
	});

	it("returns 404 when the question is missing", async () => {
		findMcqById.mockResolvedValue(null);
		const { GET } = await import("./route");
		const response = await GET(request("GET"), context("missing"));

		expect(response.status).toBe(404);
		await expect(response.json()).resolves.toEqual({ error: "Question not found" });
	});
});

describe("PUT /api/mcqs/:id", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		updateMcq.mockResolvedValue({ ...mcq, name: validBody.name });
	});

	it("returns 200 with the updated question", async () => {
		const { PUT } = await import("./route");
		const response = await PUT(request("PUT", validBody), context());

		expect(response.status).toBe(200);
		expect(updateMcq).toHaveBeenCalledWith("mcq-1", {
			name: "What is 3 + 3?",
			description: "Still arithmetic",
			choices: [
				{ label: "5", isCorrect: false },
				{ label: "6", isCorrect: true },
			],
		});
	});

	it("returns 400 when the body is not JSON", async () => {
		const { PUT } = await import("./route");
		const response = await PUT(
			new Request("http://localhost/api/mcqs/mcq-1", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: "{",
			}),
			context(),
		);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({ error: "Invalid JSON" });
		expect(updateMcq).not.toHaveBeenCalled();
	});

	it("returns 400 when the body is invalid", async () => {
		const { PUT } = await import("./route");
		const response = await PUT(request("PUT", { name: "" }), context());

		expect(response.status).toBe(400);
		expect(updateMcq).not.toHaveBeenCalled();
	});

	it("returns 404 when the question is missing", async () => {
		updateMcq.mockRejectedValue(new McqNotFoundError());
		const { PUT } = await import("./route");
		const response = await PUT(request("PUT", validBody), context("missing"));

		expect(response.status).toBe(404);
		await expect(response.json()).resolves.toEqual({ error: "Question not found" });
	});
});

describe("DELETE /api/mcqs/:id", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		deleteMcq.mockResolvedValue(undefined);
	});

	it("returns 204 when the question is deleted", async () => {
		const { DELETE } = await import("./route");
		const response = await DELETE(request("DELETE"), context());

		expect(response.status).toBe(204);
		expect(await response.text()).toBe("");
		expect(deleteMcq).toHaveBeenCalledWith("mcq-1");
	});

	it("returns 404 when the question is missing", async () => {
		deleteMcq.mockRejectedValue(new McqNotFoundError());
		const { DELETE } = await import("./route");
		const response = await DELETE(request("DELETE"), context("missing"));

		expect(response.status).toBe(404);
		await expect(response.json()).resolves.toEqual({ error: "Question not found" });
	});
});
