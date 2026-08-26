import { createEventHandler, createIntegration, createKizlo, createMiddleware, createProcedure } from "kizlo"
import { nextjs } from "kizlo/nextjs/server"
import z from "zod"
import { endpoints } from "./generated"

export const { procedures, client, context, handler } = createKizlo({
	wordpress: { endpoints },
	logging: "debug",
	integrations: [
		nextjs(),
		createIntegration({
			id: "test",
			events: [
				createEventHandler((e, c) => {
					console.log(e)
				}),
			],
			procedures: {
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
		}),
	],
})
