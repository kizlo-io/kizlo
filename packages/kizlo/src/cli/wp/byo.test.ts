import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { detectTablePrefix, prepareByo, validateByoArchive } from "./byo"

describe("detectTablePrefix", () => {
	let dir: string
	beforeEach(() => {
		dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-byo-")))
	})
	afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

	function sql(body: string): string {
		const file = path.join(dir, "dump.sql")
		fs.writeFileSync(file, body)
		return file
	}

	test("reads the prefix from a standard `wp_options` table", async () => {
		expect(await detectTablePrefix(sql("CREATE TABLE `wp_posts` (...);\nCREATE TABLE `wp_options` (...);\n"))).toBe("wp_")
	})

	test("reads a custom prefix", async () => {
		expect(await detectTablePrefix(sql("CREATE TABLE `xyz_options` (...);\n"))).toBe("xyz_")
	})

	test("handles `IF NOT EXISTS` and `INSERT INTO` forms", async () => {
		expect(await detectTablePrefix(sql("CREATE TABLE IF NOT EXISTS `my_options` (id int);\n"))).toBe("my_")
		expect(await detectTablePrefix(sql("INSERT INTO `shop_options` VALUES (1);\n"))).toBe("shop_")
	})

	test("falls back to `wp_` when no options table is present", async () => {
		expect(await detectTablePrefix(sql("CREATE TABLE `wp_posts` (id int);\n"))).toBe("wp_")
	})
})

describe("validateByoArchive / prepareByo", () => {
	let dir: string
	let wordpressDir: string
	let configDir: string

	beforeEach(() => {
		dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-byo-")))
		wordpressDir = path.join(dir, "wordpress-install")
		configDir = dir
	})
	afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

	/** Build a `.tar.gz` with the given root entries under `dir` and return its path. */
	function archive(name: string, files: Record<string, string>): string {
		const src = fs.mkdtempSync(path.join(dir, "src-"))
		for (const [rel, content] of Object.entries(files)) {
			const full = path.join(src, rel)
			fs.mkdirSync(path.dirname(full), { recursive: true })
			fs.writeFileSync(full, content)
		}
		const out = path.join(dir, name)
		const roots = [...new Set(Object.keys(files).map((f) => f.replace(/\/.*/, "")))]
		execFileSync("tar", ["-czf", out, "-C", src, ...roots])
		fs.rmSync(src, { recursive: true, force: true })
		return out
	}

	test("accepts a well-formed archive and returns the sql name", () => {
		const a = archive("site.tar.gz", { "wordpress/wp-load.php": "<?php", "db.sql": "CREATE TABLE `wp_options` (id int);" })
		expect(validateByoArchive(a, wordpressDir)).toBe("db.sql")
	})

	test("accepts other tar extensions (auto-detected compression), e.g. .tgz", () => {
		const a = archive("site.tgz", { "wordpress/wp-load.php": "<?php", "db.sql": "CREATE TABLE `wp_options` (id int);" })
		expect(validateByoArchive(a, wordpressDir)).toBe("db.sql")
	})

	test("rejects a .zip (GNU tar can't read it on Linux)", () => {
		const zip = path.join(dir, "site.zip")
		fs.writeFileSync(zip, "")
		expect(() => validateByoArchive(zip, wordpressDir)).toThrow(/tar archive/)
	})

	test("rejects an archive without a wordpress/ directory", () => {
		const a = archive("nowp.tar.gz", { "site/wp-load.php": "<?php", "db.sql": "x" })
		expect(() => validateByoArchive(a, wordpressDir)).toThrow(/wordpress\//)
	})

	test("rejects an archive without exactly one root .sql", () => {
		const a = archive("nosql.tar.gz", { "wordpress/wp-load.php": "<?php" })
		expect(() => validateByoArchive(a, wordpressDir)).toThrow(/one root-level .sql/)
	})

	test("rejects an archive that lives inside dev.path", () => {
		fs.mkdirSync(wordpressDir, { recursive: true })
		const inside = path.join(wordpressDir, "backup.tar.gz")
		fs.writeFileSync(inside, "")
		expect(() => validateByoArchive(inside, wordpressDir)).toThrow(/outside dev\.path/)
	})

	test("hydrates files into dev.path, drops wp-config, stages the dump, detects prefix", async () => {
		const a = archive("site.tar.gz", {
			"wordpress/wp-load.php": "<?php",
			"wordpress/wp-includes/version.php": "<?php",
			"wordpress/wp-config.php": "<?php // theirs",
			"db.sql": "CREATE TABLE `acme_options` (id int);",
		})
		const { prefix, sqlPath } = await prepareByo(a, wordpressDir, configDir)
		expect(prefix).toBe("acme_")
		expect(fs.existsSync(path.join(wordpressDir, "wp-load.php"))).toBe(true)
		expect(fs.existsSync(path.join(wordpressDir, "wp-config.php"))).toBe(false)
		expect(sqlPath).toBe(path.join(configDir, ".kizlo", "byo-import.sql"))
		expect(fs.existsSync(sqlPath)).toBe(true)
	})
})
