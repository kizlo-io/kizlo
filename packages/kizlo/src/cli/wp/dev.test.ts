import type { NetworkInterfaceInfo } from "node:os"
import { describe, expect, test } from "vitest"
import { lanAddress } from "./dev"

function ipv4(address: string, internal = false): NetworkInterfaceInfo {
	return {
		address,
		netmask: "255.255.255.0",
		family: "IPv4",
		mac: "00:00:00:00:00:00",
		internal,
		cidr: `${address}/24`,
	}
}

describe("lanAddress", () => {
	test.each(["10.0.0.2", "172.16.0.2", "172.31.0.2", "192.168.0.2"])(
		"prefers private LAN address %s over an earlier public address",
		(address) => {
			expect(lanAddress({ en0: [ipv4("203.0.113.2")], en1: [ipv4(address)] })).toBe(address)
		},
	)

	test.each(["docker0", "br-d7b9", "veth23", "utun4", "tun0", "tap0"])("skips virtual interface %s", (name) => {
		expect(lanAddress({ [name]: [ipv4("172.17.0.1")], en0: [ipv4("192.168.0.2")] })).toBe("192.168.0.2")
	})

	test("falls back to a non-private address on a physical interface", () => {
		expect(lanAddress({ en0: [ipv4("203.0.113.2")] })).toBe("203.0.113.2")
	})

	test("returns undefined without a usable physical IPv4 address", () => {
		expect(lanAddress({ lo0: [ipv4("127.0.0.1", true)], docker0: [ipv4("172.17.0.1")] })).toBeUndefined()
	})
})
