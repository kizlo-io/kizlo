import { createHash, createHmac } from "node:crypto"
import { expect, test } from "vitest"
import { compare, hash, hmac } from "./crypto"

const samples = ["", "hello", "sk_live_9f8a7b6c5d4e", "café ☕ 日本語", "a".repeat(1000)]

test("hash produces the known SHA-256 vector", async () => {
	expect(await hash("hello")).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824")
})

test("hash stays byte-identical to node:crypto so stored hashes keep validating", async () => {
	for (const s of samples) {
		expect(await hash(s)).toBe(createHash("sha256").update(s).digest("hex"))
	}
})

test("hmac stays byte-identical to node:crypto so signed tokens keep validating", async () => {
	for (const s of samples) {
		expect(await hmac("site-secret", s)).toBe(createHmac("sha256", "site-secret").update(s).digest("hex"))
	}
})

test("hmac output depends on the key", async () => {
	expect(await hmac("key-a", "payload")).not.toBe(await hmac("key-b", "payload"))
})

test("compare returns true only for identical strings", async () => {
	expect(await compare("secret123", "secret123")).toBe(true)
	expect(await compare("secret123", "secret124")).toBe(false)
	expect(await compare("", "")).toBe(true)
})

test("compare returns false for differing lengths instead of throwing", async () => {
	expect(await compare("short", "muchlongerstring")).toBe(false)
	expect(await compare("abc", "")).toBe(false)
})

test("compare handles multi-byte unicode correctly", async () => {
	expect(await compare("café ☕", "café ☕")).toBe(true)
	expect(await compare("café ☕", "cafe ☕")).toBe(false)
})
