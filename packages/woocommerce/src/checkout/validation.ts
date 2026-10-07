import z from "zod/v4"
import { CoreAddressFieldKeys } from "../address-fields"
import { BillingFieldProjections, isExcludedRegisteredField } from "../field-projections"

export const CheckoutRegisteredFieldReference = z.object({
	id: z.string().min(1),
	bucket: z.enum(["billingAddress", "shippingAddress", "additionalFields"]).nullable(),
})
export type CheckoutRegisteredFieldReference = z.infer<typeof CheckoutRegisteredFieldReference>

const Evidence = z.object({
	source: z.string().nullable(),
	sourcePath: z.array(z.string()),
	code: z.string().nullable(),
	message: z.string(),
	registeredFields: z.array(CheckoutRegisteredFieldReference),
})
export const CheckoutValidationIssue = z.discriminatedUnion("scope", [
	Evidence.extend({ scope: z.literal("field"), target: z.array(z.string()).min(1) }),
	Evidence.extend({ scope: z.literal("group"), target: z.array(z.string()).min(1) }),
	Evidence.extend({ scope: z.literal("unresolved"), target: z.null() }),
])
export type CheckoutValidationIssue = z.infer<typeof CheckoutValidationIssue>
export const CheckoutValidationData = z.strictObject({
	issues: z.array(CheckoutValidationIssue),
})
export type CheckoutValidationData = z.infer<typeof CheckoutValidationData>
type Upstream = { code: string; message: string; data?: unknown }

function record(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}
function qualifiedPath(name: string): string[] | undefined {
	for (const [wire, sdk] of [
		["billing_address", "billingAddress"],
		["shipping_address", "shippingAddress"],
		["additional_fields", "additionalFields"],
	] as const) {
		for (const prefix of [wire, sdk]) {
			if (name === prefix) return [wire]
			if (name.startsWith(`${prefix}.`)) return [wire, name.slice(prefix.length + 1)]
			if (name.startsWith(`${prefix}[`) && name.endsWith("]")) return [wire, name.slice(prefix.length + 1, -1)]
		}
	}
	for (const group of ["billing", "shipping"]) {
		const id = name.slice(group.length + 1)
		if (
			name.startsWith(`${group}_`) &&
			(Object.hasOwn(CoreAddressFieldKeys, id) ||
				Object.values(CoreAddressFieldKeys).some((key) => key === id) ||
				id === "email" ||
				Object.hasOwn(BillingFieldProjections, id))
		) {
			return [`${group}_address`, id]
		}
	}
	return undefined
}

function sdkBucket(value: string | undefined): CheckoutRegisteredFieldReference["bucket"] {
	if (value === "billing_address" || value === "billingAddress") return "billingAddress"
	if (value === "shipping_address" || value === "shippingAddress") return "shippingAddress"
	if (value === "additional_fields" || value === "additionalFields") return "additionalFields"
	return null
}

function sourcePath(name: string): string[] {
	// Qualified custom identities stay literal until normalization records both interpretations.
	const qualified = qualifiedPath(name)
	if (qualified?.length === 1) return qualified
	if (!name.includes("/") && qualified && nativeTarget(qualified)) return qualified
	return [name]
}

function childPath(path: string[], name: string): string[] {
	// A key inside an explicit bucket is a literal ID, even when it resembles a qualified path.
	if (path.length === 1 && sdkBucket(path[0])) return [...path, name]
	const named = sourcePath(name)
	return path.length && !sdkBucket(named[0]) ? [...path, name] : named
}

function nativeTarget(path: string[]): string[] | undefined {
	const bucket = sdkBucket(path[0])
	const id = path[1]
	if (path.length !== 2 || !id || (bucket !== "billingAddress" && bucket !== "shippingAddress")) return
	const core = Object.entries(CoreAddressFieldKeys).find(([wire, sdk]) => id === wire || id === sdk)
	if (core || (bucket === "billingAddress" && id === "email")) return [bucket, core?.[1] ?? "email"]
	const projection = Object.entries(BillingFieldProjections).find(([key, entry]) => id === entry.id || id === key)
	if (projection && bucket === "billingAddress") return [bucket, projection[0]]
}

