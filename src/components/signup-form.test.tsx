import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword } from "@/lib/password";
import { SignupForm } from "@/components/signup-form";

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

async function fillValidSignup(user: ReturnType<typeof userEvent.setup>) {
	await user.type(screen.getByLabelText(/first name/i), "Ada");
	await user.type(screen.getByLabelText(/last name/i), "Lovelace");
	await user.type(screen.getByLabelText(/^username$/i), "alovelace");
	await user.type(screen.getByLabelText(/^email$/i), "ada@school.edu");
	await user.type(screen.getByLabelText(/^password$/i), "password1");
	await user.type(screen.getByLabelText(/confirm password/i), "password1");
}

describe("SignupForm", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("fetch", vi.fn());
	});

	it("renders first name, last name, username, email, password, and confirm password", () => {
		render(<SignupForm />);

		expect(screen.getByLabelText(/first name/i)).toBeTruthy();
		expect(screen.getByLabelText(/last name/i)).toBeTruthy();
		expect(screen.getByLabelText(/^username$/i)).toBeTruthy();
		expect(screen.getByLabelText(/^email$/i)).toBeTruthy();
		expect(screen.getByLabelText(/^password$/i)).toBeTruthy();
		expect(screen.getByLabelText(/confirm password/i)).toBeTruthy();
		expect(screen.queryByRole("button", { name: /google/i })).toBeNull();
	});

	it("does not fetch when client validation fails", async () => {
		const user = userEvent.setup();
		render(<SignupForm />);

		await user.click(screen.getByRole("button", { name: /create account/i }));
		expect(fetch).not.toHaveBeenCalled();

		await user.type(screen.getByLabelText(/first name/i), "Ada");
		await user.type(screen.getByLabelText(/last name/i), "Lovelace");
		await user.type(screen.getByLabelText(/^username$/i), "ab");
		await user.type(screen.getByLabelText(/^email$/i), "not-an-email");
		await user.type(screen.getByLabelText(/^password$/i), "short");
		await user.type(screen.getByLabelText(/confirm password/i), "different");
		await user.click(screen.getByRole("button", { name: /create account/i }));

		expect(fetch).not.toHaveBeenCalled();
		expect(push).not.toHaveBeenCalled();
	});

	it("posts a passwordHash and never the plaintext password", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch).mockResolvedValue(jsonResponse(201, { id: "user-1" }) as Response);
		render(<SignupForm />);
		await fillValidSignup(user);
		await user.click(screen.getByRole("button", { name: /create account/i }));

		await waitFor(() => {
			expect(fetch).toHaveBeenCalledTimes(1);
		});
		const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
		expect(url).toBe("/api/auth/register");
		expect(init.method).toBe("POST");
		const payload = JSON.parse(String(init.body)) as Record<string, string>;
		expect(payload.passwordHash).toBe(await hashPassword("password1"));
		expect(payload).not.toHaveProperty("password");
		expect(payload.firstName).toBe("Ada");
		expect(payload.lastName).toBe("Lovelace");
		expect(payload.username).toBe("alovelace");
		expect(payload.email).toBe("ada@school.edu");
	});

	it("navigates to /mcqs after a 201 response", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch).mockResolvedValue(jsonResponse(201, { id: "user-1" }) as Response);
		render(<SignupForm />);
		await fillValidSignup(user);
		await user.click(screen.getByRole("button", { name: /create account/i }));

		await waitFor(() => {
			expect(push).toHaveBeenCalledWith("/mcqs");
		});
	});

	it("shows a server error and does not navigate on 409", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch).mockResolvedValue(
			jsonResponse(409, { error: "Username or email already taken" }) as Response,
		);
		render(<SignupForm />);
		await fillValidSignup(user);
		await user.click(screen.getByRole("button", { name: /create account/i }));

		expect(await screen.findByRole("alert")).toBeTruthy();
		expect(screen.getByRole("alert").textContent).toMatch(/already taken/i);
		expect(push).not.toHaveBeenCalled();
	});

	it("links to sign in", () => {
		render(<SignupForm />);
		expect(screen.getByRole("link", { name: /sign in/i }).getAttribute("href")).toBe("/login");
	});
});
