import { SpinnerGapIcon } from "@phosphor-icons/react"
import type { ComponentProps } from "react"
import { cn } from "@/lib/utils"

export function Spinner({ className, ...props }: ComponentProps<typeof SpinnerGapIcon>) {
	return <SpinnerGapIcon role="status" aria-label="Loading" className={cn("size-6 animate-spin", className)} {...props} />
}
