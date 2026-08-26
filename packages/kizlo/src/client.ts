import { createORPCClient, DynamicLink } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import { inferRPCMethodFromContractRouter } from "@orpc/contract"
import { OpenAPILink } from "@orpc/openapi-client/fetch"
import { RPC_PROTOCOL_HEADER } from "./shared/constants"
import { type Contract, isContractProcedure, restoreContract } from "./shared/contract"
import type { AnyProcedureTree, ExtractProcedureByScope } from "./shared/procedure"
import { createResultClient, type ResultClient } from "./shared/result"
import { getObjectProperty } from "./shared/utils"

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
 */
export function createKizloClient<T extends AnyProcedureTree>(contract: T, options?: { url?: string }): KizloClient<T> {
	return new KizloClient({ contract, url: options?.url })
}
