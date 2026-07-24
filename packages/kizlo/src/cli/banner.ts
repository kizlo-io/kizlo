function colorSupported(): boolean {
	return Boolean(process.stdout.isTTY) && process.env.NO_COLOR === undefined && process.env.TERM !== "dumb"
}

/** The CLI's shared ANSI palette (empty strings when color is unsupported). */
export function palette(): { cyan: string; green: string; bold: string; dim: string; reset: string } {
	const on = colorSupported()
	return {
		cyan: on ? "\x1b[38;5;44m" : "",
		green: on ? "\x1b[32m" : "",
		bold: on ? "\x1b[1m" : "",
		dim: on ? "\x1b[2m" : "",
		reset: on ? "\x1b[0m" : "",
	}
}
