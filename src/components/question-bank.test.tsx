import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QuestionBank } from "@/components/question-bank";

const { push } = vi.hoisted(() => ({
	push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
	useRouter: () => ({ push }),
}));

const listed = {
	id: "mcq-1",
	name: "What is 2 + 2?",
	description: "Basic arithmetic",
	createdAt: "2026-09-03 12:00:00",
	updatedAt: "2026-09-03 12:00:00",
};

const listedEmptyDescription = {
	...listed,
	id: "mcq-2",
	name: "What is 3 + 3?",
	description: "",
};

const fullMcq = {
	...listed,
	choices: [
		{ id: "choice-1", label: "3", isCorrect: false, position: 0 },
		{ id: "choice-2", label: "4", isCorrect: true, position: 1 },
	],
};

function jsonResponse(status: number, body: unknown) {
	return {
		ok: status >= 200 && status < 300,
		status,
		json: async () => body,
	} as Response;
}

function mockApi(items: unknown[] = [listed]) {
	vi.mocked(fetch).mockImplementation(async (input, init) => {
		const url = String(input);
		const method = (init?.method ?? "GET").toUpperCase();

		if (method === "GET" && url === "/api/mcqs") {
			return jsonResponse(200, { items });
		}
		if (method === "GET" && url === "/api/mcqs/mcq-1") {
			return jsonResponse(200, fullMcq);
		}
		if (method === "DELETE" && url === "/api/mcqs/mcq-1") {
			return { ok: true, status: 204, json: async () => ({}) } as Response;
		}
		if (method === "POST" && url === "/api/mcqs/mcq-1/attempts") {
			return jsonResponse(201, {
				id: "attempt-1",
				mcqId: "mcq-1",
				choiceId: "choice-2",
				isCorrect: true,
				createdAt: "2026-09-03 14:00:00",
			});
		}
		if (method === "POST" && url === "/api/auth/logout") {
			return jsonResponse(200, { ok: true });
		}
		throw new Error(`Unexpected fetch ${method} ${url}`);
	});
}

describe("QuestionBank", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("fetch", vi.fn());
		mockApi();
	});

	it("loads GET /api/mcqs and renders name and description in a table", async () => {
		render(<QuestionBank />);

		expect(await screen.findByRole("cell", { name: /what is 2 \+ 2\?/i })).toBeTruthy();
		expect(screen.getByRole("cell", { name: /basic arithmetic/i })).toBeTruthy();
		expect(fetch).toHaveBeenCalledWith("/api/mcqs");
	});

	it("shows empty-state copy when there are no questions", async () => {
		mockApi([]);
		render(<QuestionBank />);

		expect(await screen.findByText(/no questions yet/i)).toBeTruthy();
		expect(screen.queryByRole("cell", { name: /what is 2 \+ 2\?/i })).toBeNull();
		expect(screen.getByRole("link", { name: /create question/i })).toBeTruthy();
	});

	it("has a create question control that targets /mcqs/new", async () => {
		render(<QuestionBank />);
		await screen.findByRole("heading", { name: /question bank/i });

		const create = screen.getByRole("link", { name: /create question/i });
		expect(create.getAttribute("href")).toBe("/mcqs/new");
	});

	it("exposes edit, preview, and delete from the row actions menu", async () => {
		const user = userEvent.setup();
		render(<QuestionBank />);
		await screen.findByRole("cell", { name: /what is 2 \+ 2\?/i });

		await user.click(screen.getByRole("button", { name: /actions for what is 2 \+ 2\?/i }));

		expect(await screen.findByRole("menuitem", { name: /^edit$/i })).toBeTruthy();
		expect(screen.getByRole("menuitem", { name: /^preview$/i })).toBeTruthy();
		expect(screen.getByRole("menuitem", { name: /^delete$/i })).toBeTruthy();
	});

	it("navigates to the edit page from the row actions menu", async () => {
		const user = userEvent.setup();
		render(<QuestionBank />);
		await screen.findByRole("cell", { name: /what is 2 \+ 2\?/i });

		await user.click(screen.getByRole("button", { name: /actions for what is 2 \+ 2\?/i }));
		const edit = await screen.findByRole("menuitem", { name: /^edit$/i });
		expect(edit.getAttribute("href")).toBe("/mcqs/mcq-1/edit");
	});

	it("deletes a question after confirmation and refreshes the list", async () => {
		const user = userEvent.setup();
		let items: unknown[] = [listed];
		vi.mocked(fetch).mockImplementation(async (input, init) => {
			const url = String(input);
			const method = (init?.method ?? "GET").toUpperCase();
			if (method === "GET" && url === "/api/mcqs") {
				return jsonResponse(200, { items });
			}
			if (method === "DELETE" && url === "/api/mcqs/mcq-1") {
				items = [];
				return { ok: true, status: 204, json: async () => ({}) } as Response;
			}
			throw new Error(`Unexpected fetch ${method} ${url}`);
		});

		render(<QuestionBank />);
		await screen.findByRole("cell", { name: /what is 2 \+ 2\?/i });

		await user.click(screen.getByRole("button", { name: /actions for what is 2 \+ 2\?/i }));
		await user.click(await screen.findByRole("menuitem", { name: /^delete$/i }));
		await user.click(await screen.findByRole("button", { name: /delete question/i }));

		await waitFor(() => {
			expect(fetch).toHaveBeenCalledWith("/api/mcqs/mcq-1", { method: "DELETE" });
		});
		expect(await screen.findByText(/no questions yet/i)).toBeTruthy();
	});

	it("logs out then navigates to /login", async () => {
		const user = userEvent.setup();
		render(<QuestionBank />);
		await screen.findByRole("heading", { name: /question bank/i });

		await user.click(screen.getByRole("button", { name: /log out/i }));

		await waitFor(() => {
			expect(fetch).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });
			expect(push).toHaveBeenCalledWith("/login");
		});
	});

	it("previews a question and records an attempt", async () => {
		const user = userEvent.setup();
		render(<QuestionBank />);
		await screen.findByRole("cell", { name: /what is 2 \+ 2\?/i });

		await user.click(screen.getByRole("button", { name: /actions for what is 2 \+ 2\?/i }));
		await user.click(await screen.findByRole("menuitem", { name: /^preview$/i }));

		const dialog = await screen.findByRole("dialog");
		expect(dialog).toBeTruthy();
		expect(screen.getByRole("heading", { name: /what is 2 \+ 2\?/i })).toBeTruthy();
		expect(screen.getByRole("radio", { name: /^4$/i })).toBeTruthy();

		await user.click(screen.getByRole("radio", { name: /^4$/i }));
		await user.click(screen.getByRole("button", { name: /submit answer/i }));

		await waitFor(() => {
			expect(fetch).toHaveBeenCalledWith("/api/mcqs/mcq-1/attempts", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ choiceId: "choice-2" }),
			});
		});
		expect((await screen.findByRole("status")).textContent).toMatch(/correct/i);
	});

	it("shows an em dash when a description is empty", async () => {
		mockApi([listedEmptyDescription]);
		render(<QuestionBank />);

		expect(await screen.findByRole("cell", { name: /what is 3 \+ 3\?/i })).toBeTruthy();
		expect(screen.getByRole("cell", { name: "—" })).toBeTruthy();
	});
});
