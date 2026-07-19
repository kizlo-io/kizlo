import { createEventHandler, createExtension, createMiddleware, createProcedure } from "kizlo"
import { createKizlo } from "kizlo/nextjs/server"
import z from "zod"

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
					router: {
						some: createProcedure(
							{
								scope: "api",
								output: z.object({ val: z.string() }),
								path: "/something/{id}",
								errors: { SOME_ERROR: {} },
								middlewares: [
									createMiddleware(({ next, input, context, errors }) => {
										return next({
											context: {
												some: "",
											},
										})
									}),
								],
							},
							({ context, input, errors }) => {
								return { val: "" }
							},
						),
					},
				}
			},
		}),
	],
})

// client.settings.postType.update({ key: "", data: {} })
