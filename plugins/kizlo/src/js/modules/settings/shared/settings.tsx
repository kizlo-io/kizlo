import type React from "react"
import type { ReactNode } from "react"
import { Button } from "@/shared/ui/button"
import { Field, FieldDescription, FieldLegend, FieldSet } from "@/shared/ui/field"
import { Loading } from "@/shared/ui/loading"

export function SettingsSet({
	isLoading,
	discard,
	...props
}: { isLoading: boolean; discard?: () => void } & React.HTMLAttributes<HTMLElement>) {
	return (
		<>
			<div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 p-4 pb-20 md:px-6 md:pt-10">{props.children}</div>

			<Field orientation="horizontal" className="sticky inset-x-0 bottom-0 z-9999 flex w-full justify-end border-t bg-card p-4">
				<Button size={"sm"} type="submit">
					<Loading isLoading={isLoading}>Update</Loading>
				</Button>

				{/* <Button size={"sm"} type="button" variant="outline" onClick={() => discard?.()}>
					Discard
				</Button> */}
			</Field>
		</>
	)
}

export function SettingsGroup({ ...props }: { heading: ReactNode; description: ReactNode } & React.HTMLAttributes<HTMLElement>) {
	return (
		<FieldSet>
			<div className="mb-2">
				<FieldLegend>{props.heading}</FieldLegend>
				<FieldDescription>{props.description}</FieldDescription>
			</div>

			{props.children}
		</FieldSet>
	)
}