function normalizeIssue(issue: CheckoutValidationIssue, explicit: boolean): CheckoutValidationIssue {
	const path = issue.sourcePath
	const bucket = sdkBucket(path[0])
	if (path.length === 1 && bucket) return { ...issue, scope: "group", target: [bucket] }
	const target = nativeTarget(path)
	if (target) return { ...issue, scope: "field", target }
	const id =
		path.length === 1
			? path[0]
			: path.length === 2 && bucket
				? path[1]
				: explicit && path.length === 3 && (bucket === "billingAddress" || bucket === "shippingAddress") && path[1] === "additionalFields"
					? path[2]
					: undefined
	if (!id) return issue
	// Shipping Tax ID is excluded by the shared projection policy, independent of loaded definitions.
	if (bucket === "shippingAddress" && isExcludedRegisteredField(id, "shipping")) return issue
	const registeredFields: CheckoutRegisteredFieldReference[] = [{ id, bucket: path.length > 1 ? bucket : null }]
	const qualified = !explicit && path.length === 1 ? qualifiedPath(id) : undefined
	if (qualified?.length === 2 && qualified[1]) {
		registeredFields.push({ id: qualified[1], bucket: sdkBucket(qualified[0]) })
	}
	return { ...issue, registeredFields }
}

/** Extract messages and identity evidence before discarding the upstream envelope. */
export function checkoutValidationData(error: Upstream): CheckoutValidationData {
	const issues: CheckoutValidationIssue[] = []
	const data = record(error.data) ? error.data : {}
	const ancestors = new Set<object>()
	function visit(value: unknown, source: string | null, path: string[], code: string, explicit = false): void {
		if (typeof value === "object" && value !== null) {
			if (ancestors.has(value)) return
			ancestors.add(value)
		}
		try {
			visitValue(value, source, path, code, explicit)
		} finally {
			if (typeof value === "object" && value !== null) ancestors.delete(value)
		}
	}
	function visitValue(value: unknown, source: string | null, path: string[], code: string, explicit: boolean): void {
		if (Array.isArray(value)) {
			for (const child of value) visit(child, source, path, code, explicit)
			return
		}
		const detail = record(value) ? value : undefined
		const nextCode = typeof detail?.code === "string" ? detail.code : code
		const identity = record(detail?.data) ? detail.data : detail
		let nextPath = path
		let nextExplicit = explicit
		if (Array.isArray(identity?.path) && identity.path.length && identity.path.every((part) => typeof part === "string")) {
			const first = identity.path[0] as string
			nextPath = [sdkBucket(first) ? (qualifiedPath(first)?.[0] ?? first) : first, ...identity.path.slice(1)]
			nextExplicit = true
		} else if (typeof identity?.param === "string") {
			nextExplicit = false
			const explicit = sourcePath(identity.param)
			nextPath =
				explicit.length === 1 &&
				!["billing_address", "shipping_address", "additional_fields"].includes(explicit[0] ?? "") &&
				path.length &&
				["billing_address", "shipping_address", "additional_fields"].includes(path[0] ?? "")
					? [path[0] as string, ...explicit]
					: explicit
		}
		const context =
			identity?.group === "billing" || identity?.group === "shipping"
				? `${identity.group}_address`
				: identity?.group === "other" || identity?.location === "contact" || identity?.location === "order"
					? "additional_fields"
					: undefined
		const field = typeof identity?.key === "string" ? identity.key : identity?.field
		if (typeof field === "string") {
			nextExplicit = true
			const bucket = context ?? (sdkBucket(nextPath[0]) ? nextPath[0] : undefined)
			nextPath = bucket ? [bucket, field] : [field]
		} else if (context && nextPath.length === 1 && !sdkBucket(nextPath[0])) {
			// Relative identities use explicit context without reparsing their literal ID.
			nextPath = [context, ...nextPath]
		} else if (
			nextPath.length === 1 &&
			["billing_address", "shipping_address"].includes(nextPath[0] ?? "") &&
			nextCode.startsWith("invalid_") &&
			Object.hasOwn(CoreAddressFieldKeys, nextCode.slice("invalid_".length))
		) {
			nextPath = [nextPath[0] as string, nextCode.slice("invalid_".length)]
		}
		if (!field && nextPath.length === 0 && context) nextPath = [context]
		const nextSource = source ?? (typeof identity?.param === "string" ? identity.param : typeof field === "string" ? field : null)
		const message = typeof value === "string" ? value : typeof detail?.message === "string" ? detail.message : undefined
		if (message !== undefined) {
			const issue = normalizeIssue(
				{ source: nextSource, sourcePath: nextPath, code: nextCode, message, scope: "unresolved", target: null, registeredFields: [] },
				nextExplicit,
			)
			if (
				!issues.some(
					(other) =>
						other.source === nextSource &&
						other.message === message &&
						JSON.stringify(other.sourcePath) === JSON.stringify(nextPath) &&
						other.code === nextCode &&
						JSON.stringify(other.registeredFields) === JSON.stringify(issue.registeredFields) &&
						JSON.stringify(other.target) === JSON.stringify(issue.target),
				)
			)
				issues.push(issue)
		}
		if (Array.isArray(detail?.message)) visit(detail.message, nextSource, nextPath, nextCode, nextExplicit)
		if (Array.isArray(detail?.messages)) visit(detail.messages, nextSource, nextPath, nextCode, nextExplicit)
		if (!detail) return
		for (const [key, child] of Object.entries(detail)) {
			if (
				[
					"code",
					"message",
					"messages",
					"status",
					"data",
					"param",
					"path",
					"key",
					"field",
					"group",
					"location",
					"details",
					"params",
					"additional_errors",
					"errors",
				].includes(key)
			)
				continue
			visit(child, nextSource ?? key, childPath(nextPath, key), nextCode)
		}
		for (const container of identity === detail ? [detail] : [detail, identity]) {
			if (!container) continue
			for (const key of ["additional_errors", "errors"])
				if (container[key] !== undefined)
					visit(container[key], nextSource, path.length ? path : nextPath, nextCode, path.length ? explicit : nextExplicit)
			for (const key of ["details", "params"]) visitMap(container[key], nextSource, nextPath, nextCode, key === "params", nextExplicit)
		}
		if (
			identity !== detail &&
			(typeof identity?.message === "string" || Array.isArray(identity?.message) || Array.isArray(identity?.messages))
		) {
			visit(identity, source, nextPath, nextCode, nextExplicit)
		}
	}
	function visitMap(value: unknown, source: string | null, path: string[], code: string, params = false, explicit = false): void {
		if (!record(value)) {
			if (typeof value === "string" || Array.isArray(value)) visit(value, source, path, code, explicit)
			return
		}
		for (const [name, child] of Object.entries(value)) {
			const next = childPath(path, name)
			const childSource = source ?? name
			if (
				params &&
				typeof child === "string" &&
				issues.some(
					(issue) =>
						issue.source === childSource &&
						issue.message === child &&
						(JSON.stringify(issue.sourcePath) === JSON.stringify(next) || next.length === 1),
				)
			)
				continue
			visit(child, childSource, next, code)
		}
	}
	if (Array.isArray(error.data)) visit(error.data, null, [], error.code)
	else {
		// The root data envelope can carry metadata as well as errors. Do not turn unrelated payload values into messages.
		const keys = [
			"code",
			"message",
			"messages",
			"details",
			"params",
			"errors",
			"additional_errors",
			"param",
			"path",
			"key",
			"field",
			"group",
			"location",
			"data",
		]
		visit(Object.fromEntries(Object.entries(data).filter(([key]) => keys.includes(key))), null, [], error.code)
	}
	if (!issues.length) visit(error.message, null, [], error.code)
	return { issues }
}
