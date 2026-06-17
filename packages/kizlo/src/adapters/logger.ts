import type { LiteralUnion } from "@kizlo/shared"

export type LogLevel = "debug" | "info" | "warn" | "error"

export type Environment = LiteralUnion<"development" | "production" | "test", string>

export interface LogPayload {
	level: LogLevel
	message: string
	timestamp: Date
	context?: Record<string, unknown>
	error?: Error
}

export type LoggerAdapter = (payload: LogPayload) => void | Promise<void>

export interface Logger {
	debug(message: string, context?: Record<string, unknown>): void
	info(message: string, context?: Record<string, unknown>): void
	warn(message: string, context?: Record<string, unknown>): void
	error(message: string, error?: Error, context?: Record<string, unknown>): void
	child(context: Record<string, unknown>): Logger
}

export interface ConsoleLogAdapterOptions {
	/**
	 * Which levels to log. `true` means all, an array means only those.
	 * Default: all levels.
	 */
	levels?: boolean | LogLevel[]
}

export function consoleLog(opts: ConsoleLogAdapterOptions = {}): LoggerAdapter {
	const levelsOpt = opts.levels ?? true
	const allowed: Set<LogLevel> | null = levelsOpt === true ? null : new Set(levelsOpt === false ? [] : levelsOpt)

	return (payload) => {
		if (allowed && !allowed.has(payload.level)) return

		const { level, message, timestamp, context, error } = payload
		const prefix = `[${timestamp.toISOString()}] [${level.toUpperCase()}]`
		const args: unknown[] = [prefix, message]
		if (context) args.push(context)
		if (error) args.push(error)

		switch (level) {
			case "debug":
				console.debug(...args)
				break
			case "info":
				console.info(...args)
				break
			case "warn":
				console.warn(...args)
				break
			case "error":
				console.error(...args)
				break
		}
	}
}

export const noopAdapter: LoggerAdapter = () => {}
