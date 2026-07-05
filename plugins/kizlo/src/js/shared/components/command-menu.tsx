import { useStore } from "@nanostores/react"
import { MagnifyingGlassIcon } from "@phosphor-icons/react"
import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, Kbd } from "@/shared/components/ui/command"
import { useNav } from "@/shared/lib/settings"
import { $search } from "@/shared/lib/store"
import { cn } from "@/shared/lib/utils"

function isTypingTarget(target: EventTarget | null) {
	const el = target as HTMLElement | null
	if (!el) return false
	return el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT"
}

export function CommandMenu() {
	const open = useStore($search)
	const sections = useNav()
	const navigate = useNavigate()

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "f" && event.key !== "F") return
			if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return
			event.preventDefault()
			$search.set(true)
		}

		document.addEventListener("keydown", onKeyDown)
		return () => document.removeEventListener("keydown", onKeyDown)
	}, [])

	const go = (path: string) => {
		$search.set(false)
		navigate(path)
	}

	return (
		<CommandDialog open={open} onOpenChange={(next) => $search.set(next)}>
			<CommandInput placeholder="Search settings..." />
			<CommandList>
				<CommandEmpty>No results found.</CommandEmpty>

				{sections.map((section) => (
					<CommandGroup key={section.label} heading={section.label}>
						{section.items.flatMap((node) =>
							node.type === "link" ? (
								<CommandItem key={node.path} value={node.name} onSelect={() => go(node.path)}>
									<node.icon />
									{node.name}
								</CommandItem>
							) : (
								node.items.map((item) => (
									<CommandItem key={item.path} value={`${node.name} ${item.name}`} onSelect={() => go(item.path)}>
										<item.icon />
										{item.name}
									</CommandItem>
								))
							),
						)}
					</CommandGroup>
				))}
			</CommandList>
		</CommandDialog>
	)
}

export function CommandTrigger({ className }: { className?: string }) {
	return (
		<button
			type="button"
			aria-label="Search settings"
			onClick={() => $search.set(true)}
			className={cn(
				"flex h-10 w-full cursor-pointer appearance-none items-center gap-2 rounded-md border border-neutral-200 bg-white pr-1.5 pl-2.5 text-neutral-500 text-sm transition-colors hover:border-neutral-300 hover:text-neutral-700",
				className,
			)}
		>
			<MagnifyingGlassIcon className="size-4 shrink-0" />
			<span className="flex-1 truncate text-left">Search settings...</span>
			<Kbd>F</Kbd>
		</button>
	)
}
