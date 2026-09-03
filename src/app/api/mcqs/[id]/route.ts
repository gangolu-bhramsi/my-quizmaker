import { jsonError, readJsonBody } from "@/lib/auth/http";
import { mcqBodySchema } from "@/lib/mcq/schemas";
import { McqNotFoundError, deleteMcq, findMcqById, updateMcq } from "@/lib/services/mcq";

type RouteContext = {
	params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
	const { id } = await context.params;

	try {
		const mcq = await findMcqById(id);
		if (!mcq) {
			return jsonError("Question not found", 404);
		}
		return Response.json(mcq);
	} catch {
		return jsonError("Internal server error", 500);
	}
}

export async function PUT(request: Request, context: RouteContext) {
	const { id } = await context.params;
	const body = await readJsonBody(request);
	if (body === undefined) {
		return jsonError("Invalid JSON", 400);
	}

	const parsed = mcqBodySchema.safeParse(body);
	if (!parsed.success) {
		return jsonError("Validation error", 400);
	}

	try {
		const mcq = await updateMcq(id, parsed.data);
		return Response.json(mcq);
	} catch (error) {
		if (error instanceof McqNotFoundError) {
			return jsonError(error.message, 404);
		}
		return jsonError("Internal server error", 500);
	}
}

export async function DELETE(_request: Request, context: RouteContext) {
	const { id } = await context.params;

	try {
		await deleteMcq(id);
		return new Response(null, { status: 204 });
	} catch (error) {
		if (error instanceof McqNotFoundError) {
			return jsonError(error.message, 404);
		}
		return jsonError("Internal server error", 500);
	}
}
