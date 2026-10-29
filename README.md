# ikvmcraft

Modern Minecraft + drop-in mods loaded dynamically in the browser with mono-wasm and IKVM. Uses a custom fork of IKVM with exact OpenJDK classloading semantics and other wasm patches, as well as a custom fork of mono with a full wasm JIT tier significantly improving performance over interp/jiterp.

![Minecraft 26.2 with Fabulously Optimized modpack](assets/26.2-fabulouslyoptimized.png)
Minecraft 26.2 with Fabulously Optimized modpack

![Minecraft 1.16.5 in-game with 24 render distance](assets/1.16.5-24render.png)
Minecraft 1.16.5 in-game with 24 render distance

![Minecraft 1.16.5 in-game with BSL Medium & 12 render distance](assets/1.16.5-bsl.png)
Minecraft 1.16.5 in-game with BSL Medium & 12 render distance

Supports Minecraft 1.13-26.2 with Fabric 0.19.x (other Fabric versions not tested but may work). Java runtime is mostly Java 25 compliant. Uses OpenGL 4.6 on top of WebGPU. Working on potential Vulkan implementation.
