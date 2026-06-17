import type { WP_CommonErrorCode, WP_ErrorData } from "./types"

export class WP_Error<TCode extends string = string> extends Error {
	code: TCode | WP_CommonErrorCode

	constructor(error: WP_ErrorData<TCode>) {
		super(error.message ?? "Internal server error, please try again.")
		this.name = "WordPress Error"
		this.code = error.code
	}
}
