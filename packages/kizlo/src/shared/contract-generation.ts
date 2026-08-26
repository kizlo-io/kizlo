const CONTRACT_GENERATION = Symbol.for("kizlo.contract-generation")

function state(): Record<symbol, boolean | undefined> {
	return globalThis as unknown as Record<symbol, boolean | undefined>
}

export function isContractGeneration(): boolean {
	return state()[CONTRACT_GENERATION] === true
}

export function setContractGeneration(value: boolean): void {
	state()[CONTRACT_GENERATION] = value
}
