// Integration test of the REAL downloader against the local HTTPS proxies.
// Node filesystem adapter below is a test double, NOT proof of browser OPFS/WASM.
// esbuild frontend/src/minecraft.ts --bundle --platform=node --format=esm --outfile=/tmp/ikvmcraft-downloader.mjs
// NODE_EXTRA_CA_CERTS=frontend/node_modules/.vite/basic-ssl/_cert.pem node scripts/check-installer.mjs
import { mkdtemp, mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";

const root = await mkdtemp(join(tmpdir(), "ikvmcraft-installer-"));
console.log(`Test data directory (not committed): ${root}`);
const origin = process.env.IKVMCRAFT_URL ?? "https://localhost:5021";
globalThis.location = { origin, href: origin + "/" };
const BrowserRequest = globalThis.Request;
globalThis.Request = class extends BrowserRequest {
	constructor(input, init) {
		super(typeof input === "string" ? new URL(input, origin) : input, init);
	}
};
function checkName(name) {
	if (!name || name === "." || name === ".." || /[/\\]/.test(name)) throw new TypeError(`Invalid path segment ${name}`);
}
async function exists(path) {
	try { return await stat(path); }
	catch (e) { if (e.code === "ENOENT") throw new DOMException(path, "NotFoundError"); throw e; }
}
class Directory {
	constructor(path) { this.path = path; }
	async getDirectoryHandle(name, options = {}) {
		checkName(name); const path = join(this.path, name);
		if (options.create) await mkdir(path, { recursive: true });
		assert.ok((await exists(path)).isDirectory());
		return new Directory(path);
	}
	async getFileHandle(name, options = {}) {
		checkName(name); const path = join(this.path, name);
		if (options.create) {
			try { await writeFile(path, new Uint8Array(), { flag: "wx" }); }
			catch (e) { if (e.code !== "EEXIST") throw e; }
		}
		await exists(path);
		return {
			async getFile() { return new File([await readFile(path)], name); },
			async createWritable() {
				const chunks = [];
				return { async write(data) { chunks.push(typeof data === "string" ? Buffer.from(data) : Buffer.from(data)); },
					async close() { await writeFile(path, Buffer.concat(chunks)); } };
			},
		};
	}
}
Object.defineProperty(navigator, "storage", { value: { getDirectory: async () => new Directory(root) } });
const { downloadFabricMinecraftVersionToOpfs, isMinecraftVersionDownloaded } = await import("/tmp/ikvmcraft-downloader.mjs");
for (const version of ["1.16.5", "26.2"]) {
	const id = `${version}-fabric-0.19.5`;
	assert.equal(await isMinecraftVersionDownloaded(id), false);
	let lastStage;
	const result = await downloadFabricMinecraftVersionToOpfs(version, {
		loaderVersion: "0.19.5",
		onProgress(p) {
			if (p.stage !== lastStage || p.completed % 200 === 0 || p.completed === p.total) console.log(version, p);
			lastStage = p.stage;
		},
	});
	assert.equal(result.version, id);
	assert.equal(await isMinecraftVersionDownloaded(id, { verification: "sha1" }), true);
	console.log(`PASS downloaded and SHA-1 verified ${id}`);
	// A truncated client must not be reported as installed.
	const client = join(root, result.clientJarPath);
	const bytes = await readFile(client);
	await writeFile(client, bytes.subarray(0, 16));
	assert.equal(await isMinecraftVersionDownloaded(id, { verification: "size" }), false);
	await writeFile(client, bytes);
	console.log(`PASS detects truncated client for ${id}`);
}
console.log("PASS installer integration. Browser OPFS and actual Minecraft execution remain separate manual checks.");
