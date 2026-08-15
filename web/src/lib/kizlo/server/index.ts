import { consoleLog, createEventHandler, createExtension, createMiddleware, createProcedure } from "kizlo"
import { createKizlo } from "kizlo/nextjs/server"
import z from "zod"
import { endpoints } from "./generated"

export const { router, client, context, handler } = createKizlo({
	wordpress: { endpoints },
	adapters: { logger: consoleLog() },
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
								void context.wordpress.postTypes.post.retrieve({ identifier: "", password: "" })
								return { val: "" }
							},
						),
					},
				}
			},
		}),
	],
})
