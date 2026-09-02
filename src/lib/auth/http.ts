import { NextResponse } from "next/server";

export function jsonError(message: string, status: number) {
	return NextResponse.json({ error: message }, { status });
}

export async function readJsonBody(request: Request): Promise<unknown | undefined> {
	try {
		return await request.json();
	} catch {
		return undefined;
	}
}
