import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword } from "@/lib/password";
import { LoginForm } from "@/components/login-form";

const { push } = vi.hoisted(() => ({
	push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
	useRouter: () => ({ push }),
}));

function jsonResponse(status: number, body: unknown) {
	return {
		ok: status >= 200 && status < 300,
		status,
		json: async () => body,
	};
}

describe("LoginForm", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("fetch", vi.fn());
	});

	it("renders username and password and a link to register", () => {
		render(<LoginForm />);

		expect(screen.getByLabelText(/^username$/i)).toBeTruthy();
		expect(screen.getByLabelText(/^password$/i)).toBeTruthy();
		expect(screen.queryByLabelText(/^email$/i)).toBeNull();
		expect(screen.getByRole("link", { name: /sign up/i }).getAttribute("href")).toBe("/register");
		expect(screen.queryByRole("button", { name: /google/i })).toBeNull();
		expect(screen.queryByRole("link", { name: /forgot/i })).toBeNull();
	});

	it("posts a passwordHash and never the plaintext password", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { id: "user-1" }) as Response);
		render(<LoginForm />);

		await user.type(screen.getByLabelText(/^username$/i), "alovelace");
		await user.type(screen.getByLabelText(/^password$/i), "password1");
		await user.click(screen.getByRole("button", { name: /^login$/i }));

		await waitFor(() => {
			expect(fetch).toHaveBeenCalledTimes(1);
		});
		const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
		expect(url).toBe("/api/auth/login");
		expect(init.method).toBe("POST");
		const payload = JSON.parse(String(init.body)) as Record<string, string>;
		expect(payload.username).toBe("alovelace");
		expect(payload.passwordHash).toBe(await hashPassword("password1"));
		expect(payload).not.toHaveProperty("password");
		expect(payload).not.toHaveProperty("email");
	});

	it("posts an email in the username field when the teacher types an email", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { id: "user-1" }) as Response);
		render(<LoginForm />);

		await user.type(screen.getByLabelText(/^username$/i), "ada@school.edu");
		await user.type(screen.getByLabelText(/^password$/i), "password1");
		await user.click(screen.getByRole("button", { name: /^login$/i }));

		await waitFor(() => {
			expect(fetch).toHaveBeenCalledTimes(1);
		});
		const payload = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body)) as Record<
			string,
			string
		>;
		expect(payload.username).toBe("ada@school.edu");
		expect(push).toHaveBeenCalledWith("/mcqs");
	});

	it("navigates to /mcqs after a 200 response", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { id: "user-1" }) as Response);
		render(<LoginForm />);

		await user.type(screen.getByLabelText(/^username$/i), "alovelace");
		await user.type(screen.getByLabelText(/^password$/i), "password1");
		await user.click(screen.getByRole("button", { name: /^login$/i }));

		await waitFor(() => {
			expect(push).toHaveBeenCalledWith("/mcqs");
		});
	});

	it("shows invalid credentials and does not navigate on 401", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch).mockResolvedValue(
			jsonResponse(401, { error: "Invalid username or password" }) as Response,
		);
		render(<LoginForm />);

		await user.type(screen.getByLabelText(/^username$/i), "alovelace");
		await user.type(screen.getByLabelText(/^password$/i), "wrong-pass");
		await user.click(screen.getByRole("button", { name: /^login$/i }));

		expect((await screen.findByRole("alert")).textContent).toBe("Invalid username or password");
		expect(push).not.toHaveBeenCalled();
	});
});
