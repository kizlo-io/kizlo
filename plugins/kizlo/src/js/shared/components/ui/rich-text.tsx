import { type Icon, LinkIcon, ListBulletsIcon, ListNumbersIcon, TextBIcon, TextItalicIcon, TextUnderlineIcon } from "@phosphor-icons/react"
import { BaseControl } from "@wordpress/components"
import { useEffect, useRef } from "react"
import { cn } from "@/shared/lib/utils"
import { type FieldDescMode, FieldLabel } from "./field-label"

export interface RichTextInputProps {
	name: string
	label?: string
	desc?: React.ReactNode
	descMode?: FieldDescMode
	placeholder?: string
	value?: string
	onChange?: (html: string) => void
}

interface ToolbarButton {
	label: string
	icon: Icon
	command: string
	value?: string
}

const TOOLBAR: ToolbarButton[] = [
	{ label: "Bold", icon: TextBIcon, command: "bold" },
	{ label: "Italic", icon: TextItalicIcon, command: "italic" },
	{ label: "Underline", icon: TextUnderlineIcon, command: "underline" },
	{ label: "Bulleted list", icon: ListBulletsIcon, command: "insertUnorderedList" },
	{ label: "Numbered list", icon: ListNumbersIcon, command: "insertOrderedList" },
]

/**
 * Minimal HTML rich-text editor: a contentEditable surface with a small formatting
 * toolbar. The value is set once on mount (contentEditable is uncontrolled to keep
 * the caret stable) and emitted as an HTML string on every edit; the server
 * sanitizes it with wp_kses_post on save.
 */
export function RichTextInput({ name, label, desc, descMode, placeholder, value, onChange }: RichTextInputProps) {
	const ref = useRef<HTMLDivElement>(null)
	const id = `${name}-richtext-input`

	// Sync external value only when it diverges from the DOM (e.g. form reset),
	// so ordinary typing never rewrites the node and jumps the caret.
	useEffect(() => {
		const el = ref.current
		if (el && (value ?? "") !== el.innerHTML) {
			el.innerHTML = value ?? ""
		}
	}, [value])

	const exec = (command: string, arg?: string) => {
		ref.current?.focus()
		document.execCommand(command, false, arg)
		onChange?.(ref.current?.innerHTML ?? "")
	}

	const onLink = () => {
		const url = window.prompt("Link URL")
		if (url) exec("createLink", url)
	}

	return (
		<BaseControl id={id} label={<FieldLabel label={label} desc={desc} descMode={descMode} />}>
			<div className="has-focus-visible:wp-ring wp-field overflow-hidden has-focus-visible:border-primary">
				<div className="flex items-center gap-0.5 border-neutral-200 border-b bg-neutral-50 p-1">
					{TOOLBAR.map((button) => (
						<ToolbarIconButton
							key={button.command}
							label={button.label}
							icon={button.icon}
							onClick={() => exec(button.command, button.value)}
						/>
					))}
					<ToolbarIconButton label="Link" icon={LinkIcon} onClick={onLink} />
				</div>

				<div
					id={id}
					ref={ref}
					role="textbox"
					tabIndex={0}
					aria-multiline="true"
					aria-label={label}
					contentEditable
					suppressContentEditableWarning
					data-placeholder={placeholder}
					onInput={(event) => onChange?.((event.target as HTMLDivElement).innerHTML)}
					className={cn(
						"min-h-24 px-3 py-2 text-sm outline-none",
						"[&_a]:text-primary [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5",
						"empty:before:text-neutral-400 empty:before:content-[attr(data-placeholder)]",
					)}
				/>
			</div>
		</BaseControl>
	)
}

function ToolbarIconButton({ label, icon: Icon, onClick }: { label: string; icon: Icon; onClick: () => void }) {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			// Keep the selection in the editor when a toolbar button is pressed.
			onMouseDown={(event) => event.preventDefault()}
			onClick={onClick}
			className="flex size-7 cursor-pointer items-center justify-center rounded border-0 bg-transparent p-0 text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900"
		>
			<Icon className="size-4" />
		</button>
	)
}
