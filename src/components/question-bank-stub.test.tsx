import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QuestionBankStub } from "@/components/question-bank-stub";

const { push } = vi.hoisted(() => ({
	push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
	useRouter: () => ({ push }),
}));

describe("QuestionBankStub", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("fetch", vi.fn());
	});

	it("shows question-bank stub copy without MCQ authoring controls", () => {
		render(<QuestionBankStub />);

		expect(screen.getByRole("heading", { name: /question bank/i })).toBeTruthy();
		expect(screen.getByText(/later sprint/i)).toBeTruthy();
		expect(screen.queryByRole("textbox")).toBeNull();
		expect(screen.queryByRole("button", { name: /create question/i })).toBeNull();
	});

	it("logs out then navigates to /login", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch).mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ ok: true }),
		} as Response);
		render(<QuestionBankStub />);

		await user.click(screen.getByRole("button", { name: /log out/i }));

		await waitFor(() => {
			expect(fetch).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });
			expect(push).toHaveBeenCalledWith("/login");
		});
	});
});
