import { ChatIcon, CheckCircleIcon, GridFourIcon, ImageIcon, ListIcon, SquaresFourIcon } from "@phosphor-icons/react"
import { useState } from "react"
import { SettingsSection } from "../settings"
import { Button } from "./button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardMedia, CardTitle } from "./card"
import { NumberInput, TextareaInput, TextInput } from "./input"
import { MediaPicker } from "./media-picker"
import { Popover } from "./popover"
import { Radio, RadioCards } from "./radio"
import { Combobox, MultiSelect, Select, type SelectOption } from "./select"
import { Tabs } from "./tabs"
import { Toggle } from "./toggle"

export function ComponentGallery() {
	const [text, setText] = useState("")
	const [notes, setNotes] = useState("")
	const [count, setCount] = useState("")
	const [enabled, setEnabled] = useState(false)
	const [role, setRole] = useState("")
	const [country, setCountry] = useState<string | null>(null)
	const [categories, setCategories] = useState<string[]>(["news"])
	const [visibility, setVisibility] = useState("public")
	const [layout, setLayout] = useState("grid")
	const [plan, setPlan] = useState("pro")

	const countries: SelectOption[] = [
		{ label: "United Kingdom", value: "gb" },
		{ label: "United States", value: "us" },
		{ label: "Germany", value: "de" },
		{ label: "France", value: "fr" },
		{ label: "Japan", value: "jp" },
		{ label: "Australia", value: "au" },
	]

	return (
		<div className="mx-auto flex max-w-3xl flex-col gap-10 p-10">
			<SettingsSection title="Button" desc="Variants, sizes, and disabled state for triggering actions.">
				<Button>
					<ChatIcon />
					<span>Save Changes</span>
				</Button>

				<Button variant="secondary">
					<ChatIcon />
					<span>Save Changes</span>
				</Button>

				<Button variant="ghost">
					<ChatIcon />
					<span>Save Changes</span>
				</Button>

				<Button variant="link">
					<ChatIcon />
					<span>Save Changes</span>
				</Button>

				<Button size="sm">
					<ChatIcon />
					<span>Small</span>
				</Button>

				<Button size="xs">
					<ChatIcon />
					<span>Extra Small</span>
				</Button>

				<Button size="xs" disabled>
					<ChatIcon />
					<span>Disabled</span>
				</Button>
			</SettingsSection>

			<SettingsSection title="Input" desc="Text, number, and multiline fields with labels and helper text.">
				<TextInput name="text-input" label="Text Input" desc="A single line of text." value={text} onChange={setText} />

				<NumberInput name="number-input" label="Number Input" desc="Numbers only." value={count} onChange={setCount} />

				<TextareaInput name="textarea-input" label="Textarea Input" desc="Multiple lines of text." value={notes} onChange={setNotes} />
			</SettingsSection>

			<SettingsSection title="Toggle" desc="On/off switches with the control at the start or end of the label.">
				<Toggle
					name="toggle-start"
					label="Switch at start"
					desc="Switch before the label."
					togglePosition="start"
					checked={enabled}
					onChange={setEnabled}
				/>

				<div className="h-1 w-full border-gray-300 border-b"></div>

				<Toggle
					name="toggle-end"
					label="Switch at end"
					desc="Default layout, switch after the label."
					checked={enabled}
					onChange={setEnabled}
				/>
			</SettingsSection>

			<SettingsSection title="Select" desc="A native dropdown and a searchable combobox for choosing from a list.">
				<Select
					name="role-select"
					label="Role"
					desc="A native dropdown with a placeholder."
					placeholder="Select a role"
					value={role}
					onChange={setRole}
					options={[
						{ label: "Administrator", value: "admin" },
						{ label: "Editor", value: "editor" },
						{ label: "Author", value: "author" },
						{ label: "Subscriber", value: "subscriber" },
					]}
				/>

				<Combobox
					name="country-combobox"
					label="Country"
					desc="Type to filter, with a reset button."
					placeholder="Search countries"
					value={country ?? undefined}
					onChange={setCountry}
					options={countries}
				/>

				<MultiSelect
					name="categories-multiselect"
					label="Categories"
					desc="Pick several. Type to filter, backspace to remove."
					placeholder="Add categories"
					value={categories}
					onChange={setCategories}
					options={[
						{ label: "News", value: "news" },
						{ label: "Tutorials", value: "tutorials" },
						{ label: "Releases", value: "releases" },
						{ label: "Case Studies", value: "case-studies" },
						{ label: "Opinion", value: "opinion" },
					]}
				/>
			</SettingsSection>

			<SettingsSection title="Radio" desc="A simple list of choices and a card-style group with hidden inputs and custom surfaces.">
				<Radio
					name="visibility-radio"
					label="Visibility"
					desc="Who can see this content."
					value={visibility}
					onChange={setVisibility}
					options={[
						{ label: "Public", value: "public" },
						{ label: "Private", value: "private" },
						{ label: "Password protected", value: "password" },
					]}
				/>

				<div className="h-1 w-full border-gray-300 border-b"></div>

				<RadioCards
					name="layout-radio-cards"
					label="Layout"
					desc="How posts are arranged in the archive."
					value={layout}
					onChange={setLayout}
					columns={3}
					options={[
						{ label: "List", value: "list", desc: "Stacked rows.", icon: ListIcon },
						{ label: "Grid", value: "grid", desc: "Even columns.", icon: GridFourIcon },
						{ label: "Masonry", value: "masonry", desc: "Packed tiles.", icon: SquaresFourIcon, disabled: true },
					]}
				/>

				<div className="h-1 w-full border-gray-300 border-b"></div>

				<RadioCards
					name="plan-radio-cards"
					label="Plan"
					desc="Cards can be fully custom via the render function."
					value={plan}
					onChange={setPlan}
					options={[
						{ label: "Starter", value: "starter", desc: "9" },
						{ label: "Pro", value: "pro", desc: "29" },
						{ label: "Business", value: "business", desc: "99" },
					]}
				>
					{(option, selected) => (
						<div className="flex items-baseline justify-between gap-3">
							<div className="flex flex-col gap-1">
								<span className="font-medium text-neutral-900 text-sm">{option.label}</span>
								<span className="text-neutral-500 text-xs">
									<span className="font-semibold text-lg text-neutral-900">${option.desc}</span> /mo
								</span>
							</div>
							{selected ? <CheckCircleIcon className="absolute top-2 right-2 size-5 text-primary" weight="fill" /> : null}
						</div>
					)}
				</RadioCards>
			</SettingsSection>

			<SettingsSection title="Popover" desc="A floating panel anchored to a trigger, for secondary content and quick actions.">
				<div className="flex flex-wrap items-start gap-4">
					<Popover
						trigger={({ onToggle, isOpen }) => (
							<Button variant="secondary" onClick={onToggle} aria-expanded={isOpen}>
								<ChatIcon />
								<span>Open popover</span>
							</Button>
						)}
					>
						<div className="flex w-64 max-w-xs flex-col gap-1 p-1">
							<span className="font-medium text-neutral-900 text-sm">Need a hand?</span>
							<span className="text-neutral-500 text-sm leading-relaxed">Popovers hold secondary content without leaving the page.</span>
						</div>
					</Popover>

					<Popover
						placement="bottom-start"
						trigger={({ onToggle, isOpen }) => (
							<Button variant="ghost" onClick={onToggle} aria-expanded={isOpen}>
								Quick edit
							</Button>
						)}
					>
						{({ onClose }) => (
							<div className="flex w-64 flex-col gap-4 p-1">
								<TextInput name="popover-name" label="Display name" value={text} onChange={setText} />
								<Button size="sm" onClick={onClose}>
									Save
								</Button>
							</div>
						)}
					</Popover>
				</div>
			</SettingsSection>

			<SettingsSection
				title="Media Picker"
				desc="Select media from the WordPress library. Images show a preview; other formats show an icon and file name."
			>
				<MediaPicker
					type="image"
					label="Site image"
					desc="This image is used as a fallback for posts/pages that don't have any images set."
				/>

				<MediaPicker type="application" label="Downloadable file" desc="Attach a PDF or document for visitors to download." />

				<MediaPicker type="video" label="Downloadable file" desc="Attach a PDF or document for visitors to download." />
			</SettingsSection>

			<SettingsSection title="Tabs" desc="Horizontal navigation that swaps the panel below on selection.">
				<div className="w-full">
					<Tabs
						tabs={[
							{ name: "discover", title: "Discover" },
							{ name: "extensions", title: "Extensions" },
							{ name: "themes", title: "Themes" },
							{ name: "business", title: "Business services" },
							{ name: "subscriptions", title: "My subscriptions" },
						]}
					>
						{(name) => <div className="pt-4 text-neutral-600 text-sm">Content for the {name} tab.</div>}
					</Tabs>
				</div>
			</SettingsSection>

			<SettingsSection
				title="Card"
				desc="A surface built from composable parts: header, title, description, action, content, media, and footer."
			>
				<Card className="w-full">
					<CardHeader>
						<CardTitle>Site identity</CardTitle>
						<CardDescription>How your site appears across the web.</CardDescription>
						<CardAction>
							<Button size="xs" variant="ghost">
								Edit
							</Button>
						</CardAction>
					</CardHeader>

					<CardContent>
						<TextInput name="card-site-name" label="Site name" value={text} onChange={setText} />
					</CardContent>

					<CardFooter className="justify-end">
						<Button size="sm" variant="secondary">
							Cancel
						</Button>
						<Button size="sm">
							<CheckCircleIcon />
							<span>Save</span>
						</Button>
					</CardFooter>
				</Card>

				<Card className="w-full">
					<CardMedia>
						<div className="flex h-32 items-center justify-center bg-neutral-100 text-neutral-400">
							<ImageIcon className="size-8" weight="thin" />
						</div>
					</CardMedia>

					<CardContent>
						<CardTitle>With media</CardTitle>
						<CardDescription>CardMedia clips its children to the card's rounded corners.</CardDescription>
					</CardContent>
				</Card>

				<Card className="w-full">
					<CardContent>
						<CardTitle>Content only</CardTitle>
						<CardDescription>A card needs nothing more than content. Header and footer are optional.</CardDescription>
					</CardContent>
				</Card>
			</SettingsSection>
		</div>
	)
}
