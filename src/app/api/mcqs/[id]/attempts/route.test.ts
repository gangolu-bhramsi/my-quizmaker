import { beforeEach, describe, expect, it, vi } from "vitest";
import { McqInvalidChoiceError, McqNotFoundError } from "@/lib/services/mcq";

const { createMcqAttempt } = vi.hoisted(() => ({
	createMcqAttempt: vi.fn(),
}));

vi.mock("@/lib/services/mcq", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/services/mcq")>();
	return {
		...actual,
		createMcqAttempt,
	};
});

const attempt = {
	id: "attempt-1",
	mcqId: "mcq-1",
	choiceId: "choice-2",
	isCorrect: true,
	createdAt: "2026-09-03 14:00:00",
};

function context(id = "mcq-1") {
	return { params: Promise.resolve({ id }) };
}

function request(body: unknown) {
	return new Request("http://localhost/api/mcqs/mcq-1/attempts", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: typeof body === "string" ? body : JSON.stringify(body),
	});
}

describe("POST /api/mcqs/:id/attempts", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		createMcqAttempt.mockResolvedValue(attempt);
	});

	it("returns 201 for a valid choiceId", async () => {
		const { POST } = await import("./route");
		const response = await POST(request({ choiceId: "choice-2" }), context());

		expect(response.status).toBe(201);
		await expect(response.json()).resolves.toEqual(attempt);
		expect(createMcqAttempt).toHaveBeenCalledWith("mcq-1", "choice-2");
	});

	it("returns 400 when the body is not JSON", async () => {
		const { POST } = await import("./route");
		const response = await POST(request("{"), context());

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({ error: "Invalid JSON" });
		expect(createMcqAttempt).not.toHaveBeenCalled();
	});

	it("returns 400 when the body is invalid", async () => {
		const { POST } = await import("./route");
		const response = await POST(request({}), context());

		expect(response.status).toBe(400);
		expect(createMcqAttempt).not.toHaveBeenCalled();
	});

	it("returns 404 when the question is missing", async () => {
		createMcqAttempt.mockRejectedValue(new McqNotFoundError());
		const { POST } = await import("./route");
		const response = await POST(request({ choiceId: "choice-2" }), context("missing"));

		expect(response.status).toBe(404);
		await expect(response.json()).resolves.toEqual({ error: "Question not found" });
	});

	it("returns 400 when the choice does not belong to the question", async () => {
		createMcqAttempt.mockRejectedValue(new McqInvalidChoiceError());
		const { POST } = await import("./route");
		const response = await POST(request({ choiceId: "choice-9" }), context());

		expect(response.status).toBe(400);
		const json = await response.json();
		expect(json.error).toMatch(/choice/i);
	});
});
