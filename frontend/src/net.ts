import { console_log } from "./dotnet/log";
import { init, EpoxyClient, WebSocketJsProvider, WispSocketProvider } from "./epoxy";
import wasm from "./epoxy/epoxy.wasm?url";

let client: EpoxyClient;

await init({ module_or_path: wasm });

// The Wisp server epoxy tunnels TCP/TLS through. Under the vite dev server that is the server itself (the
// `local-wisp` plugin in vite.config.ts). Preview uses the same local endpoint.
// Static hosting must supply this endpoint or explicitly set `?wisp=<url>`.
function wispUrl(): string {
	const override = new URLSearchParams(location.search).get("wisp");
	if (override) return override;
	return `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/wisp/`;
}

export function createClient() {
	const url = wispUrl();
	console.log("wisp server", url);
	let wisp = new WispSocketProvider(new WebSocketJsProvider(), url);
	client = new EpoxyClient(wisp);
	(globalThis as any).client = client;
}

createClient();
(globalThis as any).createEpoxyClient = createClient;

interface Stream {
    read: ReadableStream<Uint8Array<ArrayBuffer>>;
    write: WritableStream<Uint8Array<ArrayBuffer>>;
}

const WebSocketFields = {
	prototype: {
		send: WebSocket.prototype.send,
	},
	CLOSED: WebSocket.CLOSED,
	CLOSING: WebSocket.CLOSING,
	CONNECTING: WebSocket.CONNECTING,
	OPEN: WebSocket.OPEN,
};

// from celeste wasm
export class EpxTcpWs extends EventTarget {
	url: string;
	readyState: number = WebSocketFields.CONNECTING;

	ws?: WritableStreamDefaultWriter;
	reader?: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>>;

	binaryType: "blob" | "arraybuffer" = "blob";

	bufferedAmount: number = 0;

	onopen?: (evt: Event) => void;
	onclose?: (evt: Event) => void;
	onmessage?: (evt: Event) => void;
	onerror?: (evt: Event) => void;

	realOnClose: (code: number, reason: string) => void;
	realOnError: () => void;

	// close is raised from two places -- the read loop finishing, and close()/a failed write --
	// but .NET's ClientWebSocket must only ever see one CloseEvent.
	closeFired: boolean = false;
	closeRequested: boolean = false;

	constructor(remote: URL) {
		super();

		console.log("tcpws", remote);

		this.url = remote.toString();

		const onopen = () => {
			this.readyState = WebSocketFields.OPEN;

			const event = new Event("open");
			this.dispatchEvent(event);

			if (this.onopen) this.onopen(event);
		};

		const onmessage = async (payload: Uint8Array<ArrayBuffer>) => {
			let data;
			if (this.binaryType === "blob") data = new Blob([payload]);
			else if (this.binaryType === "arraybuffer") data = payload.buffer;

			const event = new MessageEvent("message", { data });
			this.dispatchEvent(event);
			if (this.onmessage) this.onmessage(event);
		};

		const onclose = (code: number, reason: string) => {
			if (this.closeFired) return;
			this.closeFired = true;

			this.readyState = WebSocketFields.CLOSED;
			const event = new CloseEvent("close", { code, reason });
			this.dispatchEvent(event);
			if (this.onclose) this.onclose(event);
		};
		this.realOnClose = onclose;

		const onerror = () => {
			this.readyState = WebSocketFields.CLOSED;
			const event = new Event("error");
			this.dispatchEvent(event);
			if (this.onerror) this.onerror(event);
		};
		this.realOnError = onerror;

		let type = remote.hostname.replace("wisp-", "");
		let [host, _port] = remote.pathname.slice(1).split(":");
		let port = +_port;

		(async () => {
			let ws: Stream = null!;
			try {
				if (type === "tcp") {
					ws = await client.connect(host, port) as Stream;
				} else if (type === "tls") {
					ws = await client.connectTls(host, port) as Stream;
				} else {
					throw new Error("invalid ty " + type);
				}
			} catch (err) {
				console.error(err);
				onerror();
				return;
			}

			const writer = ws.write.getWriter();
			const reader = ws.read.getReader();
			this.ws = writer;
			this.reader = reader;

			if (this.closeRequested) {
				// close() ran while the connect was still in flight. It has already fired the close
				// event, so just drop the stream now that there is one to drop.
				reader.cancel().then(undefined, (err) => console.log("cancel failed", err));
				writer.close().then(undefined, (err) => console.log("close failed", err));
				return;
			}

			this.readyState = WebSocketFields.OPEN;
			onopen();
			let errored = false;
			while (true) {
				try {
					const { value, done } = await reader.read();
					if (done || !value) break;

					console_log("rx", value);
					onmessage(value);
				} catch (err) {
					onerror();
					console.error(err);
					errored = true;
					break;
				}
			}
			this.readyState = WebSocketFields.CLOSED;
			onclose(errored ? 1011 : 1000, errored ? "epoxy.ts errored" : "normal");
		})();
	}

	send(...args: any[]) {
		if (this.readyState === WebSocketFields.CONNECTING || !this.ws) {
			throw new DOMException(
				"Failed to execute 'send' on 'WebSocket': Still in CONNECTING state."
			);
		}

		let data = args[0];
		if (data.buffer)
			data = data.buffer.slice(
				data.byteOffset,
				data.byteOffset + data.byteLength
			);

		if (!(data instanceof Uint8Array))
			data = new Uint8Array(data);

		this.bufferedAmount++;
		console_log("tx", data);
		this.ws.write(data).then(
			() => {
				this.bufferedAmount--;
			},
			(err) => {
				this.bufferedAmount--;
				console.error("tcpws write failed", err);
				this.realOnError();
				this.realOnClose(1011, "epoxy.ts write errored");
			}
		);
	}

	close(_: number, __: string) {
		if (
			this.readyState === WebSocketFields.CLOSING ||
			this.readyState === WebSocketFields.CLOSED
		)
			return;

		console_log("closing");
		this.readyState = WebSocketFields.CLOSING;
		this.closeRequested = true;

		this.reader?.cancel().then(undefined, (err) => console.log("cancel failed", err));
		this.ws?.close().then(
			(x) => console.log("really closed", x),
			(err) => console.log("close failed", err)
		);

		console_log("closed");
		this.readyState = WebSocketFields.CLOSED;
		this.realOnClose(1000, "normal");
	}
}
