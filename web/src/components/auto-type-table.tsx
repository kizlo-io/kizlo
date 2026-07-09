import { highlight } from "fumadocs-core/highlight"
import Link from "fumadocs-core/link"
import { createFileSystemGeneratorCache, createGenerator } from "fumadocs-typescript"
import { type AutoTypeTableProps, AutoTypeTable as BaseAutoTypeTable } from "fumadocs-typescript/ui"
import { source } from "@/lib/source"

const generator = createGenerator({
	cache: createFileSystemGeneratorCache(".next/fumadocs-typescript"),
	// Resolve types from the kizlo package so cross-package imports (@kizlo/*, @orpc/*) link up.
	tsconfigPath: "../packages/kizlo/tsconfig.json",
})

// optional fields already show a `?` next to the name, so the trailing `| undefined` is noise.
const stripUndefined = (type: string) => type.replace(/\s*\|\s*undefined$/, "")

// A type links to whatever reference page documents it. Each reference page declares the types
// it covers via its `types` frontmatter (e.g. the `defineErrorMap` page covers `DefinedErrorMapLike`),
// and the map is derived from that — self-maintaining, no central list, no dangling links.
let typeReferences: Map<string, string> | undefined
function getTypeReferences() {
	if (!typeReferences) {
		typeReferences = new Map()
		for (const page of source.getPages()) {
			for (const name of page.data.types ?? []) typeReferences.set(name, page.url)
		}
	}
	return typeReferences
}

function typeReferenceHref(simplifiedType: string) {
	// A reference type may appear as a bare name, a generic (`Fixture<T>`), or an array (`Fixture[]`,
	// `readonly Fixture[]`) — link the underlying name in every case. Peel `readonly` and any trailing `[]`,
	// then take the base name.
	const unwrapped = simplifiedType.replace(/^readonly\s+/, "").replace(/(\[\])+$/, "")
	const base = unwrapped.match(/^(\w+)(?:<.*>)?$/)?.[1]
	return base ? getTypeReferences().get(base) : undefined
}

// ts-morph isn't a direct dep of `web`, so derive the property `Type` from the transform signature.
type AutoTypeTableTransform = NonNullable<NonNullable<AutoTypeTableProps["options"]>["transform"]>
type PropertyType = Parameters<AutoTypeTableTransform>[1]

// Spell out a union of string/number literals (`HTTPMethod` → `"GET" | "POST" | …`). `boolean`
// (a union of `true | false`) is left alone. Returns undefined when there's nothing to expand.
function expandLiteralUnion(type: PropertyType) {
	if (!type.isUnion()) return undefined
	const members = type.getUnionTypes().filter((member) => !member.isUndefined())
	if (members.length < 2 || !members.every((member) => member.isStringLiteral() || member.isNumberLiteral())) return undefined
	return members.map((member) => member.getText()).join(" | ")
}

// Spell out a function type's call signature (`(cookies: CookieWithOptions[]) => void | Promise<void>`). Like
// `expandLiteralUnion`, the body gets the full signature while the trigger keeps the named alias — so a method
// typed as e.g. `CookiesSetAll` shows that name in the row and the signature only when expanded. Param/return
// text comes from the declaration nodes (source text), avoiding `import("…")`-qualified names. Returns undefined
// for anything that isn't a plain function (objects with a call signature are left alone).
// ts-morph isn't a direct dep of `web`, so the function-type declaration's shape is reached structurally.
type SignatureDeclLike = {
	getParameters?: () => { getText: () => string }[]
	getReturnTypeNode?: () => { getText: () => string } | undefined
}

function expandFunction(type: PropertyType) {
	// Optional properties (`seed?: FixtureSeedFn`) arrive as `Fn | undefined` — a union with no call signatures
	// of its own. Operate on the lone non-undefined member so optional functions expand too.
	const members = type.isUnion() ? type.getUnionTypes().filter((member) => !member.isUndefined()) : [type]
	const fn = members[0]
	if (members.length !== 1 || !fn) return undefined
	const signatures = fn.getCallSignatures()
	const signature = signatures[0]
	if (signatures.length !== 1 || !signature || fn.getProperties().length > 0) return undefined
	const declaration = signature.getDeclaration() as unknown as SignatureDeclLike
	const params = declaration.getParameters?.().map((parameter) => parameter.getText()) ?? []
	const returnType = declaration.getReturnTypeNode?.()?.getText() ?? signature.getReturnType().getText()
	return `(${params.join(", ")}) => ${returnType}`
}

// Show real type names instead of "union"/"object"/function-signature placeholders. The always-visible trigger
// keeps the compact name (`HTTPMethod`, `CookiesSetAll`); the expanded literal union or call signature goes into
// the collapsible body (`type`), which wraps — so a long type never overflows the trigger row.
const options: AutoTypeTableProps["options"] = {
	typeSimplifier: { shouldSimplify: () => false },
	transform: (entry, propertyType) => {
		entry.simplifiedType = stripUndefined(entry.simplifiedType)
		entry.type = expandLiteralUnion(propertyType) ?? expandFunction(propertyType) ?? stripUndefined(entry.type)
	},
}

// Render a type cell exactly like fumadocs (shiki-highlighted inline TS), then link it to its reference
// page when one exists. This runs for BOTH the trigger and the expanded body, so the link is reachable
// on mobile (where the trigger type is hidden) by tapping the type in the expanded row.
async function renderType(type: string) {
	const highlighted = await highlight(type, { lang: "ts", structure: "inline", defaultColor: false })
	const node = (
		<span className="shiki">
			<code>{highlighted}</code>
		</span>
	)

	const href = typeReferenceHref(type)
	return href ? (
		<Link href={href} className="underline">
			{node}
		</Link>
	) : (
		node
	)
}

/** `AutoTypeTable` preconfigured for this repo: type linking, literal-union expansion, mobile-safe links. */
export function AutoTypeTable(props: Partial<AutoTypeTableProps>) {
	return <BaseAutoTypeTable options={options} renderType={renderType} {...props} generator={generator} />
}
