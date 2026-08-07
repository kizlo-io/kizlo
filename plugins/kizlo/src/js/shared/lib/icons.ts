import {
	AddressBookIcon,
	ArticleIcon,
	BarcodeIcon,
	BrowserIcon,
	BuildingsIcon,
	CircleIcon,
	DeviceMobileIcon,
	EyeIcon,
	FileArrowUpIcon,
	FileIcon,
	FileTextIcon,
	FolderIcon,
	GearSixIcon,
	GlobeIcon,
	HashIcon,
	type Icon,
	IdentificationBadgeIcon,
	IdentificationCardIcon,
	ImageIcon,
	ImageSquareIcon,
	InfoIcon,
	LightningIcon,
	LinkIcon,
	MagnifyingGlassIcon,
	MapTrifoldIcon,
	NotePencilIcon,
	PaletteIcon,
	PenNibIcon,
	PowerIcon,
	RobotIcon,
	ScrollIcon,
	ShareNetworkIcon,
	ShieldCheckIcon,
	ShieldIcon,
	SignpostIcon,
	SquaresFourIcon,
	SwatchesIcon,
	TagIcon,
	TextAaIcon,
	TrashIcon,
	UploadSimpleIcon,
	UserCircleIcon,
	UserIcon,
	UsersIcon,
	WebhooksLogoIcon,
} from "@phosphor-icons/react"

/**
 * Icon registry for the served navigation. PHP (SettingsNav) emits icon NAMES;
 * this map is the single place the client resolves them to components. Every
 * name the nav can emit must have an entry here — the dev-time assertion in
 * shared/lib/nav.ts warns on any served name that is missing.
 */
const ICONS: Record<string, Icon> = {
	"address-book": AddressBookIcon,
	article: ArticleIcon,
	barcode: BarcodeIcon,
	browser: BrowserIcon,
	buildings: BuildingsIcon,
	"device-mobile": DeviceMobileIcon,
	eye: EyeIcon,
	"file-arrow-up": FileArrowUpIcon,
	file: FileIcon,
	"file-text": FileTextIcon,
	folder: FolderIcon,
	"gear-six": GearSixIcon,
	globe: GlobeIcon,
	hash: HashIcon,
	"identification-badge": IdentificationBadgeIcon,
	"identification-card": IdentificationCardIcon,
	image: ImageIcon,
	"image-square": ImageSquareIcon,
	info: InfoIcon,
	lightning: LightningIcon,
	link: LinkIcon,
	"magnifying-glass": MagnifyingGlassIcon,
	"map-trifold": MapTrifoldIcon,
	"note-pencil": NotePencilIcon,
	palette: PaletteIcon,
	"pen-nib": PenNibIcon,
	power: PowerIcon,
	robot: RobotIcon,
	scroll: ScrollIcon,
	"share-network": ShareNetworkIcon,
	shield: ShieldIcon,
	"shield-check": ShieldCheckIcon,
	signpost: SignpostIcon,
	"squares-four": SquaresFourIcon,
	swatches: SwatchesIcon,
	tag: TagIcon,
	"text-aa": TextAaIcon,
	trash: TrashIcon,
	"upload-simple": UploadSimpleIcon,
	user: UserIcon,
	"user-circle": UserCircleIcon,
	users: UsersIcon,
	"webhooks-logo": WebhooksLogoIcon,
}

/** Fallback for an unknown name, so a drift never renders nothing. */
const FALLBACK_ICON: Icon = CircleIcon

/** Whether an icon name resolves to a real component. */
export function hasIcon(name: string): boolean {
	return name in ICONS
}

/** Resolve an icon name to its component, warning + falling back on drift. */
export function resolveIcon(name: string): Icon {
	const icon = ICONS[name]
	if (!icon) {
		console.warn(`[kizlo] Unknown nav icon "${name}" — falling back.`)
		return FALLBACK_ICON
	}
	return icon
}
