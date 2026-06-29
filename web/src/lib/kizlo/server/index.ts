import { createEventHandler, createExtension } from "kizlo"
import { createKizlo } from "kizlo/nextjs/server"

export const { router, client, context, handler } = createKizlo({
	extensions: [
		createExtension({
			id: "test",
			init: () => {
				return {
					events: [
						createEventHandler((e) => {
							console.log(e)
						}),
					],
				}
			},
		}),
	],
})
