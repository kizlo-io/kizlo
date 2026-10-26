import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, test } from "vitest"

const script = fileURLToPath(new URL("./compose/export.php", import.meta.url))
let dir: string
beforeEach(() => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), "kizlo-zip-"))
	fs.mkdirSync(path.join(dir, "work"))
	fs.mkdirSync(path.join(dir, "wp-content/uploads/empty"), { recursive: true })
	fs.writeFileSync(path.join(dir, "work/database.sql"), "CREATE TABLE sample (value text);\nINSERT INTO sample VALUES ('emoji 😀');\n")
	fs.writeFileSync(path.join(dir, "work/README.txt"), "restore instructions")
	fs.writeFileSync(path.join(dir, "wp-config.php"), "secret")
	fs.writeFileSync(path.join(dir, ".env"), "secret")
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

function build(): void {
	execFileSync(
		"docker",
		[
			"run",
			"--rm",
			"--entrypoint",
			"php",
			"-v",
			`${dir}:/fixture`,
			"-v",
			`${script}:/export.php:ro`,
			"wordpress:cli-2.12.0-php8.3",
			"/export.php",
			"/fixture/work",
			"/fixture/wp-content",
		],
		{ stdio: "pipe", timeout: 30_000 },
	)
}

describe.skipIf(process.env.KIZLO_EXPORT_CONTAINER_TEST !== "1")("actual PHP ZIP builder", () => {
	test("preserves mounted plugins, filenames and empty directories and compresses exactly one SQL file", () => {
		fs.mkdirSync(path.join(dir, "plugin"))
		fs.writeFileSync(path.join(dir, "plugin/plugin.php"), "<?php // plugin")
		fs.mkdirSync(path.join(dir, "wp-content/plugins"))
		// The integration fixture below uses an actual Docker bind mount for the plugin.
		const name = "空 'quote $ dollar 😀.txt"
		fs.writeFileSync(path.join(dir, "wp-content/uploads", name), "unicode contents")
		fs.writeFileSync(path.join(dir, "wp-content/uploads/zero"), "")
		execFileSync(
			"docker",
			[
				"run",
				"--rm",
				"--entrypoint",
				"php",
				"-v",
				`${dir}:/fixture`,
				"-v",
				`${path.join(dir, "plugin")}:/fixture/wp-content/plugins/local:ro`,
				"-v",
				`${script}:/export.php:ro`,
				"wordpress:cli-2.12.0-php8.3",
				"/export.php",
				"/fixture/work",
				"/fixture/wp-content",
			],
			{ stdio: "pipe", timeout: 30_000 },
		)
		const result = execFileSync(
			"python3",
			[
				"-c",
				`import zipfile,io,json,sys
with zipfile.ZipFile(sys.argv[1]) as outer:
 inner=zipfile.ZipFile(io.BytesIO(outer.read('database.sql.zip')))
 print(json.dumps({'outer':outer.namelist(),'inner':inner.namelist(),'compression':inner.getinfo('database.sql').compress_type,'sql':inner.read('database.sql').decode(),'file':outer.read(sys.argv[2]).decode()}))`,
				path.join(dir, "work/site.zip"),
				`wp-content/uploads/${name}`,
			],
			{ encoding: "utf8" },
		)
		const zip = JSON.parse(result)
		expect(zip.inner).toEqual(["database.sql"])
		expect(zip.compression).toBe(8)
		expect(zip.sql).toContain("emoji 😀")
		expect(zip.file).toBe("unicode contents")
		expect(zip.outer).toEqual(
			expect.arrayContaining([
				"wp-content/uploads/empty/",
				"wp-content/uploads/zero",
				"wp-content/plugins/local/plugin.php",
				"README.txt",
				"database.sql.zip",
			]),
		)
		expect(zip.outer).not.toEqual(expect.arrayContaining(["database.sql", ".env", "wp-config.php"]))
	})

	test("rejects escaping and broken links rather than leaking or silently dropping content", () => {
		fs.symlinkSync("/etc/passwd", path.join(dir, "wp-content/leak"))
		expect(build).toThrow(/Content link.*escapes/)
	})

	test("rejects directory link cycles", () => {
		fs.symlinkSync(".", path.join(dir, "wp-content/cycle"))
		expect(build).toThrow(/directory link cycle/)
	})

	test("rejects a wp-content root link outside the install", () => {
		fs.rmSync(path.join(dir, "wp-content"), { recursive: true })
		fs.symlinkSync("/etc", path.join(dir, "wp-content"))
		expect(build).toThrow(/link outside the install/)
	})

	test("rejects a SQL dump above the PHP ZIP size limit", () => {
		fs.truncateSync(path.join(dir, "work/database.sql"), 0x1_0000_0000)
		expect(build).toThrow(/SQL exceeds the PHP ZIP size limit/)
	})

	test("rejects an empty SQL dump", () => {
		fs.writeFileSync(path.join(dir, "work/database.sql"), "")
		expect(build).toThrow(/empty or missing/)
	})
})
