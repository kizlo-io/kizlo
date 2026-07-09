import { TabPanel } from "@wordpress/components"
import { cn } from "@/shared/lib/utils"

export interface TabItem {
	name: string
	title: string
	disabled?: boolean
}

export interface TabsProps {
	tabs: TabItem[]
	initialTab?: string
	onChange?: (name: string) => void
	children?: (name: string) => React.ReactNode
	className?: string
}

export function Tabs({ tabs, initialTab, onChange, children, className }: TabsProps) {
	return (
		<TabPanel tabs={tabs} initialTabName={initialTab} onSelect={(name) => onChange?.(name)} className={cn("", className)}>
			{(tab) => <>{children?.(tab.name)}</>}
		</TabPanel>
	)
}
