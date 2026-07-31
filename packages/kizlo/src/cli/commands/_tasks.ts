import { styleText } from "node:util"
import * as p from "@clack/prompts"
import { isCI, isTTY, S_BAR, S_RADIO_INACTIVE, S_STEP_ERROR, S_STEP_SUBMIT, unicode } from "@clack/prompts"
import { orCancel } from "./_setup"

export const FINAL_CONFIRMATION_TEXT = "Continue with these choices?"

/**
 * A failed checklist step. Throwing this from a step's `run` renders the step with an error mark (never a
 * checkmark) and prints its optional `detail` (captured command output, a stack) below the block. `fatal`
 * (the default) also stops the run — no later step executes. A step that failed but the setup can recover
 * from (an install or git init that didn't complete) throws with `fatal: false`: it still shows the error
 * mark, but the run carries on to the remaining steps.
 */
export class StepError extends Error {
	readonly detail?: string
	readonly fatal: boolean
	constructor(message: string, opts: { detail?: string; fatal?: boolean } = {}) {
		super(message)
		this.name = "StepError"
		this.detail = opts.detail
		this.fatal = opts.fatal ?? true
	}
}

/**
 * One line of the execute checklist: a spinner while `run` works, then a checkmark with its returned
 * message. `run` receives a `message` updater to relabel the live line mid-step. A step whose `enabled`
 * is `false` is skipped outright — no line is drawn — which is how conditional work (install only when
 * asked, git only when offered) stays out of the list.
 */
export interface ChecklistStep {
	title: string
	enabled?: boolean
	run: (message: (text: string) => void) => string | Promise<string>
}

type StepState = "pending" | "active" | "done" | "error"

/** The animated in-progress frames and cadence, matching clack's own spinner. */
const FRAMES = unicode ? ["◒", "◐", "◓", "◑"] : ["•", "o", "O", "0"]
const FRAME_MS = unicode ? 80 : 120

/** A checkmark for completed steps, in place of clack's `◇`; falls back to clack's `o` where unicode isn't supported. */
const S_DONE = unicode ? "✓" : S_STEP_SUBMIT

/** One checklist line: a state marker, two spaces, then the label (truncated to keep it a single row). */
function renderLine(state: StepState, label: string, frame: string, columns: number): string {
	const budget = Math.max(1, columns - 3)
	const text = label.length > budget ? `${label.slice(0, budget - 1)}…` : label
	switch (state) {
		case "done":
			return `${styleText("green", S_DONE)}  ${text}`
		case "error":
			return `${styleText("red", S_STEP_ERROR)}  ${text}`
		case "active":
			return `${styleText("magenta", frame)}  ${text}`
		default:
			return styleText("dim", `${S_RADIO_INACTIVE}  ${text}`)
	}
}

/**
 * Run the enabled steps as a single live checklist. The whole list is drawn up front — every step visible
 * at once — and repainted in place as work moves down it: a pending marker becomes an animated loader
 * while a step runs, then a checkmark with the step's completion message. A step that throws is fatal: it
 * gets an error mark, the rest stay pending, its {@link StepError} detail is printed below, and the run
 * stops. Returns whether it aborted, so the caller can exit without printing a "ready" outro over a
 * failed setup. Falls back to committing one line per step (no animation) when stdout isn't an
 * interactive TTY, so piped or CI output stays readable.
 */
export async function runChecklist(input: ChecklistStep[]): Promise<boolean> {
	const steps = input.filter((step) => step.enabled !== false).map((step) => ({ step, state: "pending" as StepState, label: step.title }))
	if (steps.length === 0) return false

	const out = process.stdout
	// A bar line separating the block from whatever preceded it (the confirm's `│ Yes`), keeping the
	// clack rail continuous. Written once and left above the redrawn block, so repaints never touch it.
	out.write(`${styleText("gray", S_BAR)}\n`)
	if (!isTTY(out) || isCI()) {
		const details: string[] = []
		let aborted = false
		for (const item of steps) {
			try {
				const done = await item.step.run(() => {})
				out.write(`${styleText("green", S_DONE)}  ${done.length > 0 ? done : item.step.title}\n`)
			} catch (error) {
				out.write(`${styleText("red", S_STEP_ERROR)}  ${error instanceof Error ? error.message : String(error)}\n`)
				if (error instanceof StepError && error.detail) details.push(error.detail)
				if (!(error instanceof StepError) || error.fatal) {
					aborted = true
					break
				}
			}
		}
		for (const detail of details) p.log.error(detail)
		return aborted
	}

	const columns = out.columns || 80
	let frame = 0
	const draw = (first: boolean): void => {
		if (!first) {
			out.moveCursor(0, -steps.length)
			out.cursorTo(0)
			out.clearScreenDown()
		}
		out.write(`${steps.map((item) => renderLine(item.state, item.label, FRAMES[frame % FRAMES.length] ?? "", columns)).join("\n")}\n`)
	}

	out.write("\x1B[?25l") // hide the cursor while the block animates
	draw(true)
	const timer = setInterval(() => {
		frame++
		draw(false)
	}, FRAME_MS)

	const details: string[] = []
	let aborted = false
	try {
		for (const item of steps) {
			item.state = "active"
			draw(false)
			try {
				const done = await item.step.run((text) => {
					item.label = text
				})
				item.label = done.length > 0 ? done : item.step.title
				item.state = "done"
				draw(false)
			} catch (error) {
				item.label = error instanceof Error ? error.message : String(error)
				item.state = "error"
				draw(false)
				if (error instanceof StepError && error.detail) details.push(error.detail)
				// Fatal (the default, and any non-StepError throw) stops the run; a non-fatal step failure
				// shows its error mark but lets the remaining steps carry on.
				if (!(error instanceof StepError) || error.fatal) {
					aborted = true
					break
				}
			}
		}
	} finally {
		clearInterval(timer)
		out.write("\x1B[?25h") // restore the cursor
	}

	for (const detail of details) p.log.error(detail)
	return aborted
}

/**
 * The "here's everything you chose" note shown after collecting inputs and before running any step —
 * the heart of the lazy flow: nothing has happened yet, and the user reviews the whole plan at once.
 * Labels are padded to a common width so the values line up in a column.
 */
export function summaryNote(rows: readonly [string, string][], title = "Review your choices"): void {
	const width = Math.max(...rows.map(([label]) => label.length))
	const body = rows.map(([label, value]) => `${`${label}:`.padEnd(width + 1)}   ${value}`).join("\n")
	p.note(body, title)
}

/** Ask the single go/no-go question that gates the execute phase. Cancelling exits cleanly. */
export async function confirmProceed(message: string): Promise<boolean> {
	return orCancel(await p.confirm({ message, initialValue: true }))
}
