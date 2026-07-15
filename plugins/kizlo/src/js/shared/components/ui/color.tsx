import { PaintBucketIcon } from "@phosphor-icons/react"
import { BaseControl, ColorPicker, Dropdown } from "@wordpress/components"
import { cn } from "@/shared/lib/utils"
import { type BaseInputProps, TextInput } from "./input"

export interface ColorInputProps extends Omit<React.HTMLAttributes<HTMLInputElement>, "onChange">, BaseInputProps {}

export function ColorInput({ ...props }: ColorInputProps) {
	const color = props.value ?? ""

	return (
		<BaseControl id={`${props.name}-color-input`} label={props.label} help={props.desc as React.ComponentProps<typeof BaseControl>["help"]}>
			<div className="flex items-center gap-4">
				<Dropdown
					className={cn("block", props.className)}
					popoverProps={{ placement: "bottom-start" }}
					renderToggle={({ isOpen, onToggle }) => (
						<div
							role="button"
							tabIndex={0}
							onClick={onToggle}
							data-open={isOpen}
							className={cn(
								"relative flex size-16 shrink-0 cursor-pointer select-none flex-col items-center justify-center overflow-clip rounded-lg border border-dashed bg-transparent p-1 text-center hover:border-primary data-[open=true]:border-primary data-[open=true]:border-solid",
							)}
						>
							<div style={{ backgroundColor: color }} className="flex h-full w-full items-center justify-center rounded-md">
								{!color.length && <PaintBucketIcon className="size-6 text-neutral-400" weight="thin" />}
							</div>
						</div>
					)}
					renderContent={() => <ColorPicker color={color} onChange={(next) => props.onChange?.(next)} enableAlpha={false} />}
				/>

				<TextInput name={props.name} value={color} onChange={(val) => props.onChange?.(val)} />
			</div>
		</BaseControl>
	)
}
