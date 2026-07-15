import { BaseControl, Button, ColorIndicator, ColorPicker, Dropdown } from "@wordpress/components"
import { cn } from "@/shared/lib/utils"
import type { BaseInputProps } from "./input"

export interface ColorInputProps extends BaseInputProps {
	className?: string
}

export function ColorInput({ name, value, onChange, label, desc, placeholder, className }: ColorInputProps) {
	const color = value ?? ""

	return (
		<BaseControl id={`${name}-color-input`} label={label} help={desc as React.ComponentProps<typeof BaseControl>["help"]}>
			<div>
				<Dropdown
					className={cn("block", className)}
					popoverProps={{ placement: "bottom-start" }}
					renderToggle={({ isOpen, onToggle }) => (
						<Button
							variant="secondary"
							onClick={onToggle}
							aria-expanded={isOpen}
							__next40pxDefaultSize
							className="flex w-full items-center justify-start gap-2"
						>
							<ColorIndicator colorValue={color || "#ffffff"} />
							<span>{color || placeholder || "Select color"}</span>
						</Button>
					)}
					renderContent={() => <ColorPicker color={color} onChange={(next) => onChange?.(next)} enableAlpha={false} />}
				/>
			</div>
		</BaseControl>
	)
}
