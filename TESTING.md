# IKVMcraft local testing

## Status — 2026-10-23

**Minecraft 1.16.5 and 26.2, both with Fabric 0.19.5, reached their title screens in the webpage.** The complete custom IKVM/Mono/WASM application builds and runs. In the in-app Chromium 155 browser, installations into real OPFS passed SHA-1 verification, initialized Mono/IKVM, entered Fabric KnotClient, and rendered Minecraft menus and panoramas. The 1.16.5 installation also passed the reload-persistence check. No replacement runtime was used.

The observed title screen identified itself as `Minecraft 1.16.5/Fabric (Modded)`. At capture the overlay reported 6 instantaneous FPS, 15.80 average FPS, 1,311 MiB WASM, 526 MiB native and 305/409 MiB GC used/heap; subsequent counters reached 3,013 frames with 1,310.5 MiB WASM. These are startup observations, not a benchmark. A singleplayer world and multiplayer connection have not been tested. The first startup took approximately three minutes, including Fabric remapping and Java class loading.

Minecraft 26.2 reached the Mojang loading screen, then its accessibility welcome screen. Clicking Continue displayed `Minecraft 26.2 (Modded)` and the title menu. At capture it showed 59 instantaneous / 38.50 average FPS, 1,779 MiB WASM, 680 MiB native and 428/556 MiB GC used/heap; average FPS later reached approximately 58. First startup took approximately five minutes. The fullscreen control entered fullscreen successfully. The OPFS explorer opened the game folders and exported an actual F2 screenshot and `latest.log`. Local evidence is in the workspace's sibling `test-results/minecraft-26.2-title.png` and `test-results/minecraft-26.2.log` (the shared log includes both version runs).

Upstream inspected: `r58Playz/ikvmcraft`, commit `246560a73e6399a7ac0d5cabd750fb94515788fa`.

