"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { hashPassword } from "@/lib/password";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateLogin(username: string, email: string, password: string): string | null {
	if (!username && !email) {
		return "Enter a username or email.";
	}
	if (!password) {
		return "Password is required.";
	}
	if (username && username.length < 3) {
		return "Username must be at least 3 characters.";
	}
	if (email && !EMAIL_PATTERN.test(email)) {
		return "Enter a valid email address.";
	}
	return null;
}

export function LoginForm({ className, ...props }: React.ComponentProps<"div">) {
	const router = useRouter();
	const [username, setUsername] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const trimmedUsername = username.trim();
		const trimmedEmail = email.trim();
		const validationError = validateLogin(trimmedUsername, trimmedEmail, password);
		if (validationError) {
			setError(validationError);
			return;
		}

		setError(null);
		setPending(true);
		try {
			const passwordHash = await hashPassword(password);
			const body: { passwordHash: string; username?: string; email?: string } = { passwordHash };
			if (trimmedUsername) {
				body.username = trimmedUsername;
			}
			if (trimmedEmail) {
				body.email = trimmedEmail;
			}

			const response = await fetch("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			if (response.status === 200) {
				router.push("/mcqs");
				return;
			}

			let message = "Invalid username or password";
			try {
				const payload = (await response.json()) as { error?: string };
				if (typeof payload.error === "string") {
					message = payload.error;
				}
			} catch {
				// keep default
			}
			setError(message);
		} finally {
			setPending(false);
		}
	}

	return (
		<div className={cn("flex flex-col gap-6", className)} {...props}>
			<Card>
				<CardHeader>
					<CardTitle>Login to your account</CardTitle>
					<CardDescription>
						Enter your username, email, or both to login to your account
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={onSubmit}>
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="username">Username</FieldLabel>
								<Input
									id="username"
									name="username"
									type="text"
									placeholder="alovelace"
									autoComplete="username"
									value={username}
									onChange={(event) => setUsername(event.target.value)}
								/>
							</Field>
							<Field>
								<FieldLabel htmlFor="email">Email</FieldLabel>
								<Input
									id="email"
									name="email"
									type="email"
									placeholder="ada@school.edu"
									autoComplete="email"
									value={email}
									onChange={(event) => setEmail(event.target.value)}
								/>
							</Field>
							<Field>
								<FieldLabel htmlFor="password">Password</FieldLabel>
								<Input
									id="password"
									name="password"
									type="password"
									autoComplete="current-password"
									value={password}
									onChange={(event) => setPassword(event.target.value)}
									required
								/>
							</Field>
							{error ? (
								<Field>
									<FieldError errors={[{ message: error }]} />
								</Field>
							) : null}
							<Field>
								<Button type="submit" disabled={pending}>
									Login
								</Button>
								<FieldDescription className="text-center">
									Don&apos;t have an account? <Link href="/register">Sign up</Link>
								</FieldDescription>
							</Field>
						</FieldGroup>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
