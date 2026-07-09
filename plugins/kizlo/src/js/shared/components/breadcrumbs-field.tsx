import { ArrowDownIcon, ArrowUpIcon, PlusIcon, XIcon } from "@phosphor-icons/react"
import { type Control, Controller, type FieldPath, type FieldValues } from "react-hook-form"
import { usePages } from "@/shared/hooks/use-pages"
import { Button } from "./ui/button"
import { Combobox } from "./ui/select"

// Reserved row that expands to the item's real ancestors. Mirrors
// SeoBase::BREADCRUMB_PARENT_TOKEN on the PHP side.
export const BREADCRUMB_PARENT_TOKEN = "__parent__"

// Set apart from page titles so it reads as a dynamic slot, not a real page.
const PARENT_OPTION_LABEL = "↳  Parent — dynamic (its real ancestors)"

interface BreadcrumbsFieldProps<TFieldValues extends FieldValues = FieldValues, TContext = any, TTransformedValues = TFieldValues> {
	control: Control<TFieldValues, TContext, TTransformedValues>
	name: FieldPath<TFieldValues>
	label?: string
	description?: React.ReactNode
}

/**
 * Ordered breadcrumb-middle editor. The trail is always Home → [these rows] →
 * current; each row is either a WordPress page or the dynamic Parent slot, and
 * rows can be reordered so the parent lands exactly where the user wants.
 */
export function BreadcrumbsField<TFieldValues extends FieldValues = FieldValues, TContext = any, TTransformedValues = TFieldValues>({
	control,
	name,
	label,
	description,
}: BreadcrumbsFieldProps<TFieldValues, TContext, TTransformedValues>) {
	const pages = usePages()

	const options = [
		{ value: BREADCRUMB_PARENT_TOKEN, label: PARENT_OPTION_LABEL },
		...pages.map((page) => ({ value: String(page.id), label: page.title })),
	]

	return (
		<Controller
			name={name}
			control={control}
			render={({ field }) => {
				const rows = (field.value as string[] | undefined) ?? []
				const commit = (next: string[]) => field.onChange(next)

				const move = (index: number, delta: number) => {
					const target = index + delta
					if (target < 0 || target >= rows.length) return
					const next = [...rows]
					const [moved] = next.splice(index, 1)
					if (moved === undefined) return
					next.splice(target, 0, moved)
					commit(next)
				}

				return (
					<div className="flex flex-col gap-3">
						{(label || description) && (
							<div className="flex flex-col gap-1">
								{label && <span className="font-medium text-neutral-900 text-sm">{label}</span>}
								{description && <p className="my-0 text-neutral-500 text-sm leading-relaxed">{description}</p>}
							</div>
						)}

						<div className="flex flex-col gap-2">
							{rows.map((row, index) => (
								<div key={`${index}-${row}`} className="flex items-center gap-2">
									<div className="min-w-0 flex-1">
										<Combobox
											name={`${name}.${index}`}
											options={options}
											allowReset={false}
											placeholder="Select a page or Parent"
											value={row}
											onChange={(value) => commit(rows.map((r, i) => (i === index ? (value ?? "") : r)))}
										/>
									</div>
									<Button
										type="button"
										variant="secondary"
										size="sm"
										onClick={() => move(index, -1)}
										disabled={index === 0}
										aria-label="Move up"
									>
										<ArrowUpIcon />
									</Button>
									<Button
										type="button"
										variant="secondary"
										size="sm"
										onClick={() => move(index, 1)}
										disabled={index === rows.length - 1}
										aria-label="Move down"
									>
										<ArrowDownIcon />
									</Button>
									<Button
										type="button"
										variant="secondary"
										size="sm"
										onClick={() => commit(rows.filter((_, i) => i !== index))}
										aria-label="Remove crumb"
									>
										<XIcon />
									</Button>
								</div>
							))}

							<Button type="button" variant="secondary" size="sm" onClick={() => commit([...rows, BREADCRUMB_PARENT_TOKEN])}>
								<PlusIcon />
								Add crumb
							</Button>
						</div>
					</div>
				)
			}}
		/>
	)
}
