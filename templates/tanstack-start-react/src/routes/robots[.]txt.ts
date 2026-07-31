import { createFileRoute } from "@tanstack/react-router"
import { createRobotsRoute } from "kizlo/tanstack-start/server"
import { client } from "@/lib/kizlo/server"

export const Route = createFileRoute("/robots.txt")({
	server: {
		handlers: { GET: createRobotsRoute(client) },
	},
})
