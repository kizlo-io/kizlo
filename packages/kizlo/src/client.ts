import { createORPCClient, createORPCErrorFromJson, DynamicLink, isORPCErrorJson } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import { inferRPCMethodFromContractRouter } from "@orpc/contract"
import { OpenAPILink } from "@orpc/openapi-client/fetch"
import { RPC_PROTOCOL_HEADER } from "./shared/constants"
import { type Contract, isContractProcedure, restoreContract } from "./shared/contract"
import type { AnyProcedureTree, ExtractProcedureByScope } from "./shared/procedure"
import { createResultClient, type ResultClient } from "./shared/result"
import { getObjectProperty } from "./shared/utils"

/**
 * Generated code augments this in the project that owns the contract: `kizlo generate` writes a
 * barrel that registers its `procedures` here, which is what gives {@link ActiveKizloClient} that
 * project's own types without a cast.
 */
export interface KizloProcedureRegistry {}

/**
 * The browser client this project compiles against. The `any` short-circuit is on the whole client
 * rather than on the procedure tree: passing `any` through `ResultClient` distributes to a union
 * whose second property access fails, so an unregistered project would stop compiling instead of
 * staying loose.
 */
export type ActiveKizloClient = KizloProcedureRegistry extends { procedures: infer TProcedures extends AnyProcedureTree }
	? ResultClient<ExtractProcedureByScope<TProcedures, "remote" | "api">>
	: any

/** What {@link createKizloClient} returns: a {@link KizloClient} typed from the registry instead of its argument. */
export interface KizloBrowserClient {
	readonly client: ActiveKizloClient
}

export interface KizloClientConfig<T extends AnyProcedureTree> {
	url?: string
	contract: T
	fetch?: (request: Request) => Promise<Response>
}

export class KizloClient<TProcedures extends AnyProcedureTree> {
	public readonly client: ResultClient<ExtractProcedureByScope<TProcedures, "remote" | "api">>
	protected readonly config: KizloClientConfig<TProcedures>

	constructor(config: KizloClientConfig<TProcedures>) {
		this.config = config
		const url = this.getUrl()
		const orpcContract = restoreContract(config.contract as Contract)

		const openapiLink = new OpenAPILink(orpcContract, {
			url,
			fetch: config.fetch,
			customErrorResponseBodyDecoder(body, response) {
				if (body === null || typeof body !== "object" || Array.isArray(body)) return undefined
				// Kizlo's OpenAPI encoder omits oRPC's protocol-only `defined` flag.
				const error = { defined: false, ...body }
				return isORPCErrorJson(error) && error.status === response.status ? createORPCErrorFromJson(error) : undefined
			},
		})

		const remoteLink = new RPCLink({
			url,
			fetch: config.fetch,
			headers: { [RPC_PROTOCOL_HEADER]: "1" },
			method: inferRPCMethodFromContractRouter(orpcContract),
		})

		const link = new DynamicLink((_, path) => {
			const procedure = getObjectProperty(this.config.contract, path)

			if (!isContractProcedure(procedure)) {
				throw new Error(
					`No valid procedure found at path "${path.join(".")}". The generated contract may not match the exported procedures.`,
				)
			}

			switch (procedure.scope) {
				case "internal": {
					throw new Error("Internal procedure can only be called on the server.")
				}
				case "api": {
					return openapiLink
				}
				case "remote": {
					return remoteLink
				}
				default: {
					throw new Error()
				}
			}
		})

		this.client = createResultClient(createORPCClient(link))
	}

	private getUrl() {
		return this.config.url ?? window.location.origin
	}
}

/**
 * Creates a browser client for a generated contract. Defaults the URL to the
 * current origin (`window.location.origin`); framework packages wrap this to resolve it from their env.
 *
 * `contract` is the runtime routing table only. The type comes from {@link KizloProcedureRegistry},
 * which the generated barrel augments, so the client is typed even where the value is not in hand.
 */
export function createKizloClient(contract: unknown, options?: { url?: string }): KizloBrowserClient {
	// The one place the runtime proxy and the registered type meet. `contract.json` cannot prove the
	// registered shape and the proxy has no shape at all, so an assertion has to live somewhere: here,
	// written once against a registry the generated barrel fills, instead of once per project against a
	// value the project has to keep in hand.
	return new KizloClient({ contract: contract as AnyProcedureTree, url: options?.url }) as unknown as KizloBrowserClient
}
