// Uses Vite's exact local certificate as a trust anchor; no TLS validation bypass.
// Run from repo root after starting the HTTPS dev server.
import https from "node:https";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const base = process.env.IKVMCRAFT_URL ?? "https://localhost:5021";
const ca = readFileSync(process.env.IKVMCRAFT_CERT ?? "frontend/node_modules/.vite/basic-ssl/_cert.pem");
function get(path) {
	return new Promise((resolve, reject) => {
		const req = https.get(new URL(path, base), { ca }, res => {
			const chunks = [];
			res.on("data", chunk => chunks.push(chunk));
			res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
			res.on("error", reject);
		});
		req.setTimeout(60000, () => req.destroy(new Error(`Timeout: ${path}`)));
		req.on("error", reject);
	});
}
async function json(path) {
	const response = await get(path);
	assert.equal(response.status, 200, path);
	return JSON.parse(response.body);
}
const page = await get("/");
assert.equal(page.status, 200);
assert.equal(page.headers["cross-origin-opener-policy"], "same-origin");
assert.equal(page.headers["cross-origin-embedder-policy"], "require-corp");
console.log("PASS HTTPS, COOP and COEP");
for (const version of ["1.16.5", "26.2"]) {
	const meta = await json(`/proxy/meta/v1/net.minecraft/${version}.json`);
	assert.ok(meta.mainJar?.downloads?.artifact ?? meta.downloads?.client);
	assert.ok(meta.assetIndex);
	await json(`/proxy/meta/v1/net.fabricmc.intermediary/${version}.json`);
	console.log(`PASS Minecraft ${version} + Fabric intermediary metadata`);
}
const loader = await json("/proxy/meta/v1/net.fabricmc.fabric-loader/0.19.5.json");
assert.match(loader.mainClass, /KnotClient/);
await json("/proxy/piston-meta/mc/game/version_manifest_v2.json");
console.log("PASS Fabric 0.19.5 and Mojang manifest");
for (const prefix of ["maven-central", "maven-central-alt"]) {
	const jar = await get(`/proxy/${prefix}/maven2/org/ow2/asm/asm/9.9/asm-9.9.jar`);
	assert.equal(jar.status, 200);
	assert.equal(jar.body.subarray(0, 2).toString(), "PK");
	console.log(`PASS ${prefix} JAR proxy`);
}
const framework = await get("/_framework/dotnet.js");
assert.equal(framework.status, 200);
assert.match(framework.headers["content-type"], /javascript/);
assert.doesNotMatch(framework.body.toString(), /<!doctype html>/i);
console.log("PASS served .NET bootstrap (not an SPA fallback)");
// Wisp must accept its WebSocket protocol, not Vite's HMR socket.
await new Promise((resolve, reject) => {
	const req = https.request(new URL("/wisp/", base), {
		ca, headers: { Connection: "Upgrade", Upgrade: "websocket", "Sec-WebSocket-Version": "13", "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==" },
	});
	req.setTimeout(10000, () => req.destroy(new Error("Wisp upgrade timeout")));
	req.on("upgrade", (res, socket) => { assert.equal(res.statusCode, 101); socket.destroy(); resolve(); });
	req.on("response", res => reject(new Error(`Wisp returned HTTP ${res.statusCode}`)));
	req.on("error", reject); req.end();
});
console.log("PASS local Wisp WebSocket upgrade (game TCP traffic still needs browser verification)");
