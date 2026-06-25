import { Slot } from "radix-ui"
import { cn } from "@/shared/lib/utils"
import { Spinner } from "./spinner"

function Loading({ isLoading = false, ...props }: { isLoading?: boolean } & React.HTMLAttributes<HTMLElement>) {
	return (
		<>
			{isLoading ? <Spinner className="absolute left-1/2 -translate-x-1/2" /> : null}

			<Slot.Root
				className={cn({ invisible: isLoading })}
				children={
					// biome-ignore lint/complexity/noUselessFragments: Its acceptable.
					Array.isArray(props.children) ? isLoading ? <span>{props.children}</span> : <>{props.children}</> : <span>{props.children}</span>
				}
			/>
		</>
	)
}

export { Loading }
