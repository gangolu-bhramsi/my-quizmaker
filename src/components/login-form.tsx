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

export function LoginForm({ className, ...props }: React.ComponentProps<"div">) {
	const router = useRouter();
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const trimmedUsername = username.trim();
		if (!trimmedUsername || !password) {
			setError("Username or email and password are required.");
			return;
		}

		setError(null);
		setPending(true);
		try {
			const passwordHash = await hashPassword(password);
			const response = await fetch("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ username: trimmedUsername, passwordHash }),
			});

			if (response.status === 200) {
				router.push("/mcqs");
				return;
			}

			let message = "Invalid username or password";
			try {
				const body = (await response.json()) as { error?: string };
				if (typeof body.error === "string") {
					message = body.error;
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
					<CardDescription>Enter your username or email below to login to your account</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={onSubmit}>
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="username">Username or email</FieldLabel>
								<Input
									id="username"
									name="username"
									type="text"
									placeholder="alovelace or ada@school.edu"
									autoComplete="username"
									value={username}
									onChange={(event) => setUsername(event.target.value)}
									required
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
