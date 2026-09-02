"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

function validateSignup(values: {
	firstName: string;
	lastName: string;
	username: string;
	email: string;
	password: string;
	confirmPassword: string;
}): string | null {
	if (
		!values.firstName ||
		!values.lastName ||
		!values.username ||
		!values.email ||
		!values.password ||
		!values.confirmPassword
	) {
		return "All fields are required.";
	}
	if (values.username.length < 3) {
		return "Username must be at least 3 characters.";
	}
	if (!EMAIL_PATTERN.test(values.email)) {
		return "Enter a valid email address.";
	}
	if (values.password.length < 8) {
		return "Password must be at least 8 characters long.";
	}
	if (values.password !== values.confirmPassword) {
		return "Passwords do not match.";
	}
	return null;
}

export function SignupForm({ ...props }: React.ComponentProps<typeof Card>) {
	const router = useRouter();
	const [firstName, setFirstName] = useState("");
	const [lastName, setLastName] = useState("");
	const [username, setUsername] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const values = {
			firstName: firstName.trim(),
			lastName: lastName.trim(),
			username: username.trim(),
			email: email.trim(),
			password,
			confirmPassword,
		};
		const validationError = validateSignup(values);
		if (validationError) {
			setError(validationError);
			return;
		}

		setError(null);
		setPending(true);
		try {
			const passwordHash = await hashPassword(values.password);
			const response = await fetch("/api/auth/register", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					firstName: values.firstName,
					lastName: values.lastName,
					username: values.username,
					email: values.email,
					passwordHash,
				}),
			});

			if (response.status === 201) {
				router.push("/mcqs");
				return;
			}

			let message = "Could not create your account.";
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
		<Card {...props}>
			<CardHeader>
				<CardTitle>Create an account</CardTitle>
				<CardDescription>Enter your information below to create your account</CardDescription>
			</CardHeader>
			<CardContent>
				<form onSubmit={onSubmit}>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor="first-name">First name</FieldLabel>
							<Input
								id="first-name"
								name="firstName"
								type="text"
								placeholder="Ada"
								autoComplete="given-name"
								value={firstName}
								onChange={(event) => setFirstName(event.target.value)}
								required
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="last-name">Last name</FieldLabel>
							<Input
								id="last-name"
								name="lastName"
								type="text"
								placeholder="Lovelace"
								autoComplete="family-name"
								value={lastName}
								onChange={(event) => setLastName(event.target.value)}
								required
							/>
						</Field>
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
								required
							/>
							<FieldDescription>May be the same as your email if you prefer.</FieldDescription>
						</Field>
						<Field>
							<FieldLabel htmlFor="email">Email</FieldLabel>
							<Input
								id="email"
								name="email"
								type="email"
								placeholder="m@example.com"
								autoComplete="email"
								value={email}
								onChange={(event) => setEmail(event.target.value)}
								required
							/>
							<FieldDescription>
								We&apos;ll use this to contact you. We will not share your email with anyone else.
							</FieldDescription>
						</Field>
						<Field>
							<FieldLabel htmlFor="password">Password</FieldLabel>
							<Input
								id="password"
								name="password"
								type="password"
								autoComplete="new-password"
								value={password}
								onChange={(event) => setPassword(event.target.value)}
								required
							/>
							<FieldDescription>Must be at least 8 characters long.</FieldDescription>
						</Field>
						<Field>
							<FieldLabel htmlFor="confirm-password">Confirm Password</FieldLabel>
							<Input
								id="confirm-password"
								name="confirmPassword"
								type="password"
								autoComplete="new-password"
								value={confirmPassword}
								onChange={(event) => setConfirmPassword(event.target.value)}
								required
							/>
							<FieldDescription>Please confirm your password.</FieldDescription>
						</Field>
						{error ? <FieldError errors={[{ message: error }]} /> : null}
						<FieldGroup>
							<Field>
								<Button type="submit" disabled={pending}>
									Create Account
								</Button>
								<FieldDescription className="px-6 text-center">
									Already have an account? <Link href="/login">Sign in</Link>
								</FieldDescription>
							</Field>
						</FieldGroup>
					</FieldGroup>
				</form>
			</CardContent>
		</Card>
	);
}
