import { jsonError, readJsonBody } from "@/lib/auth/http";
import { mcqBodySchema } from "@/lib/mcq/schemas";
import { createMcq, listMcqs } from "@/lib/services/mcq";

export async function GET() {
	try {
		const items = await listMcqs();
		return Response.json({ items });
	} catch {
		return jsonError("Internal server error", 500);
	}
}

export async function POST(request: Request) {
	const body = await readJsonBody(request);
	if (body === undefined) {
		return jsonError("Invalid JSON", 400);
	}

	const parsed = mcqBodySchema.safeParse(body);
	if (!parsed.success) {
		return jsonError("Validation error", 400);
	}

	try {
		const mcq = await createMcq(parsed.data);
		return Response.json(mcq, { status: 201 });
	} catch {
		return jsonError("Internal server error", 500);
	}
}
