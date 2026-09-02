import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function getDb(): Promise<D1Database> {
	const { env } = await getCloudflareContext({ async: true });
	return env.DB;
}
