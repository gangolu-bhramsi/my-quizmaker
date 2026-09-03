import { beforeEach, describe, expect, it, vi } from "vitest";

const { listMcqs, createMcq } = vi.hoisted(() => ({
	listMcqs: vi.fn(),
	createMcq: vi.fn(),
}));

vi.mock("@/lib/services/mcq", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/services/mcq")>();
	return {
		...actual,
		listMcqs,
		createMcq,
	};
});

const listed = {
	id: "mcq-1",
	name: "What is 2 + 2?",
	description: "Basic arithmetic",
	createdAt: "2026-09-03 12:00:00",
	updatedAt: "2026-09-03 12:00:00",
};

const created = {
	...listed,
	choices: [
		{ id: "choice-1", label: "3", isCorrect: false, position: 0 },
		{ id: "choice-2", label: "4", isCorrect: true, position: 1 },
	],
};

const validBody = {
	name: "What is 2 + 2?",
	description: "Basic arithmetic",
	choices: [
		{ label: "3", isCorrect: false },
		{ label: "4", isCorrect: true },
	],
};

function request(method: string, body?: unknown) {
	return new Request("http://localhost/api/mcqs", {
		method,
		headers: { "Content-Type": "application/json" },
		body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
	});
}

describe("GET /api/mcqs", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		listMcqs.mockResolvedValue([listed]);
	});

	it("returns 200 with items from listMcqs", async () => {
		const { GET } = await import("./route");
		const response = await GET();

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ items: [listed] });
		expect(listMcqs).toHaveBeenCalledOnce();
	});

	it("returns 500 without a stack on unexpected errors", async () => {
		listMcqs.mockRejectedValue(new Error("boom\n    at secret.ts:12:3"));
		const { GET } = await import("./route");
		const response = await GET();

		expect(response.status).toBe(500);
		const text = await response.text();
		expect(text).not.toContain("secret.ts");
		expect(JSON.parse(text)).toEqual({ error: "Internal server error" });
	});
});

describe("POST /api/mcqs", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		createMcq.mockResolvedValue(created);
	});

	it("returns 201 with the created question and choices", async () => {
		const { POST } = await import("./route");
		const response = await POST(request("POST", validBody));

		expect(response.status).toBe(201);
		await expect(response.json()).resolves.toEqual(created);
		expect(createMcq).toHaveBeenCalledWith({
			name: "What is 2 + 2?",
			description: "Basic arithmetic",
			choices: [
				{ label: "3", isCorrect: false },
				{ label: "4", isCorrect: true },
			],
		});
	});

	it("returns 400 when the body is not JSON", async () => {
		const { POST } = await import("./route");
		const response = await POST(request("POST", "{"));

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({ error: "Invalid JSON" });
		expect(createMcq).not.toHaveBeenCalled();
	});

	it("returns 400 when the name is missing", async () => {
		const { POST } = await import("./route");
		const response = await POST(request("POST", { ...validBody, name: "" }));

		expect(response.status).toBe(400);
		expect(createMcq).not.toHaveBeenCalled();
	});

	it("returns 400 when there are fewer than 2 choices", async () => {
		const { POST } = await import("./route");
		const response = await POST(
			request("POST", { ...validBody, choices: [{ label: "4", isCorrect: true }] }),
		);

		expect(response.status).toBe(400);
		expect(createMcq).not.toHaveBeenCalled();
	});

	it("returns 400 when there are more than 6 choices", async () => {
		const { POST } = await import("./route");
		const choices = Array.from({ length: 7 }, (_, index) => ({
			label: `Choice ${index + 1}`,
			isCorrect: index === 0,
		}));
		const response = await POST(request("POST", { ...validBody, choices }));

		expect(response.status).toBe(400);
		expect(createMcq).not.toHaveBeenCalled();
	});

	it("returns 400 when zero or two choices are marked correct", async () => {
		const { POST } = await import("./route");

		const noneCorrect = await POST(
			request("POST", {
				...validBody,
				choices: [
					{ label: "3", isCorrect: false },
					{ label: "4", isCorrect: false },
				],
			}),
		);
		expect(noneCorrect.status).toBe(400);

		const twoCorrect = await POST(
			request("POST", {
				...validBody,
				choices: [
					{ label: "3", isCorrect: true },
					{ label: "4", isCorrect: true },
				],
			}),
		);
		expect(twoCorrect.status).toBe(400);
		expect(createMcq).not.toHaveBeenCalled();
	});

	it("returns 500 without a stack on unexpected errors", async () => {
		createMcq.mockRejectedValue(new Error("boom\n    at secret.ts:12:3"));
		const { POST } = await import("./route");
		const response = await POST(request("POST", validBody));

		expect(response.status).toBe(500);
		const text = await response.text();
		expect(text).not.toContain("secret.ts");
		expect(JSON.parse(text)).toEqual({ error: "Internal server error" });
	});
});
