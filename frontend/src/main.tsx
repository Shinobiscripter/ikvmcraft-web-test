import { ComponentInstance, css, FC } from "dreamland/core";
import "./style.css";
import { initDotnet, play, dotnetState } from "./dotnet";
import { loglisteners } from "./dotnet/log";
import { dumpWasmJit } from "./dotnet/jitbench";
import {
	downloadFabricMinecraftVersionToOpfs,
	isMinecraftVersionDownloaded,
} from "./minecraft";
import { OpfsExplorer } from "./fs";
import { Button, Icon } from "./ui/Button";
import { createTestLauncher, progressText } from "./test-launcher";
import iconDns from "@ktibow/iconset-material-symbols/dns-outline";
import iconCode from "@ktibow/iconset-material-symbols/code";
import iconFolderOpen from "@ktibow/iconset-material-symbols/folder-open";


function LogView(this: FC<{ scrolling: boolean }>) {
	const create = (color: string, log: string) => {
		const el = document.createElement("div");
		el.classList.add("log");
		el.innerText = log;
		el.style.color = color;
		return el;
	};

	this.cx.mount = () => {
		const logroot = this.root as HTMLElement;
		for (const line of (globalThis as any).logs ?? []) logroot.append(create("var(--fg)", line));
		const frag = document.createDocumentFragment();

		loglisteners.push((x) => frag.append(create(x.color, x.log)));
		setInterval(() => {
			if (frag.children.length > 0) {
				logroot.appendChild(frag);
				while (logroot.children.length > 2000) logroot.firstElementChild?.remove();
				logroot.scrollTop = logroot.scrollHeight;
			}
		}, 50);
	};

	return (
		<div
			class="component-log"
			style={this.scrolling ? "overflow: auto" : "overflow: hidden"}
		/>
	);
}
LogView.style = css`
	:scope {
		min-height: 0;
		flex: 1;
		font-family: var(--font-mono);

		padding: 0.5rem;
		background: var(--bg-sub);
		border-top: 0.1rem solid var(--surface4);
	}

	::-webkit-scrollbar {
		width: 10px;
	}
	::-webkit-scrollbar-track {
		background: var(--surface3);
	}
	::-webkit-scrollbar-thumb {
		background: var(--surface6);
	}
`;

function Logo(this: FC) {
	return <span>ikvmcraft</span>;
}
Logo.style = css`
	:scope {
		font-family: var(--font-display);
		font-size: 2rem;
	}
`;

