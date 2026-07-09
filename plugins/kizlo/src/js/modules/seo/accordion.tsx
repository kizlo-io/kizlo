import { CaretDownIcon, type Icon } from "@phosphor-icons/react"
import { createContext, type ReactNode, useContext, useState } from "react"
import { cn } from "@/shared/lib/utils"

export type Tone = "good" | "warn" | "bad" | "neutral"

const toneDot: Record<Exclude<Tone, "neutral">, string> = {
	good: "bg-green-500",
	warn: "bg-amber-500",
	bad: "bg-red-500",
}

interface AccordionContextValue {
	isOpen: (id: string) => boolean
	toggle: (id: string) => void
}

const AccordionContext = createContext<AccordionContextValue | null>(null)

export function Accordion({ defaultOpen = [], children }: { defaultOpen?: string[]; children: ReactNode }) {
	const [openIds, setOpenIds] = useState<Set<string>>(() => new Set(defaultOpen))

	const toggle = (id: string) =>
		setOpenIds((current) => {
			const next = new Set(current)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			return next
		})

	return (
		<div className="divide-y divide-neutral-200 overflow-hidden">
			<AccordionContext.Provider value={{ isOpen: (id) => openIds.has(id), toggle }}>{children}</AccordionContext.Provider>
		</div>
	)
}

interface AccordionRowProps {
	id: string
	icon: Icon
	label: string
	value?: string
	tone?: Tone
	children: ReactNode
}

export function AccordionRow({ id, icon: Glyph, label, value, tone = "neutral", children }: AccordionRowProps) {
	const context = useContext(AccordionContext)
	if (!context) throw new Error("AccordionRow must be used within an Accordion")

	const open = context.isOpen(id)

	return (
		<div>
			<button
				type="button"
				onClick={() => context.toggle(id)}
				aria-expanded={open}
				className="flex w-full cursor-pointer appearance-none items-center gap-3 border-0 bg-transparent px-4 py-3 text-left shadow-none outline-none transition-colors hover:bg-neutral-50"
			>
				<Glyph className="size-4 shrink-0 text-neutral-400" weight="regular" />
				<span className="font-medium text-black text-sm">{label}</span>
				<span className="ms-auto flex items-center gap-2 truncate">
					{value ? <span className="truncate text-neutral-600 text-sm">{value}</span> : null}
					{tone !== "neutral" ? <span className={cn("size-1.5 shrink-0 rounded-full", toneDot[tone])} aria-hidden /> : null}
					<CaretDownIcon className={cn("size-3.5 shrink-0 text-neutral-400 transition-transform", open && "rotate-180")} />
				</span>
			</button>

			{open ? <div className="border-neutral-300 border-t bg-neutral-50 p-4">{children}</div> : null}
		</div>
	)
}
