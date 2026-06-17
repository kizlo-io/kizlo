export type TODO = never

export type Arrayable<T> = T | T[]

export type FlagMap = Record<string, PropertyKey>

export type Prettify<T> = {
	[K in keyof T]: T[K] extends object ? Prettify<T[K]> : T[K]
} & {}

export type Promisify<T> = T | Promise<T>

export type UnionToIntersection<U> = (U extends any ? (x: U) => void : never) extends (x: infer I) => void ? I : never

export type Pathname = `/${string}`

/**
 * For each entry in TMap: if TOptions has that flag set to `true`,
 * require the mapped field on TCtx; otherwise leave it as-is.
 */
export type ApplyRequiredFlags<TCtx, TOptions, TMap extends FlagMap> = UnionToIntersection<
	{
		[K in keyof TMap]: TOptions extends { [P in K]: true } ? SetRequired<TCtx, TMap[K]> : TCtx
	}[keyof TMap]
>

export type DeepMerge<A, B> = {
	[K in keyof A | keyof B]: K extends keyof B
		? K extends keyof A
			? A[K] extends object
				? B[K] extends object
					? DeepMerge<A[K], B[K]>
					: B[K]
				: B[K]
			: B[K]
		: K extends keyof A
			? A[K]
			: never
}

/**
 * Makes all properties of an object (including nested ones) optional recursively
 */
export type PartialDeep<T> = T extends object
	? T extends (infer U)[]
		? PartialDeep<U>[]
		: T extends readonly (infer U)[]
			? readonly PartialDeep<U>[]
			: T extends Map<infer K, infer V>
				? Map<K, PartialDeep<V>>
				: T extends Set<infer U>
					? Set<PartialDeep<U>>
					: T extends (...args: any[]) => any
						? T
						: { [P in keyof T]?: PartialDeep<T[P]> }
	: T

/**
 * Makes all properties optional recursively, except for specified keys
 */
export type PartialDeepExcept<T, K extends string> = T extends object
	? T extends (infer U)[]
		? PartialDeepExcept<U, K>[]
		: T extends readonly (infer U)[]
			? readonly PartialDeepExcept<U, K>[]
			: T extends Map<infer MK, infer V>
				? Map<MK, PartialDeepExcept<V, K>>
				: T extends Set<infer U>
					? Set<PartialDeepExcept<U, K>>
					: T extends (...args: any[]) => any
						? T
						: {
								[P in keyof T as P extends K ? P : never]: PartialDeepExcept<T[P], K>
							} & {
								[P in keyof T as P extends K ? never : P]?: PartialDeepExcept<T[P], K>
							}
	: T

/**
 * Makes specified properties required while keeping others as-is
 */
export type SetRequired<TObj, TKey extends PropertyKey> = TKey extends keyof TObj
	? Omit<TObj, TKey> & { [K in TKey]-?: NonNullable<TObj[K]> }
	: TObj

/**
 * Makes specified properties required while keeping others as-is
 */
export type SetNonNullable<T, K extends keyof T> = Omit<T, K> & { [P in K]-?: NonNullable<T[P]> }

/**
 * Makes specified properties optional while keeping others as-is
 */
export type SetOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

/**
 * Makes specified properties nullable (allows null) while keeping others as-is
 */
export type SetNullable<T, K extends keyof T> = Omit<T, K> & {
	[P in K]: T[P] | null
}

export type Primitive = null | undefined | string | number | boolean | symbol | bigint

/**
 * Allows specific literal values while still accepting any wider primitive type.
 */
export type LiteralUnion<LiteralType, BaseType extends Primitive> = LiteralType | (BaseType & Record<never, never>)

export type ExtractLiterals<T> = T extends string ? (string extends T ? never : T) : never

export type NoSpaceString<T extends string, TErrorMessage extends string> = T extends `${string} ${string}` ? { __error: TErrorMessage } : T
