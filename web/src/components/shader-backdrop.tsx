"use client"

import { GrainGradient } from "@paper-design/shaders-react"
import { cn } from "@/lib/utils"

export function ShaderBackdrop({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
	return (
		<div aria-hidden className={cn("pointer-events-none absolute inset-0 -z-10 overflow-hidden", className)}>
			<GrainGradient
				className="absolute inset-0 size-full"
				colors={["#0066ff"]}
				colorBack="#000000"
				softness={0.5}
				intensity={0.5}
				noise={0.25}
				shape="corners"
				speed={1}
			/>
		</div>
	)
}
