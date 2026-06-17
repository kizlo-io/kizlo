import { createProcedure } from "../shared/procedure"
import { GET_USER_ERROR_MAP } from "./errors"
import { User } from "./schema"
import { getKizloUserService } from "./service"
import { deserializeUser } from "./utils"

export const USER_ROUTER = {
	get: createProcedure(
		{
			scope: "api",
			method: "GET",
			path: "/user",
			errors: GET_USER_ERROR_MAP,
			output: User,
		},
		async ({ context, errors }) => {
			const identity = await context.getAuthUserIdentity()
			if (!identity) throw errors.USER_NOT_FOUND()

			const users = getKizloUserService(context.service.wordpress)
			const response = await users.get(identity)

			if (response.error) {
				switch (response.error.code) {
					case "rest_user_invalid_id":
						throw errors.USER_NOT_FOUND({ message: response.error.message })
					default:
						context.logger.error("Get user unhandled error", response.error, { identity, code: response.error.code })
						throw errors.INTERNAL_SERVER_ERROR()
				}
			}

			return deserializeUser(response.data)
		},
	),

	// update: createProcedure(
	// 	{
	// 		method: "PUT",
	// 		path: "/user",
	// 		errors: GET_USER_ERROR_MAP,
	// 		body: z.object({
	// 			//
	// 		}),
	// 	},
	// 	async ({ context, errors }) => {
	// 		const identity = await context.getAuthUserIdentity()
	// 		if (!identity) throw errors.USER_NOT_FOUND()

	// 		const users = getKizloUserService(context.service.wordpress)

	// 		const response = await users.update(identity, {
	// 			email: "",
	// 			first_name: "",
	// 			last_name: "",
	// 			password: "",
	// 		})
	// 		if (response.error) throw errors.USER_NOT_FOUND()

	// 		//

	// 		return deserializeUser(response.data)
	// 	},
	// ),
}
