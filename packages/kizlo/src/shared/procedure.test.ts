import { expect, test } from "vitest"
import { z } from "zod"
import { combineDetailed } from "./procedure"

async function validate(schema: ReturnType<typeof combineDetailed>, value: unknown) {
	const result = await schema["~standard"].validate(value)
	return result
}

test("combineDetailed accepts missing input when every part is optional", async () => {
	const schema = combineDetailed({ query: z.object({ search: z.string() }).optional() })

	const undefinedResult = await validate(schema, undefined)
	if (undefinedResult.issues) throw new Error("expected success")
	expect(undefinedResult.value).toEqual({})

	const nullResult = await validate(schema, null)
	if (nullResult.issues) throw new Error("expected success")
	expect(nullResult.value).toEqual({})
})

test("combineDetailed still rejects missing input when a part is required", async () => {
	const schema = combineDetailed({ params: z.object({ identifier: z.string() }) })

	const result = await validate(schema, undefined)
	expect(result.issues).toBeDefined()
	expect(result.issues?.[0]?.path).toEqual(["params"])
})

test("combineDetailed rejects a defined non-object input", async () => {
	const schema = combineDetailed({ query: z.object({ search: z.string() }).optional() })

	const result = await validate(schema, "not-an-object")
	expect(result.issues).toEqual([{ message: "Expected object" }])
})
