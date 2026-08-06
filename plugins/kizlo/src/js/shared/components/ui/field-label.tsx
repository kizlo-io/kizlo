import { InfoIcon } from "@phosphor-icons/react"
import { Tooltip } from "@wordpress/components"

/**
 * How a field's description is surfaced:
 * - `tooltip` (default): an info icon next to the label reveals it on hover/focus.
 * - `below`: rendered as muted text directly under the label.
 */
export type FieldDescMode = "tooltip" | "below"

export interface FieldLabelProps {
	label?: React.ReactNode
	desc?: React.ReactNode
	descMode?: FieldDescMode
}

/**
 * The WordPress `BaseControl` label typography (`baseLabelTypography`), matched
 * explicitly so labels look the same whether they are rendered inside a WordPress
 * control or standalone (breadcrumbs, custom groups, etc.).
 */
const LABEL_CLASS = "font-semibold text-[11px] uppercase leading-[1.4] text-neutral-900"

/**
 * A control label that surfaces the field's description either in an info-icon
 * tooltip or as help text below the label. Renders the bare label when there is
 * no description, so it is safe to use as the `label` prop everywhere.
 */
export function FieldLabel({ label, desc, descMode = "tooltip" }: FieldLabelProps) {
	const labelNode = <span className={LABEL_CLASS}>{label}</span>

	if (!desc) return <>{labelNode}</>

	if (descMode === "below") {
		return (
			<span className="flex flex-col gap-1">
				{labelNode}
				<span className="font-normal text-neutral-500 text-xs normal-case leading-relaxed">{desc}</span>
			</span>
		)
	}

	return (
		<span className="inline-flex items-center gap-1">
			{labelNode}
			<Tooltip
				delay={200}
				text={desc as string}
				className="max-w-xs rounded-sm border border-neutral-200 bg-white p-4 text-left text-black shadow"
				placement="bottom-start"
			>
				<button
					type="button"
					onClick={(event) => event.preventDefault()}
					className="inline-flex cursor-pointer items-center border-0 bg-transparent p-0 text-neutral-500 hover:text-neutral-800"
				>
					<InfoIcon className="size-3.5" />
				</button>
			</Tooltip>
		</span>
	)
}
