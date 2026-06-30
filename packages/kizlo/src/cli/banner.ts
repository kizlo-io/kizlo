const KIZLO_CLI_WORD_MARK = [
	"██╗  ██╗██╗███████╗██╗      ██████╗ ",
	"██║ ██╔╝██║╚══███╔╝██║     ██╔═══██╗",
	"█████╔╝ ██║  ███╔╝ ██║     ██║   ██║",
	"██╔═██╗ ██║ ███╔╝  ██║     ██║   ██║",
	"██║  ██╗██║███████╗███████╗╚██████╔╝",
	"╚═╝  ╚═╝╚═╝╚══════╝╚══════╝ ╚═════╝ ",
]

const KIZLO_TAGLINE = "Headless WordPress toolkit for TypeScript"

export function colorSupported(): boolean {
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

export function printBanner(version: string): void {
	const color = colorSupported()
	const cyan = color ? "\x1b[38;5;44m" : ""
	const bold = color ? "\x1b[1m" : ""
	const dim = color ? "\x1b[2m" : ""
	const reset = color ? "\x1b[0m" : ""

	const art = KIZLO_CLI_WORD_MARK.map((line) => `${cyan}${line}${reset}`).join("\n")
	process.stdout.write(`\n${art}\n\n`)
	process.stdout.write(`${dim}${KIZLO_TAGLINE}${reset}  ${bold}v${version}${reset}\n\n`)
}
