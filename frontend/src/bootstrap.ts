// Keep capability and startup failures visible even when a module cannot load.
import "./style.css";

function showFailure(error: unknown) {
	console.error(error);
	const root = document.getElementById("app") ?? document.body;
	const title = document.createElement("h1");
	title.textContent = "IKVMcraft could not initialize";
	const details = document.createElement("pre");
	details.style.whiteSpace = "pre-wrap";
	details.textContent = error instanceof Error ? error.stack ?? error.message : String(error);
	const retry = document.createElement("button");
	retry.textContent = "Retry";
	retry.onclick = () => location.reload();
	root.replaceChildren(title, details, retry);
}

try {
	const missing: string[] = [];
	if (!isSecureContext) missing.push("HTTPS secure context");
	if (!crossOriginIsolated || typeof SharedArrayBuffer === "undefined") missing.push("cross-origin isolation (COOP/COEP) and SharedArrayBuffer");
	if (typeof WebAssembly === "undefined") missing.push("WebAssembly");
	else {
		if (!(WebAssembly as any).Suspending || !(WebAssembly as any).promising) missing.push("WebAssembly JSPI");
		try { new WebAssembly.Memory({ initial: 1, maximum: 1, shared: true }); }
		catch { missing.push("WebAssembly threads"); }
	}
	if (!(navigator as any).gpu) missing.push("WebGPU (enable browser hardware acceleration)");
	if (!navigator.storage?.getDirectory) missing.push("Origin Private File System (OPFS)");
	if (typeof OffscreenCanvas === "undefined") missing.push("OffscreenCanvas");
	if (missing.length) throw new Error(`Use current Chrome/Edge/Chromium at https://localhost:5021. Missing: ${missing.join(", ")}.`);
	await navigator.storage.getDirectory();
	const adapter = await (navigator as any).gpu.requestAdapter();
	if (!adapter) throw new Error("WebGPU has no available GPU adapter. Check browser hardware acceleration and graphics drivers.");
	await import("./main");
} catch (error) {
	showFailure(error);
}
