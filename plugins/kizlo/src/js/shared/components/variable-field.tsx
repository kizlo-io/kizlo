import { CheckIcon } from "@phosphor-icons/react"
import { Controller, type FieldValues } from "react-hook-form"
import { toast } from "sonner"
import { useClipboard } from "@/shared/hooks/use-clipboard"
import type { Variable } from "@/shared/lib/schema"
import { cn } from "@/shared/lib/utils"
import { type BaseFieldProps, FieldError } from "./fields"
import { TextareaInput, TextInput } from "./ui/input"

interface VariableFieldProps<TFieldValues extends FieldValues = FieldValues, TContext = any, TTransformedValues = TFieldValues>
	extends BaseFieldProps<TFieldValues, TContext, TTransformedValues> {
	variables: Variable[]
	placeholder?: string
	variant?: "text" | "textarea"
}

// A text/textarea input paired with the template variables it accepts. The
// variables render as clickable <code> chips inside the field's description;
// clicking one copies its token so it can be pasted into the field.
export function VariableField<TFieldValues extends FieldValues = FieldValues, TContext = any, TTransformedValues = TFieldValues>({
	control,
	name,
	label,
	description,
	variables,
	placeholder,
	variant = "text",
}: VariableFieldProps<TFieldValues, TContext, TTransformedValues>) {
	const desc =
		description || variables.length > 0 ? (
			<span className="flex flex-col gap-1.5">
				{description ? <span>{description}</span> : null}
				{variables.length > 0 ? (
					<span className="flex flex-wrap gap-1">
						{variables.map((token) => (
							<VariableCode key={token.value} {...token} />
						))}
					</span>
				) : null}
			</span>
		) : undefined

	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState }) => (
				<div>
					{variant === "textarea" ? (
						<TextareaInput
							name={name}
							label={label}
							desc={desc}
							placeholder={placeholder}
							value={field.value ?? ""}
							onChange={(value) => field.onChange(value.replace(/\n/g, ""))}
						/>
					) : (
						<TextInput
							name={name}
							label={label}
							desc={desc}
							placeholder={placeholder}
							value={field.value ?? ""}
							onChange={field.onChange}
						/>
					)}
					<FieldError message={fieldState.error?.message} />
				</div>
			)}
		/>
	)
}

// A copyable <code> chip for a template variable (e.g. {{title}}). Clicking it
// copies the token and briefly swaps in a check mark.
function VariableCode({ value, description }: Variable) {
	const { copy, copied } = useClipboard({
		cb() {
			toast.success(`${value} copied to clipboard.`)
		},
	})

	return (
		<code
			title={description}
			onClick={() => copy(value)}
			className={cn(
				"inline-flex cursor-pointer items-center gap-1 rounded border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 font-mono text-neutral-600 text-xs transition-colors hover:border-primary hover:text-neutral-900",
				copied && "border-primary text-neutral-900",
			)}
		>
			{value}
			{copied ? <CheckIcon className="size-3" /> : null}
		</code>
	)
}
