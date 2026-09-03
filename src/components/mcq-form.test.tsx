import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { McqForm } from "@/components/mcq-form";

const { push } = vi.hoisted(() => ({
	push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
	useRouter: () => ({ push }),
}));

const existing = {
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

function jsonResponse(status: number, body: unknown) {
	return {
		ok: status >= 200 && status < 300,
		status,
		json: async () => body,
	} as Response;
}

describe("McqForm", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("fetch", vi.fn());
	});

	it("renders create mode with name, description, two choices, save, and cancel", () => {
		render(<McqForm />);

		expect(screen.getByLabelText(/^name$/i)).toBeTruthy();
		expect(screen.getByLabelText(/^description$/i)).toBeTruthy();
		expect(screen.getByLabelText(/^choice 1$/i)).toBeTruthy();
		expect(screen.getByLabelText(/^choice 2$/i)).toBeTruthy();
		expect(screen.queryByLabelText(/^choice 3$/i)).toBeNull();
		expect(screen.getByRole("button", { name: /^save$/i })).toBeTruthy();
		expect(screen.getByRole("button", { name: /^cancel$/i })).toBeTruthy();
	});

	it("cannot remove below two choices and can add up to six", async () => {
		const user = userEvent.setup();
		render(<McqForm />);

		expect(screen.getByRole("button", { name: /remove choice 1/i }).hasAttribute("disabled")).toBe(
			true,
		);

		await user.click(screen.getByRole("button", { name: /add choice/i }));
		expect(screen.getByLabelText(/^choice 3$/i)).toBeTruthy();
		expect(screen.getByRole("button", { name: /remove choice 1/i }).hasAttribute("disabled")).toBe(
			false,
		);

		await user.click(screen.getByRole("button", { name: /add choice/i }));
		await user.click(screen.getByRole("button", { name: /add choice/i }));
		await user.click(screen.getByRole("button", { name: /add choice/i }));
		expect(screen.getByLabelText(/^choice 6$/i)).toBeTruthy();
		expect(screen.getByRole("button", { name: /add choice/i }).hasAttribute("disabled")).toBe(true);

		await user.click(screen.getByRole("button", { name: /remove choice 6/i }));
		expect(screen.queryByLabelText(/^choice 6$/i)).toBeNull();
	});

	it("does not fetch when client validation fails", async () => {
		const user = userEvent.setup();
		render(<McqForm />);

		await user.click(screen.getByRole("button", { name: /^save$/i }));
		expect(fetch).not.toHaveBeenCalled();
		expect((await screen.findByRole("alert")).textContent).toMatch(/name/i);

		await user.type(screen.getByLabelText(/^name$/i), "What is 2 + 2?");
		await user.click(screen.getByRole("button", { name: /^save$/i }));
		expect(fetch).not.toHaveBeenCalled();
		expect((await screen.findByRole("alert")).textContent).toMatch(/choice/i);

		await user.type(screen.getByLabelText(/^choice 1$/i), "3");
		await user.type(screen.getByLabelText(/^choice 2$/i), "4");
		await user.click(screen.getByRole("button", { name: /^save$/i }));
		expect(fetch).not.toHaveBeenCalled();
		expect((await screen.findByRole("alert")).textContent).toMatch(/correct/i);
	});

	it("posts a valid create body and navigates to /mcqs on 201", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch).mockResolvedValue(jsonResponse(201, { id: "mcq-1" }));
		render(<McqForm />);

		await user.type(screen.getByLabelText(/^name$/i), "What is 2 + 2?");
		await user.type(screen.getByLabelText(/^description$/i), "Basic arithmetic");
		await user.type(screen.getByLabelText(/^choice 1$/i), "3");
		await user.type(screen.getByLabelText(/^choice 2$/i), "4");
		await user.click(screen.getByRole("radio", { name: /mark choice 2 as correct/i }));
		await user.click(screen.getByRole("button", { name: /^save$/i }));

		await waitFor(() => {
			expect(fetch).toHaveBeenCalledTimes(1);
		});
		const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
		expect(url).toBe("/api/mcqs");
		expect(init.method).toBe("POST");
		expect(JSON.parse(String(init.body))).toEqual({
			name: "What is 2 + 2?",
			description: "Basic arithmetic",
			choices: [
				{ label: "3", isCorrect: false },
				{ label: "4", isCorrect: true },
			],
		});
		expect(push).toHaveBeenCalledWith("/mcqs");
	});

	it("shows the server error and does not navigate on 400", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch).mockResolvedValue(jsonResponse(400, { error: "Validation error" }));
		render(<McqForm />);

		await user.type(screen.getByLabelText(/^name$/i), "What is 2 + 2?");
		await user.type(screen.getByLabelText(/^choice 1$/i), "3");
		await user.type(screen.getByLabelText(/^choice 2$/i), "4");
		await user.click(screen.getByRole("radio", { name: /mark choice 2 as correct/i }));
		await user.click(screen.getByRole("button", { name: /^save$/i }));

		expect((await screen.findByRole("alert")).textContent).toBe("Validation error");
		expect(push).not.toHaveBeenCalled();
	});

	it("cancels to /mcqs without posting", async () => {
		const user = userEvent.setup();
		render(<McqForm />);

		await user.click(screen.getByRole("button", { name: /^cancel$/i }));

		expect(push).toHaveBeenCalledWith("/mcqs");
		expect(fetch).not.toHaveBeenCalled();
	});

	it("loads an existing question and puts the updated body on save", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch).mockImplementation(async (input, init) => {
			const url = String(input);
			const method = (init?.method ?? "GET").toUpperCase();
			if (method === "GET" && url === "/api/mcqs/mcq-1") {
				return jsonResponse(200, existing);
			}
			if (method === "PUT" && url === "/api/mcqs/mcq-1") {
				return jsonResponse(200, existing);
			}
			throw new Error(`Unexpected fetch ${method} ${url}`);
		});

		render(<McqForm mcqId="mcq-1" />);

		expect(await screen.findByDisplayValue("What is 2 + 2?")).toBeTruthy();
		expect(screen.getByDisplayValue("Basic arithmetic")).toBeTruthy();
		expect(screen.getByDisplayValue("4")).toBeTruthy();

		await user.clear(screen.getByLabelText(/^name$/i));
		await user.type(screen.getByLabelText(/^name$/i), "What is 3 + 3?");
		await user.click(screen.getByRole("button", { name: /^save$/i }));

		await waitFor(() => {
			expect(fetch).toHaveBeenCalledWith(
				"/api/mcqs/mcq-1",
				expect.objectContaining({ method: "PUT" }),
			);
		});
		const putCall = vi.mocked(fetch).mock.calls.find(([url, init]) => {
			return url === "/api/mcqs/mcq-1" && (init as RequestInit | undefined)?.method === "PUT";
		});
		expect(JSON.parse(String(putCall?.[1]?.body))).toEqual({
			name: "What is 3 + 3?",
			description: "Basic arithmetic",
			choices: [
				{ label: "3", isCorrect: false },
				{ label: "4", isCorrect: true },
			],
		});
		expect(push).toHaveBeenCalledWith("/mcqs");
	});

	it("shows not-found copy when the question is missing", async () => {
		vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { error: "Question not found" }));
		render(<McqForm mcqId="missing" />);

		expect(await screen.findByText(/question not found/i)).toBeTruthy();
		expect(screen.queryByRole("button", { name: /^save$/i })).toBeNull();
	});
});
