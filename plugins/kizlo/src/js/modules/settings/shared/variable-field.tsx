import { Controller, type FieldValues } from "react-hook-form"
import type { Variable } from "@/shared/lib/schema"
import { useSettings } from "@/shared/lib/settings"
import { cn } from "@/shared/lib/utils"
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/shared/ui/field"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupTextarea } from "@/shared/ui/input-group"
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover"
import { type BaseFieldProps, VariableBadge } from "./fields"

interface VariableFieldProps<TFieldValues extends FieldValues = FieldValues, TContext = any, TTransformedValues = TFieldValues>
	extends BaseFieldProps<TFieldValues, TContext, TTransformedValues> {
	variables: Variable[]
	placeholder?: string
	variant?: "url" | "text" | "textarea"
}

export function VariableField<TFieldValues extends FieldValues = FieldValues, TContext = any, TTransformedValues = TFieldValues>({
	control,
	name,
	label,
	description,
	variables,
	placeholder,
	variant = "url",
}: VariableFieldProps<TFieldValues, TContext, TTransformedValues>) {
	const { settings } = useSettings()
	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState }) => (
				<Field data-invalid={fieldState.invalid}>
					<FieldContent>
						<FieldLabel htmlFor={name}>{label}</FieldLabel>
						{description && <FieldDescription>{description}</FieldDescription>}
					</FieldContent>

					<InputGroup className="gap-2">
						{variant !== "textarea" ? (
							<InputGroupInput {...field} id={name} type="text" placeholder={placeholder} aria-invalid={fieldState.invalid} />
						) : (
							<InputGroupTextarea
								{...field}
								id={name}
								onChange={field.onChange}
								placeholder={placeholder}
								aria-invalid={fieldState.invalid}
								value={field.value.replace(/\n/g, "")}
							/>
						)}

						<InputGroupAddon
							align={variant === "url" ? "block-start" : variant === "text" ? "inline-end" : "block-end"}
							className={cn("flex items-center justify-between", variant === "url" && "border-b")}
						>
							{variant === "url" ? (
								<p className="mt-0.5 font-mono text-xs">{settings?.site.url}</p>
							) : variant === "textarea" ? (
								<div>Count: {field.value?.length ?? 0}</div>
							) : null}

							<Popover>
								<PopoverTrigger className="group">
									<InputGroupButton
										size={"icon-xs"}
										className="ml-auto text-xs group-aria-expanded:bg-accent group-aria-expanded:text-foreground"
									>
										<span className="mb-0.5">{`{{}}`}</span>
									</InputGroupButton>
								</PopoverTrigger>

								<PopoverContent align="center" className="max-w-80" onOpenAutoFocus={(e) => e.preventDefault()}>
									<div className="flex flex-wrap gap-1.5">
										{variables.map((token) => (
											<VariableBadge key={token.value} {...token} />
										))}
									</div>
								</PopoverContent>
							</Popover>
						</InputGroupAddon>
					</InputGroup>

					{fieldState.invalid && <FieldError errors={[fieldState.error]} />}
				</Field>
			)}
		/>
	)
}
