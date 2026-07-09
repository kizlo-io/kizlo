import { CheckCircle, CircleNotch, Info, Warning, WarningOctagon } from "@phosphor-icons/react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
	const { theme = "system" } = useTheme()

	return (
		<Sonner
			theme={theme as ToasterProps["theme"]}
			className="toaster group"
			icons={{
				success: <CheckCircle className="size-4" />,
				info: <Info className="size-4" />,
				warning: <Warning className="size-4" />,
				error: <WarningOctagon className="size-4" />,
				loading: <CircleNotch className="size-4 animate-spin" />,
			}}
			style={
				{
					"--normal-bg": "#fff",
					"--normal-text": "var(--color-neutral-900)",
					"--normal-border": "var(--color-neutral-200)",
					"--border-radius": "2px",
				} as React.CSSProperties
			}
			{...props}
		/>
	)
}

export { Toaster }
