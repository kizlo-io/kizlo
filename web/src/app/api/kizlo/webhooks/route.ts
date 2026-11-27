import { nextRevalidation } from "kizlo/nextjs/server"
import { createWebhookHandler } from "kizlo/server"

export async function POST(request: Request) {
	const secret = process.env.KIZLO_MODE === "local" ? process.env.KIZLO_LOCAL_WP_SECRET : process.env.KIZLO_WP_SECRET
	if (!secret) throw new Error("Configure the WordPress webhook signing secret for this environment")
	return createWebhookHandler({ secret, events: [{ ...nextRevalidation(), failureMode: "retry" }] })(request)
}
