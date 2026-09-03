import { jsonError, readJsonBody } from "@/lib/auth/http";
import { attemptBodySchema } from "@/lib/mcq/schemas";
import { McqInvalidChoiceError, McqNotFoundError, createMcqAttempt } from "@/lib/services/mcq";

type RouteContext = {
	params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
	const { id } = await context.params;
	const body = await readJsonBody(request);
	if (body === undefined) {
		return jsonError("Invalid JSON", 400);
	}

	const parsed = attemptBodySchema.safeParse(body);
	if (!parsed.success) {
		return jsonError("Validation error", 400);
	}

	try {
		const attempt = await createMcqAttempt(id, parsed.data.choiceId);
		return Response.json(attempt, { status: 201 });
	} catch (error) {
		if (error instanceof McqNotFoundError) {
			return jsonError(error.message, 404);
		}
		if (error instanceof McqInvalidChoiceError) {
			return jsonError(error.message, 400);
		}
		return jsonError("Internal server error", 500);
	}
}
