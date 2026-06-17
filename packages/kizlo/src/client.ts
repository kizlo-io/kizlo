import { createORPCClient, DynamicLink } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import { inferRPCMethodFromContractRouter } from "@orpc/contract"
import { OpenAPILink } from "@orpc/openapi-client/fetch"
import { RPC_PROTOCOL_HEADER } from "./shared/constants"
import { type Contract, isContractProcedure, restoreContract } from "./shared/contract"
import type { AnyProcedureRouter, ExtractProcedureByScope } from "./shared/procedure"
import { createResultClient, type ResultClient } from "./shared/result"
import { getObjectProperty } from "./shared/utils"

export interface KizloClientConfig<T extends AnyProcedureRouter> {
	url?: string
	contract: T
	fetch?: (request: Request) => Promise<Response>
}

export class KizloClient<TRouter extends AnyProcedureRouter> {
	public readonly client: ResultClient<ExtractProcedureByScope<TRouter, "remote" | "api">>
	protected readonly config: KizloClientConfig<TRouter>

	constructor(config: KizloClientConfig<TRouter>) {
		this.config = config
		const url = this.getUrl()
		const orpcContract = restoreContract(config.contract as Contract)

		const openapiLink = new OpenAPILink(orpcContract, { url, fetch: config.fetch })

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
					`No valid procedure found at path "${path.join(".")}". This may happen when the contract router is not properly configured.`,
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
		return this.config.url ?? window.location.href
	}
}

/**
 * Creates a browser client for a generated contract. Defaults the URL to the
 * current origin; framework packages wrap this to resolve it from their env.
 */
export function createKizloClient<T extends AnyProcedureRouter>(contract: T, options?: { url?: string }): KizloClient<T> {
	return new KizloClient({ contract, url: options?.url })
}
