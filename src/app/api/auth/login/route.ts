import { hashesMatch } from "@/lib/password";
import { jsonError, readJsonBody } from "@/lib/auth/http";
import { loginBodySchema } from "@/lib/auth/schemas";
import { findByLoginIdentifier, findPasswordHashByLoginIdentifier } from "@/lib/services/user";

const INVALID_CREDENTIALS = "Invalid username or password";
const DUMMY_HASH = "0".repeat(64);

export async function POST(request: Request) {
	const body = await readJsonBody(request);
	if (body === undefined) {
		return jsonError("Invalid JSON", 400);
	}

	const parsed = loginBodySchema.safeParse(body);
	if (!parsed.success) {
		return jsonError("Validation error", 400);
	}

	const identifier = parsed.data.username ?? parsed.data.email;
	if (!identifier) {
		return jsonError("Validation error", 400);
	}

	const storedHash = await findPasswordHashByLoginIdentifier(identifier);
	const matches = hashesMatch(parsed.data.passwordHash, storedHash ?? DUMMY_HASH);
	if (!storedHash || !matches) {
		return jsonError(INVALID_CREDENTIALS, 401);
	}

	const user = await findByLoginIdentifier(identifier);
	if (!user) {
		return jsonError(INVALID_CREDENTIALS, 401);
	}

	if (parsed.data.username && parsed.data.email) {
		const usernameMatches = user.username === parsed.data.username.trim().toLowerCase();
		const emailMatches = user.email === parsed.data.email.trim().toLowerCase();
		if (!usernameMatches || !emailMatches) {
			return jsonError(INVALID_CREDENTIALS, 401);
		}
	}

	return Response.json(user);
}
