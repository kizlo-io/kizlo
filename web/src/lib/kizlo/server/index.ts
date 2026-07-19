import { createEventHandler, createExtension } from "kizlo"
import { createKizlo } from "kizlo/nextjs/server"

export const { router, client, context, handler } = createKizlo({
	extensions: [
		createExtension({
			id: "test",
			init: (a) => {
				return {
					events: [
						createEventHandler((e, c) => {
							console.log(e)
						}),
					],
				}
			},
		}),
	],
})

// client.settings.postType.update({ key: "", data: {} })
