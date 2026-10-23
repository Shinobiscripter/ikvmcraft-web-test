import { downloadFabricMinecraftVersionToOpfs, isMinecraftVersionDownloaded, type DownloadProgress } from "./minecraft";
import { opfsInvalidate } from "./opfs";
import { loglisteners } from "./dotnet/log";

export function progressText(p: DownloadProgress): string {
	return p.total === undefined ? p.stage : `${p.stage}: ${p.completed}/${p.total} files`;
}

export function createTestLauncher(launch: (version: string, fabric: string) => void): HTMLElement {
	const root = document.createElement("section");
	root.className = "test-launcher";
	root.innerHTML = `
		<h1>IKVMcraft test launcher</h1>
		<p>Custom IKVM / Mono / WebGPU runtime. Start with 1.16.5 and no mods.</p>
		<fieldset><legend>Instance settings</legend>
		<label>Minecraft Version <input name="minecraft" list="mc-versions" value="1.16.5"></label>
		<datalist id="mc-versions"><option value="1.16.5"><option value="26.2"></datalist>
		<label>Fabric Loader Version <input name="fabric" value="0.19.5"></label>
		<p>Changing versions requires no rebuild. Game settings, saves and mods currently share OPFS /minecraft.</p>
		</fieldset>
		<fieldset><legend>Storage</legend><p data-storage>Checking installation…</p>
		<button data-action="install">Install/Download</button>
		<button data-action="verify">Verify installation</button>
		<button data-action="reinstall">Reinstall</button>
		<button data-action="clear">Clear selected instance</button>
		</fieldset>
		<fieldset><legend>Mods (shared across configurations)</legend>
		<p>Drop .jar files here or use the picker. Only upload mods compatible with the selected Minecraft version. Restart after changing mods.</p>
		<input type="file" accept=".jar" multiple aria-label="Upload mods">
		<ul data-mods></ul><button data-action="clear-mods">Clear mods</button>
		</fieldset>
		<button data-action="launch" class="launch">LAUNCH</button>
		<p role="status"></p><pre role="alert"></pre>
		<button data-action="retry" hidden>Retry</button>
		<button data-action="return" hidden>Return to Launcher</button>
		<details><summary>Logs</summary><pre data-logs></pre></details>`;
	const logView = root.querySelector<HTMLElement>("[data-logs]")!;
	logView.style.cssText = "max-height:20rem;overflow:auto;white-space:pre-wrap";
	const logLines: string[] = [];
	loglisteners.push(entry => {
		logLines.push(entry.log);
		if (logLines.length > 1000) logLines.shift();
		logView.textContent = logLines.join("\n");
	});
	const mc = root.querySelector<HTMLInputElement>('[name="minecraft"]')!;
	const fabric = root.querySelector<HTMLInputElement>('[name="fabric"]')!;
	mc.value = localStorage.getItem("ikvmcraft.mc") ?? "1.16.5";
	fabric.value = localStorage.getItem("ikvmcraft.fabric") ?? "0.19.5";
	const status = root.querySelector<HTMLElement>('[role="status"]')!;
	const errorBox = root.querySelector<HTMLElement>('[role="alert"]')!;
	const storage = root.querySelector<HTMLElement>('[data-storage]')!;
	const retry = root.querySelector<HTMLButtonElement>('[data-action="retry"]')!;
	const back = root.querySelector<HTMLButtonElement>('[data-action="return"]')!;
	let busy = false;
	let lastAction: () => Promise<void> = async () => {};
	function selected() {
		for (const value of [mc.value, fabric.value]) {
			if (!/^[a-zA-Z0-9_.+-]+$/.test(value) || value === "." || value === "..") throw new Error("Enter valid Minecraft and Fabric version identifiers.");
		}
		localStorage.setItem("ikvmcraft.mc", mc.value);
		localStorage.setItem("ikvmcraft.fabric", fabric.value);
		return `${mc.value}-fabric-${fabric.value}`;
	}
	async function run(action: () => Promise<void>) {
		if (busy) return;
		busy = true;
		lastAction = action;
		errorBox.textContent = "";
		retry.hidden = back.hidden = true;
		root.querySelectorAll<HTMLInputElement | HTMLButtonElement>("input,button").forEach(e => e.disabled = true);
		try { await action(); }
		catch (error) {
			console.error(`[launcher] ${status.textContent}`, error);
			errorBox.textContent = `Failed at ${status.textContent}\n${error instanceof Error ? error.stack ?? error.message : String(error)}`;
			retry.hidden = back.hidden = false;
		} finally {
			busy = false;
			root.querySelectorAll<HTMLInputElement | HTMLButtonElement>("input,button").forEach(e => e.disabled = false);
		}
	}
	async function check(verification: "size" | "sha1" = "size") {
		status.textContent = "Checking installation";
		const id = selected();
		const found = await isMinecraftVersionDownloaded(id, { verification });
		storage.textContent = `${id}: ${found ? `available in OPFS (${verification} checked)` : "missing or incomplete"}`;
		status.textContent = found ? "Installation ready" : "Install/Download required";
		return found;
	}
	async function install(force = false) {
		selected();
		if (!force && await check()) return;
		await navigator.storage.persist();
		status.textContent = "Downloading metadata";
		await downloadFabricMinecraftVersionToOpfs(mc.value, {
			loaderVersion: fabric.value, skipVanillaIfDownloaded: !force,
			onProgress: p => { status.textContent = progressText(p); },
		});
		if (!await check()) throw new Error("Download finished but installation verification failed. See logs.");
	}
	async function modsDirectory() {
		const opfs = await navigator.storage.getDirectory();
		const game = await opfs.getDirectoryHandle("minecraft", { create: true });
		const mods = await game.getDirectoryHandle("mods", { create: true });
		opfsInvalidate();
		return mods;
	}
	async function listMods() {
		const list = root.querySelector<HTMLElement>("[data-mods]")!;
		list.replaceChildren();
		const dir = await modsDirectory();
		for await (const [name, entry] of dir as any) {
			if (entry.kind !== "file" || !name.endsWith(".jar")) continue;
			const li = document.createElement("li");
			li.append(document.createTextNode(name + " "));
			const remove = document.createElement("button");
			remove.textContent = "Remove";
			remove.onclick = () => void run(async () => {
				if (!confirm(`Delete mod ${name}?`)) return;
				await dir.removeEntry(name);
				opfsInvalidate();
				await listMods();
			});
			li.append(remove); list.append(li);
		}
	}
	async function upload(files: File[]) {
		status.textContent = "Uploading mods";
		const dir = await modsDirectory();
		for (const file of files) {
			if (!file.name.toLowerCase().endsWith(".jar")) throw new Error(`${file.name}: only .jar files are supported.`);
			const magic = new Uint8Array(await file.slice(0, 4).arrayBuffer());
			if (magic[0] !== 0x50 || magic[1] !== 0x4b) throw new Error(`${file.name}: not a JAR/ZIP archive.`);
			let exists = false;
			try { await dir.getFileHandle(file.name); exists = true; }
			catch (e) { if (!(e instanceof DOMException && e.name === "NotFoundError")) throw e; }
			if (exists && !confirm(`Replace mod ${file.name}?`)) continue;
			const output = await (await dir.getFileHandle(file.name, { create: true })).createWritable();
			await file.stream().pipeTo(output);
			opfsInvalidate();
		}
		await listMods(); status.textContent = "Mods saved to OPFS /minecraft/mods";
	}
	root.ondragover = e => e.preventDefault();
	root.ondrop = e => { e.preventDefault(); const files = Array.from(e.dataTransfer?.files ?? []); void run(() => upload(files)); };
	root.querySelector<HTMLInputElement>('[type="file"]')!.onchange = e => {
		const input = e.target as HTMLInputElement;
		const files = Array.from(input.files ?? []); input.value = "";
		void run(() => upload(files));
	};
	const actions: Record<string, () => Promise<void>> = {
		install: () => install(),
		verify: async () => { await check("sha1"); },
		reinstall: async () => { if (confirm("Redownload the selected configuration and overwrite its shared libraries/assets? Saves and mods are retained.")) await install(true); },
		clear: async () => {
			const id = selected();
			if (!confirm(`Delete installation ${id}? Shared assets/libraries, vanilla cache, saves and mods are retained.`)) return;
			status.textContent = "Clearing selected installation";
			try {
				const base = await (await navigator.storage.getDirectory()).getDirectoryHandle("ikvmcraft");
				await (await base.getDirectoryHandle("versions")).removeEntry(id, { recursive: true });
			} catch (e) { if (!(e instanceof DOMException && e.name === "NotFoundError")) throw e; }
			opfsInvalidate(); await check();
		},
		"clear-mods": async () => {
			if (!confirm("Delete all .jar mods from the shared /minecraft/mods folder?")) return;
			const dir = await modsDirectory();
			for await (const [name, entry] of dir as any) if (entry.kind === "file" && name.endsWith(".jar")) await dir.removeEntry(name);
			opfsInvalidate(); await listMods();
		},
		launch: async () => { selected(); launch(mc.value, fabric.value); },
	};
	for (const [name, action] of Object.entries(actions)) root.querySelector<HTMLButtonElement>(`[data-action="${name}"]`)!.onclick = () => void run(action);
	retry.onclick = () => void run(lastAction);
	back.onclick = () => location.reload();
	mc.onchange = fabric.onchange = () => void run(async () => { await check(); });
	queueMicrotask(() => void run(async () => { await check(); await listMods(); }));
	return root;
}