function Runner(
	this: FC<
		{
			version: string;
			fabric: string;
		},
		{
			canvas: HTMLCanvasElement;
			fsOpen: boolean;
			loadState: string;
			error: string;
		}
	>
) {
	this.fsOpen = false;
	this.error = "";
	this.loadState = "Initializing runtime";

	let version = this.version;
	let fabric = this.fabric;
	this.cx.mount = async () => {
		const fail = (error: unknown) => {
			console.error(`[runner] ${this.loadState}`, error);
			this.error = `Failed at ${this.loadState || "Running"}\n${error instanceof Error ? error.stack ?? error.message : String(error)}`;
		};
		window.addEventListener("error", e => fail(e.error ?? e.message));
		window.addEventListener("unhandledrejection", e => fail(e.reason));
		try {
		await initDotnet(this.canvas);
		this.loadState = "Checking installation";

		if (new URLSearchParams(location.search).has("bench"))
			console.debug("?bench: skipping the Minecraft download check");
		else {
			let verify = await isMinecraftVersionDownloaded(
				`${version}-fabric-${fabric}`,
				{
					verification: "size",
				}
			);
			console.log(verify);
			if (!verify) {
				this.loadState = "Downloading assets";
				await downloadFabricMinecraftVersionToOpfs(version, {
					loaderVersion: fabric,
					onProgress: p => { this.loadState = progressText(p); },
				});
			} else {
				console.debug(`Downloaded ${version} fabric ${fabric} already`);
			}
		}

		this.loadState = "Loading Fabric / Starting Minecraft";
		const frames = setInterval(() => {
			if (dotnetState.fps > 0) { this.loadState = ""; clearInterval(frames); }
		}, 500);
		try { await play(`${version}-fabric-${fabric}`); }
		finally { clearInterval(frames); }
		this.loadState = "Minecraft exited";
		} catch (error) { fail(error); }
	};

	let toFixed = (x: number) => x.toFixed(0);

	let threadDump = () => {
		(globalThis as any).wasm.Module.ccall("perform_thread_dump");
	};

	return (
		<div>
			<div class="header">
				<Logo />
				<div class="expand" />
				<div
					class="stats"
					class:hidden={use(this.loadState).map((x) => x !== "")}
				>
					<div class="label fps">fps:</div>
					<div class="stat fps">
						<span>
							{use(dotnetState.fps)} (
							{use(dotnetState.fpsAvg).map((x) => x.toFixed(2))})
						</span>
					</div>
					<div class="label memory">memory (mb):</div>
					<div class="stat memory">
						<span>
							gc {use(dotnetState.gcMemory).map(toFixed)}/
							{use(dotnetState.gcHeapMemory).map(toFixed)}
						</span>
						<span>native {use(dotnetState.nativeMemory).map(toFixed)}</span>
						<span>heap {use(dotnetState.heapMemory).map(toFixed)}</span>
						<span>wasm {use(dotnetState.wasmMemory).map(toFixed)}</span>
					</div>
				</div>
				<Button type="normal" icon="left" on:click={threadDump}>
					<Icon icon={iconDns} />
					Thread dump
				</Button>
				<Button type="normal" icon="left" on:click={dumpWasmJit}>
					<Icon icon={iconCode} />
					JIT dump
				</Button>
				<Button
					type="primary"
					icon="full"
					on:click={() => (this.fsOpen = !this.fsOpen)}
				>
					<Icon icon={iconFolderOpen} />
				</Button>
			</div>
			<div role="status">{use(this.loadState).map(x => x || "Running (frames observed)")}</div>
			<pre role="alert">{use(this.error)}</pre>
			<div>
				<Button on:click={() => location.reload()}>Retry / Return to Launcher</Button>
				<Button on:click={() => this.canvas.requestFullscreen().catch(console.error)}>Fullscreen</Button>
			</div>
			<div class="canvas">
				<div
					class="overlay not-ready"
					class:hidden={use(this.loadState).map((x) => x === "")}
				>
					{use(this.loadState)}
				</div>
				<canvas
					id="canvas"
					this={use(this.canvas)}
					on:contextmenu={(e: Event) => e.preventDefault()}
				/>
				<div class="overlay waiting">Waiting for game</div>
			</div>
			<LogView scrolling={true} />
			<OpfsExplorer open={use(this.fsOpen)} />
		</div>
	);
}
Runner.style = css`
	:scope {
		height: 100%;
		display: flex;
		flex-direction: column;

		background: var(--bg-sub);
	}

	.header {
		padding: 1rem;

		display: flex;
		gap: 1rem;
		align-items: center;

		background: var(--bg);
		border-bottom: 0.1rem solid var(--surface4);
	}

	.stats {
		display: grid;
		grid-auto-rows: max-content 1fr;
		grid-auto-columns: max-content 1fr;
		gap: 0.5rem 1rem;
	}
	.stats .label {
		grid-column: 1;
		justify-self: end;
	}
	.stats .stat {
		grid-column: 2;
	}
	.stats .fps {
		grid-row: 1;
	}
	.stats .memory {
		grid-row: 2;
	}

	.stats .stat.memory {
		display: flex;
		gap: 0.5rem;
	}

	.canvas {
		align-self: center;

		width: min(100%, calc(60dvh * 854 / 480));
		height: auto;
		aspect-ratio: 854 / 480;
		flex: none;
		min-width: 0;
		contain: size;

		display: grid;
		grid-template-areas: "canvas";
		isolation: isolate;
	}
	.canvas > * {
		grid-area: canvas;
	}
	.canvas .overlay {
		height: 100%;
		width: 100%;

		display: flex;
		align-items: center;
		justify-content: center;

		background: var(--surface1);
		font-family: var(--font-display);
		font-size: 4rem;
	}
	.canvas canvas {
		width: 100%;
		height: 100%;
		z-index: 0;
	}
	.canvas .not-ready {
		z-index: 1;
	}
	.canvas .waiting {
		z-index: -1;
	}

	.expand {
		flex: 1;
	}
	.hidden {
		visibility: hidden;
	}
`;

function App(
	this: FC<
		{},
		{
			version: string;
			fabric: string;
			runner: ComponentInstance<typeof Runner>;
		}
	>
) {
	this.version = localStorage.getItem("ikvmcraft.mc") ?? "1.16.5";
	this.fabric = "0.19.5";

	let play = async (version: string, fabric: string) => {
		this.version = version; this.fabric = fabric;
		this.runner = (
			<Runner version={this.version} fabric={this.fabric} />
		) as ComponentInstance<typeof Runner>;
	};

	return (
		<div>
			<div class="launcher" class:hidden={use(this.runner).map((x) => !!x)}>
				{createTestLauncher(play)}
			</div>
			<div>{use(this.runner)}</div>
		</div>
	);
}
App.style = css`
	:scope {
		position: relative;
		height: 100%;
		width: 100%;
		background: var(--bg);
	}

	.launcher {
		z-index: 1;
	}

	:scope > * {
		position: absolute;
		inset: 0;
	}

	.hidden {
		display: none;
	}
`;

document.querySelector("#app")!.replaceWith(<App />);
