import { z } from "zod";

export const passwordHashSchema = z
	.string()
	.regex(/^[0-9a-f]{64}$/, "passwordHash must be a 64-character hex SHA-256 digest");

export const registerBodySchema = z.object({
	firstName: z.string().trim().min(1).max(100),
	lastName: z.string().trim().min(1).max(100),
	username: z.string().trim().min(3).max(254),
	email: z.string().trim().email().max(254),
	passwordHash: passwordHashSchema,
});

export const loginBodySchema = z
	.object({
		username: z.string().trim().min(3).max(254).optional(),
		email: z.string().trim().email().max(254).optional(),
		passwordHash: passwordHashSchema,
	})
	.refine((data) => Boolean(data.username) || Boolean(data.email), {
		message: "username or email is required",
	});
