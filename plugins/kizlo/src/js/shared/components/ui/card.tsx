import {
	Card as WP_Card,
	CardBody as WP_CardBody,
	CardDivider as WP_CardDivider,
	CardFooter as WP_CardFooter,
	CardHeader as WP_CardHeader,
	CardMedia as WP_CardMedia,
} from "@wordpress/components"
import { cn } from "@/shared/lib/utils"

export type CardProps = React.ComponentProps<typeof WP_Card>

export function Card({ className, ...props }: CardProps) {
	return <WP_Card data-slot="card" className={cn("rounded-lg border-neutral-200 bg-white shadow-sm", className)} {...props} />
}

export type CardHeaderProps = React.ComponentProps<typeof WP_CardHeader>

export function CardHeader({ className, size = "medium", ...props }: CardHeaderProps) {
	return (
		<WP_CardHeader
			data-slot="card-header"
			size={size}
			className={cn(
				"grid! auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 border-neutral-200 has-data-[slot=card-action]:grid-cols-[1fr_auto]",
				className,
			)}
			{...props}
		/>
	)
}

export type CardTitleProps = React.HTMLAttributes<HTMLHeadingElement>

export function CardTitle({ className, ...props }: CardTitleProps) {
	return <h3 data-slot="card-title" className={cn("my-0 font-semibold text-neutral-900 text-sm leading-none", className)} {...props} />
}

export type CardDescriptionProps = React.HTMLAttributes<HTMLParagraphElement>

export function CardDescription({ className, ...props }: CardDescriptionProps) {
	return <p data-slot="card-description" className={cn("my-0 text-neutral-500 text-sm leading-relaxed", className)} {...props} />
}

export type CardActionProps = React.HTMLAttributes<HTMLDivElement>

export function CardAction({ className, ...props }: CardActionProps) {
	return (
		<div data-slot="card-action" className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)} {...props} />
	)
}

export type CardContentProps = React.ComponentProps<typeof WP_CardBody>

export function CardContent({ className, ...props }: CardContentProps) {
	return <WP_CardBody data-slot="card-content" className={cn(className)} {...props} />
}

export type CardFooterProps = React.ComponentProps<typeof WP_CardFooter>

export function CardFooter({ className, size = "medium", ...props }: CardFooterProps) {
	return (
		<WP_CardFooter data-slot="card-footer" size={size} className={cn("flex items-center gap-2 border-neutral-200", className)} {...props} />
	)
}

export type CardMediaProps = React.ComponentProps<typeof WP_CardMedia>

export function CardMedia({ className, ...props }: CardMediaProps) {
	return <WP_CardMedia data-slot="card-media" className={cn(className)} {...props} />
}

export type CardDividerProps = React.ComponentProps<typeof WP_CardDivider>

export function CardDivider({ className, ...props }: CardDividerProps) {
	return <WP_CardDivider data-slot="card-divider" className={cn("border-neutral-200", className)} {...props} />
}
