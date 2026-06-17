import type { Pathname, TODO } from "@kizlo/shared"
import { type AnyContractRouter, isContractProcedure as isOrpcContractProcedure, minifyContractRouter } from "@orpc/contract"
import type { AnyProcedureRouter, InvocationScope } from "./procedure"
import { createOrpcRouter } from "./router"
import type { HTTPMethod } from "./types"

export type Contract = { [key: string]: ContractProcedure | Contract }
export type ContractProcedure = { scope: InvocationScope; route: { method?: HTTPMethod; path?: Pathname } }

export function isContractProcedure(node: unknown): node is ContractProcedure {
	if (!node || typeof node !== "object") return false
	return "route" in (node as object) || "meta" in (node as object)
}

export async function generateContract<TRouter extends AnyProcedureRouter>(router: TRouter): Promise<Contract> {
	const contract = minifyContractRouter(createOrpcRouter(router) as TODO)

	const walk = (node: AnyContractRouter): Contract => {
		const out: Contract = {}
		for (const [key, value] of Object.entries(node)) {
			if (isOrpcContractProcedure(value)) {
				const { route, meta } = value["~orpc"]
				const scope = meta?.scope ?? null
				if (!scope) throw new Error("Scope not defined in procedure metadata.")
				out[key] = { scope, route: route ?? {} }
			} else {
				out[key] = walk(value as AnyContractRouter)
			}
		}
		return out
	}
	return walk(contract)
}

export function restoreContract(contract: Contract): AnyContractRouter {
	const walk = (node: Contract): AnyContractRouter => {
		const out: AnyContractRouter = {}
		for (const [key, value] of Object.entries(node)) {
			if (isContractProcedure(value)) {
				const procedure = value as ContractProcedure

				out[key] = {
					"~orpc": {
						meta: {},
						errorMap: {},
						route: procedure.route ?? {},
					},
				}
			} else {
				out[key] = walk(value as Contract)
			}
		}
		return out
	}
	return walk(contract)
}