| Check | Result |
| --- | --- |
| Custom Java-to-.NET library bundles | Built using downloaded IKVM compiler |
| `make build`, AOT=false, OPT=false | Passed; 14 C# warnings, 0 errors |
| Native WASM | Generated, approximately 33 MiB; complete `_framework` approximately 310 MiB |
| `pnpm --dir frontend build` with runtime present | Passed TypeScript and Vite production build |
| HTTPS, COOP, COEP | Passed endpoint checks |
| Prism, Mojang manifest, both Maven Central routes | Passed endpoint checks |
| `/_framework/dotnet.js` | Served JavaScript, not the SPA fallback |
| Local `/wisp/` | Passed WebSocket HTTP 101 upgrade |
| 1.16.5 + Fabric 0.19.5 | Browser install and SHA-1 verification passed; title screen rendered. Node adapter also detected a deliberately truncated client. |
| 26.2 + Fabric 0.19.5 | Browser install and SHA-1 verification passed; title screen rendered. Node adapter also detected a deliberately truncated client. |
| Browser OPFS persistence, runtime initialization, title screen | **Passed**; reload persistence checked on 1.16.5, runtime/title screen on both versions |
| Mod loading and in-game networking | **Not verified** |
| GitHub fork | Created: [Shinobiscripter/ikvmcraft-web-test](https://github.com/Shinobiscripter/ikvmcraft-web-test), fork of r58Playz/ikvmcraft. The existing separate `ikvmcraft` repository was retained. |

The downloader tests use the unchanged public download APIs from `frontend/src/minecraft.ts`, actual HTTPS proxy requests and temporary files. A Node filesystem adapter substitutes for OPFS in this integration test. This proves neither browser filesystem semantics nor Minecraft execution. `sha1` mode checks supplied hashes/sizes and JAR signatures; some Fabric metadata has no published hash, so those files only receive available checks. Game files remain outside Git, in temporary test storage or browser OPFS.

Fabric selection is evidence-based: the upstream README describes 1.13–26.2 support with Fabric 0.19.x, and the official [Fabric 1.16.5/0.19.5 profile](https://meta.fabricmc.net/v2/versions/loader/1.16.5/0.19.5/profile/json) and Prism's 0.19.5 manifest were retrieved successfully. Compatibility metadata is not a substitute for the title-screen test.

## Architecture preserved

1. `Makefile` downloads the author's pinned FNA-WASM-Build and IKVM-WASM-Build releases, including Mono, its modified build tasks, Emscripten, IKVM, LWJGL, GLFW, SDL, OpenAL, libffi and Wink. Release IDs remain unchanged.
2. `build-ikvmc.py` downloads library JARs, invokes `ikvmc.sh`, and generates the bundle manifest and MSBuild references. Matching versions use precompiled assemblies; unmatched Java libraries retain the existing JIT/classloader path.
3. `loader/IkvmWasm.csproj` uses `Microsoft.NET.Sdk.WebAssembly`, targets `net10.0`, and overrides the runtime/native tools with the custom artifacts. Threads, SIMD, JSPI, custom Mono JIT and native linkage are preserved. No replacement Java runtime was introduced.
4. `frontend/src/minecraft.ts` resolves Prism/Mojang manifests, downloads and checks clients/libraries/assets, and merges Fabric loader/intermediary metadata. It writes `ikvmcraft/versions`, `ikvmcraft/libraries`, and `ikvmcraft/assets` into OPFS.
5. WASMFS mounts OPFS at `/libsdl`. `opfsInvalidate()` retains the custom negative-cache invalidation bridge. The existing game directory is `/libsdl/minecraft`; settings, saves and mods are shared across version selections.
6. `frontend/src/dotnet/index.ts` initializes Mono and IKVM, then calls the existing exported `Run`. `MinecraftLauncher.cs` builds the Java classpath/arguments and invokes Fabric's Knot main class with the existing transforms. C# runtime files were not rewritten.
7. LWJGL/OpenGL goes through the existing GLFW/Wink WebGPU translation stack. The existing canvas, native frame counter, memory counters, filesystem explorer, thread dump and JIT dump remain.
8. Java networking retains `IkvmNetwork.cs` and the Epoxy bridge in `net.ts`, with the local Wisp endpoint. Vite retains every original metadata/asset/library proxy and HTTPS isolation headers.

## Important modifications

- Makefile now selects Bash explicitly, uses resumable downloads and completion stamps, and avoids repeatedly extracting completed archives. This fixes the directory-as-success-marker problem after interrupted downloads.
- LF Git attributes prevent Windows CRLF shell-script failures while retaining generated-file annotations. The Windows checkout's Epoxy text placeholders were restored to the original Git symlinks using Linux Git/filesystem tools.
- Node 24 and pnpm version are recorded in `frontend/package.json`. Node 22 failed Dreamland's prepack because `RegExp.escape` was absent.
- Removed developer-specific host names; localhost works. Preview now receives the same proxy routes and isolation headers. Longer proxy prefixes match first, fixing `/proxy/maven-central-alt` being captured by `/proxy/maven-central`.
- Production preview uses the local Wisp endpoint, matching development. `?wisp=...` remains an explicit override.
- A small bootstrap checks HTTPS, isolation, shared WASM memory, JSPI, WebGPU adapter availability, OffscreenCanvas and OPFS before importing the application. Startup failures are shown with Retry.
- The .NET bootstrap is imported when launching, so missing runtime files no longer prevent the launcher from rendering. An absolute same-origin URL prevents Vite from adding `?import` and rejecting generated public runtime files. This fixed the observed first launch failure. Runtime fetch failures retain their HTTP status.
- Launcher adds editable/persisted version settings, install, full verification, reinstall, selected-installation deletion, shared mod upload/drop/list/removal, logs and visible errors. Destructive operations require confirmation.
- Downloader reports real completed-file counts. Network/HTTP 408/429/5xx failures have up to three logged retries with bounded timeouts/backoff. Parallel writers settle before a failed operation returns, avoiding overlap with Retry/Reinstall.
- Runner retains all existing diagnostics, adds fullscreen and reload-to-launcher controls, and displays the failed stage/stack. “Running” requires an observed frame counter; it is not a claim that the title screen has been reached. Reload releases the old runtime and workers.
- Logs retain a bounded history, include Error stacks and appear in the launcher and runner. Explorer deletion now asks for confirmation.

## Clean WSL2 Ubuntu build

Use **x86_64 Linux**: the pinned toolchain contains Linux host binaries. Tested here on WSL2 Ubuntu **26.04.1**, .NET SDK **10.0.402**, wasm-tools **10.0.13**, Node **24.22.1**, pnpm **10.34.7**, Python **3.14**. Python 3.10+ is required by the script's type syntax. Ubuntu 24.04 is a reasonable clean target but was not separately tested.

Build inside WSL's Linux filesystem, such as `~/src/ikvmcraft`, not `/mnt/c`. The latter caused severe extraction/linking delays and Windows Git also lost symlinks. Allow approximately 15–20 GB free space for tools, intermediate outputs and downloads; browser game storage is additional. This session built with 7.6 GiB WSL RAM and 2 GiB swap. Large modpacks can require more.

In Ubuntu:

```bash
sudo apt-get update
sudo apt-get install -y git curl ca-certificates wget unzip xz-utils \
  python3 make build-essential libicu-dev libssl-dev zlib1g-dev

# Install the tested SDK in your home directory.
curl -fsSL https://dot.net/v1/dotnet-install.sh -o /tmp/dotnet-install.sh
bash /tmp/dotnet-install.sh --version 10.0.402 --install-dir "$HOME/.dotnet"
export DOTNET_ROOT="$HOME/.dotnet"
export PATH="$DOTNET_ROOT:$PATH"
dotnet workload install wasm-tools

# Install the tested Node release, checking its archive checksum.
mkdir -p "$HOME/.local/ikvmcraft-tools"
cd "$HOME/.local/ikvmcraft-tools"
curl -fLO https://nodejs.org/dist/v24.22.1/node-v24.22.1-linux-x64.tar.xz
curl -fLO https://nodejs.org/dist/v24.22.1/SHASUMS256.txt
grep ' node-v24.22.1-linux-x64.tar.xz$' SHASUMS256.txt | sha256sum -c -
tar -xJf node-v24.22.1-linux-x64.tar.xz
export PATH="$HOME/.local/ikvmcraft-tools/node-v24.22.1-linux-x64/bin:$PATH"
npm install -g pnpm@10.34.7
```

Retain those `DOTNET_ROOT`/`PATH` exports in future shells. A system Node 22 is insufficient for the locked Dreamland build. `wasm-tools` supplies SDK targets; the project still explicitly selects the author's custom runtime and Emscripten tools. No host Java/JDK or system Emscripten installation is required for this build. Standard `bash`, `tar`, `sed`, `find`, `cp`, and coreutils are also used; Ubuntu normally provides them.

Clone the testing branch into WSL's Linux filesystem:

```bash
mkdir -p ~/src
cd ~/src
git clone --branch browser-test-launcher https://github.com/Shinobiscripter/ikvmcraft-web-test.git
cd ikvmcraft-web-test
pnpm --dir frontend install --frozen-lockfile
make build AOT=false OPT=false
pnpm --dir frontend build
pnpm --dir frontend dev
```

Alternatively, copy this machine's delivered source. Cloning upstream alone will **not** include this patch:

```bash
mkdir -p ~/src
cp -a /mnt/c/Users/Abel/Documents/Codex/2026-10-22/you-are-working-with-the-open/ikvmcraft ~/src/ikvmcraft
cd ~/src/ikvmcraft
git config core.autocrlf false
git config core.symlinks true
pnpm --dir frontend install --frozen-lockfile
make build AOT=false OPT=false
pnpm --dir frontend build
```

Copying this workspace also copies its large ignored downloads. For a clean source-only copy use the delivered `ikvmcraft-source.tar.gz` alongside the repository, extract into a fresh directory, then run the same install/build commands. Do not use a GitHub “Download ZIP” archive without restoring the two Epoxy symlinks.

`make build` must finish the `dotnet publish` and copying steps. Confirm:

```bash
test -f frontend/public/_framework/dotnet.js
ls -lh frontend/public/_framework/dotnet.native*.wasm
test -d frontend/public/image
```

The runtime build emitted obsolete-API/unread-parameter C# warnings and IKVM warnings about optional dependencies/annotations and Netty self-signed-certificate APIs. These did not prevent compilation. Their gameplay relevance is unverified. Keep them in the build log when debugging.

## Start the local web environment

After building:

```bash
cd ~/src/ikvmcraft
pnpm --dir frontend dev
```

Open **https://localhost:5021/** in current Chrome, Edge or another compatible Chromium browser. Port 5021 is strict: stop an existing server before starting another. Vite's development certificate is self-signed; the user must accept/trust that local certificate in their browser. After the user handled this warning, browser testing proceeded successfully.

On this machine a completed build is also available in **WSL Ubuntu `/opt/ikvmcraft-build`** and its development server was left running. To restart it later, with the installed `/usr/local/bin` tools:

```bash
cd /opt/ikvmcraft-build
pnpm --dir frontend dev
```

To test the bundled output instead, stop dev first, then:

```bash
pnpm --dir frontend build
pnpm --dir frontend preview
```

Preview is a local test server, not a production deployment. Plain static hosting is insufficient: metadata proxies and Wisp are required.

For WSL networks with unreliable automatic IP-family selection, try `IKVMCRAFT_PROXY_IPV4=1 pnpm --dir frontend dev`. This restricts the HTTPS download proxy's upstream connections to IPv4 and retains TLS verification. It is optional; it does not change Wisp. An eight-request probe completed every IPv4 request while automatic selection timed out twice, but a later proxied metadata request still timed out. Download retries remain necessary on this network.

## Browser verification checklist

Use a normal persistent profile with hardware acceleration and a functioning WebGPU adapter. Required: WebAssembly threads/SIMD/exception handling/JSPI, SharedArrayBuffer, secure cross-origin isolation, OffscreenCanvas, OPFS and enough storage. The launcher reports missing prerequisites. Keep the same scheme/host/port: OPFS belongs to that origin.

1. Open the local URL and handle the certificate warning. Check `crossOriginIsolated === true` in DevTools and that no capability error is shown.
2. Select **1.16.5**, **0.19.5**, and leave mods empty. Click **Install/Download**. Observe metadata, library, client and asset stages; counts are actual completed files. Keep Logs/DevTools open.
3. Run **Verify installation**. It uses the existing `sha1` mode. Reload and confirm the installation is still available in OPFS. An install-status check can consult Mojang mappings metadata and need network access.
4. Click **LAUNCH**. Observe Initializing runtime → Checking installation → Loading Fabric / Starting Minecraft. Confirm `_framework` JS/WASM/DLL requests succeed. Watch for `[MinecraftLauncher] Main class: ...KnotClient` and `[IKVM]` output.
5. Confirm the actual Minecraft title screen is drawn. Record a screenshot, browser version, GPU, startup time, FPS and memory. “Running (frames observed)” alone is not sufficient proof.
6. Test fullscreen, pointer interaction, filesystem explorer, thread/JIT dumps, and return/reload. Verify logs or saves under OPFS `/minecraft` survive reload.
7. Repeat with **26.2 / 0.19.5**. No application rebuild is needed. Shared saves/settings/mods require care when switching versions; do not open valuable worlds across incompatible game versions.
8. Only after vanilla Fabric reaches the title screen, upload one compatible `.jar` mod. Mods are stored in OPFS `/minecraft/mods` and are intentionally shared. Relaunch, inspect Fabric's mod list/logs, then test removal. Full per-instance game directories are a follow-up, not implemented here.
9. Verify networking with a server/account configuration you are authorized to use. The upstream launcher currently passes its existing offline/test identity; this work adds no Microsoft OAuth flow or authentication bypass. Online account/session testing remains future work.

**Reinstall** redownloads selected configuration files and shared dependencies; it retains saves/mods. **Clear selected instance** deletes only the merged Fabric version directory, retaining vanilla cache/shared assets/libraries and `/minecraft`. All deletion/overwrite controls ask first. Retry after a runtime failure uses a page reload because a second runtime cannot safely reuse the transferred canvas/worker state.

## Repeatable non-browser checks

With the dev server running, from the repository root:

```bash
node scripts/check-server.mjs

# Use the esbuild binary already installed transitively by Vite.
frontend/node_modules/.pnpm/esbuild@*/node_modules/esbuild/bin/esbuild \
  frontend/src/minecraft.ts --bundle --platform=node --format=esm \
  --outfile=/tmp/ikvmcraft-downloader.mjs
NODE_EXTRA_CA_CERTS=frontend/node_modules/.vite/basic-ssl/_cert.pem \
  node scripts/check-installer.mjs
```

These commands trust the exact local server certificate, without disabling TLS validation. `IKVMCRAFT_URL` and `IKVMCRAFT_CERT` can override the server-check defaults. Installer test data goes to a printed `/tmp/ikvmcraft-installer-*` directory, not Git or browser OPFS; both configurations used about 1 GiB total in the successful run. The intentional corruption test prints an expected size-mismatch warning before its PASS.

The first installer attempt failed on an asset proxy HTTP 500 caused by upstream `ETIMEDOUT`. The successful run exercised the new retry path (96 retry messages across both configurations). Later server-check reruns timed out on Prism metadata after HTTPS/header checks passed. Upstream connectivity remains intermittent despite successful complete installer runs and the browser installation; keep retry diagnostics when testing.

The first browser launch failed because Vite added `?import` to `/_framework/dotnet.js`; the absolute import URL fix resolved it. The successful 1.16.5 run emitted custom-runtime diagnostics such as `IKVM lazybody stuck ... waits on ...`, shader compilation timings, OPFS statistics and Wink frame statistics. Many native diagnostic lines appear at console error level because they use stderr; those messages alone do not indicate a failed launch. No fatal exception prevented the observed 1.16.5 title screen.

Remaining nonfatal errors observed in the exported shared game log:

- Narrator native libraries are unavailable (`libjnidispatch.so` / `flite`); 26.2 explicitly displays Narrator: Not Available.
- Vulkan probing cannot find `libvulkan.so.1`. The existing OpenGL-to-WebGPU rendering path nevertheless reaches the title screen.
- OSHI/JNA hardware reporting cannot find Linux `/proc`, udev, or mount information in the browser filesystem. System-report queries fail; gameplay impact beyond reporting has not been tested.
- 26.2 reports `glfwGetInputMode: Invalid mode [208903]` during pre-render. It does not stop the observed title screen; input behavior during gameplay remains a follow-up.
- Minecraft services return HTTP 401 and Realms rejects the existing test token `0`. Authentication was not bypassed or replaced; online services are not verified.
- Custom Mono prints `WASM_JIT_ARGS_CLOBBERED ... restored` warnings and JIT size-cap fallbacks. These need monitoring under gameplay and mods, but did not prevent either title screen.

The final server-check run passed HTTPS/isolation, all checked metadata/Maven routes, the .NET bootstrap and local Wisp upgrade. This is not proof of sustained network reliability or multiplayer compatibility.

## Remaining work / public hosting

- Extend title-screen verification to singleplayer world creation, gameplay, mods and authenticated networking; investigate actual exceptions with the retained diagnostics.
- Keep source changes on the fork's testing branch. Do not upload game files, test download directories or generated runtime caches.
- Provide a real trusted TLS certificate and maintain COOP/COEP, WASM MIME types, worker paths and cache coherence for every runtime artifact.
- Replace the development server with an explicit production proxy/Wisp deployment, preserving route behavior and restricting destinations, origins and abuse/traffic limits.
- Add appropriate account/session integration without weakening authentication, and review licensing/distribution requirements before publishing.
- Add isolated per-profile game/mod/save directories, storage quotas/cleanup, robust cancellation/resume and a browser-based regression matrix. Current retry does not promise efficient resume of every already-downloaded file.
