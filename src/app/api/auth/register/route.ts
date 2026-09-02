import { registerBodySchema } from "@/lib/auth/schemas";
import { jsonError, readJsonBody } from "@/lib/auth/http";
import { UserConflictError, createUser } from "@/lib/services/user";

export async function POST(request: Request) {
	const body = await readJsonBody(request);
	if (body === undefined) {
		return jsonError("Invalid JSON", 400);
	}

	const parsed = registerBodySchema.safeParse(body);
	if (!parsed.success) {
		return jsonError("Validation error", 400);
	}

	try {
		const user = await createUser(parsed.data);
		return Response.json(user, { status: 201 });
	} catch (error) {
		if (error instanceof UserConflictError) {
			return jsonError(error.message, 409);
		}
		return jsonError("Internal server error", 500);
	}
}
