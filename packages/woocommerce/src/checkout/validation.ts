import z from "zod/v4"
import { CoreAddressFieldKeys } from "../address-fields"
import { BillingFieldProjections, isExcludedRegisteredField } from "../field-projections"
import type { StorefrontField } from "../storefront/schema"

const Evidence = z.object({
	source: z.string().nullable(),
	sourcePath: z.array(z.string()),
	code: z.string().nullable(),
	message: z.string(),
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
type Definition = Pick<StorefrontField, "id" | "location" | "bindings">
type Upstream = { code: string; message: string; data?: unknown }

/** Resolve registered identities from the definitions already loaded by the storefront. No I/O. */
export function resolveCheckoutValidationIssues(
	data: Pick<CheckoutValidationData, "issues">,
	fields: readonly Definition[],
): CheckoutValidationIssue[] {
	return data.issues.map((issue) => resolveIssue(issue, fields))
}

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

function sourcePath(name: string): string[] {
	// A namespaced ID can resemble a qualified path. Keep the literal until definitions disambiguate it.
	return name.includes("/") ? [name] : (qualifiedPath(name) ?? [name])
}

function childPath(path: string[], name: string): string[] {
	const named = sourcePath(name)
	return path.length && !["billing_address", "shipping_address", "additional_fields"].includes(named[0] ?? "") ? [...path, name] : named
}

function resolveIssue(issue: CheckoutValidationIssue, fields: readonly Definition[]): CheckoutValidationIssue {
	const path = issue.sourcePath
	const literal = resolvePath(issue, path, fields)
	const qualified = path.length === 1 ? qualifiedPath(path[0] ?? "") : undefined
	if (!qualified || JSON.stringify(qualified) === JSON.stringify(path)) return literal
	const parsed = resolvePath(issue, qualified, fields)
	const registeredLiteral = fields.some((field) => field.id === path[0])
	if (registeredLiteral && parsed.scope !== "unresolved") return { ...issue, scope: "unresolved", target: null }
	return literal.scope !== "unresolved" ? literal : parsed
}

function resolvePath(issue: CheckoutValidationIssue, path: string[], fields: readonly Definition[]): CheckoutValidationIssue {
	const bucket = path[0]
	const group = bucket === "billing_address" ? "billing" : bucket === "shipping_address" ? "shipping" : undefined
	const address = group ? `${group}Address` : undefined
	if (path.length === 1 && (address || bucket === "additional_fields")) {
		return { ...issue, scope: "group", target: [address ?? "additionalFields"] }
	}
	const id = path.length === 1 ? bucket : path.length === 2 ? path[1] : undefined
	if (path.length > 1 && !group && bucket !== "additional_fields") return { ...issue, scope: "unresolved", target: null }
	if (id && group && address) {
		const core = Object.entries(CoreAddressFieldKeys).find(([wire, sdk]) => id === wire || id === sdk)
		if (core || (group === "billing" && id === "email")) return { ...issue, scope: "field", target: [address, core?.[1] ?? "email"] }
		const projection = Object.entries(BillingFieldProjections).find(([key, entry]) => id === entry.id || id === key)
		if (projection && group === projection[1].group) return { ...issue, scope: "field", target: [address, projection[0]] }
		if (isExcludedRegisteredField(id, group)) return { ...issue, scope: "unresolved", target: null }
	}
	const candidates = fields.flatMap((field) => {
		if (field.id !== id) return []
		if (group) {
			const binding = field.location === "address" ? field.bindings[group] : undefined
			return binding ? [[address as string, ...binding]] : []
		}
		if (field.location === "address") return []
		return Object.entries(field.bindings).flatMap(([key, binding]) =>
			binding ? [key === "other" ? binding : [`${key}Address`, ...binding]] : [],
		)
	})
	return candidates.length === 1
		? { ...issue, scope: "field", target: candidates[0] as string[] }
		: { ...issue, scope: "unresolved", target: null }
}

/** Extract messages and identity evidence before discarding the upstream envelope. */
export function checkoutValidationData(error: Upstream): CheckoutValidationData {
	const issues: CheckoutValidationIssue[] = []
	const data = record(error.data) ? error.data : {}
	const ancestors = new Set<object>()
	function visit(value: unknown, source: string | null, path: string[], code: string): void {
		if (typeof value === "object" && value !== null) {
			if (ancestors.has(value)) return
			ancestors.add(value)
		}
		try {
			visitValue(value, source, path, code)
		} finally {
			if (typeof value === "object" && value !== null) ancestors.delete(value)
		}
	}
	function visitValue(value: unknown, source: string | null, path: string[], code: string): void {
		if (Array.isArray(value)) {
			for (const child of value) visit(child, source, path, code)
			return
		}
		const detail = record(value) ? value : undefined
		const nextCode = typeof detail?.code === "string" ? detail.code : code
		const identity = record(detail?.data) ? detail.data : detail
		let nextPath = path
		if (Array.isArray(identity?.path) && identity.path.length && identity.path.every((part) => typeof part === "string")) {
			nextPath = [sourcePath(identity.path[0] as string)[0] as string, ...identity.path.slice(1)]
		} else if (typeof identity?.param === "string") {
			const explicit = sourcePath(identity.param)
			nextPath =
				explicit.length === 1 &&
				!["billing_address", "shipping_address", "additional_fields"].includes(explicit[0] ?? "") &&
				path.length &&
				["billing_address", "shipping_address", "additional_fields"].includes(path[0] ?? "")
					? [path[0] as string, ...explicit]
					: explicit
		}
		const field = typeof identity?.key === "string" ? identity.key : identity?.field
		if (typeof field === "string") {
			const bucket =
				identity?.group === "billing" || identity?.group === "shipping"
					? `${identity?.group}_address`
					: identity?.group === "other"
						? "additional_fields"
						: ["billing_address", "shipping_address", "additional_fields"].includes(nextPath[0] ?? "")
							? nextPath[0]
							: undefined
			nextPath = bucket ? [bucket, field] : [field]
		} else if (
			nextPath.length === 1 &&
			["billing_address", "shipping_address"].includes(nextPath[0] ?? "") &&
			nextCode.startsWith("invalid_") &&
			Object.hasOwn(CoreAddressFieldKeys, nextCode.slice("invalid_".length))
		) {
			nextPath = [nextPath[0] as string, nextCode.slice("invalid_".length)]
		}
		if (!field && nextPath.length === 0) {
			if (identity?.group === "billing" || identity?.group === "shipping") nextPath = [`${identity.group}_address`]
			else if (identity?.group === "other") nextPath = ["additional_fields"]
		}
		const nextSource = source ?? (typeof identity?.param === "string" ? identity.param : typeof field === "string" ? field : null)
		const message = typeof value === "string" ? value : typeof detail?.message === "string" ? detail.message : undefined
		if (message !== undefined) {
			const issue = resolvePath(
				{ source: nextSource, sourcePath: nextPath, code: nextCode, message, scope: "unresolved", target: null },
				nextPath,
				[],
			)
			if (
				!issues.some(
					(other) =>
						other.source === nextSource &&
						other.message === message &&
						JSON.stringify(other.sourcePath) === JSON.stringify(nextPath) &&
						other.code === nextCode,
				)
			)
				issues.push(issue)
		}
		if (Array.isArray(detail?.message)) visit(detail.message, nextSource, nextPath, nextCode)
		if (Array.isArray(detail?.messages)) visit(detail.messages, nextSource, nextPath, nextCode)
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
				if (container[key] !== undefined) visit(container[key], nextSource, path.length ? path : nextPath, nextCode)
			for (const key of ["details", "params"]) visitMap(container[key], nextSource, nextPath, nextCode, key === "params")
		}
		if (
			identity !== detail &&
			(typeof identity?.message === "string" || Array.isArray(identity?.message) || Array.isArray(identity?.messages))
		) {
			visit(identity, source, nextPath, nextCode)
		}
	}
	function visitMap(value: unknown, source: string | null, path: string[], code: string, params = false): void {
		if (!record(value)) {
			if (typeof value === "string" || Array.isArray(value)) visit(value, source, path, code)
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
			"data",
		]
		visit(Object.fromEntries(Object.entries(data).filter(([key]) => keys.includes(key))), null, [], error.code)
	}
	if (!issues.length) visit(error.message, null, [], error.code)
	return { issues }
}
