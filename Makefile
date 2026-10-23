SHELL := /bin/bash
.PHONY: statics ikvmc-bundles deps build serve publish dotnetclean ikvmclean clean

STATICS_RELEASE=fe339c45-059a-44d4-a2de-8b978e25968a
IKVM_RELEASE=e9099aeb-f274-4d2d-9f58-163296a1c44a
# 3.0.0-alpha.4
EPOXY_BASE=https://puter-net.b-cdn.net/epoxy/68c6904
DOTNETFLAGS=--nodereuse:false -v n
AOT?=false
OPT?=false

statics: statics/.ready

statics/.ready:
	mkdir -p statics
	wget -c https://github.com/r58Playz/FNA-WASM-Build/releases/download/$(STATICS_RELEASE)/dotnet-jspi-jit.zip -O statics/dotnet.zip
	wget -c https://github.com/r58Playz/FNA-WASM-Build/releases/download/$(STATICS_RELEASE)/emsdk.zip -O statics/emsdk.zip
	wget -c https://github.com/r58Playz/FNA-WASM-Build/releases/download/$(STATICS_RELEASE)/SDL3.a -O statics/SDL3.a
	wget -c https://github.com/r58Playz/FNA-WASM-Build/releases/download/$(STATICS_RELEASE)/libopenal.a -O statics/libopenal.a
	wget -c https://github.com/r58Playz/IKVM-WASM-Build/releases/download/$(IKVM_RELEASE)/ikvm-wasm-bundle.zip -O statics/ikvm.zip
	wget -c https://github.com/r58Playz/IKVM-WASM-Build/releases/download/$(IKVM_RELEASE)/libglfw3-mt.a -O statics/libglfw3.a
	wget -c https://github.com/r58Playz/IKVM-WASM-Build/releases/download/$(IKVM_RELEASE)/lib_emscripten_glfw3-mt.js -O statics/lib_emscripten_glfw3.js
	wget -c https://github.com/r58Playz/IKVM-WASM-Build/releases/download/$(IKVM_RELEASE)/libwink-mt.a -O statics/libwink.a
	wget -c https://github.com/r58Playz/IKVM-WASM-Build/releases/download/$(IKVM_RELEASE)/libwink_webgpu-mt.a -O statics/libwink_webgpu.a
	wget -c https://github.com/r58Playz/IKVM-WASM-Build/releases/download/$(IKVM_RELEASE)/libwink_tint-mt.a -O statics/libwink_tint.a
	wget -c https://github.com/r58Playz/IKVM-WASM-Build/releases/download/$(IKVM_RELEASE)/wink-js-mt.zip -O statics/wink-js.zip
	wget -c https://github.com/r58Playz/IKVM-WASM-Build/releases/download/$(IKVM_RELEASE)/lwjgl3-mt.jar -O statics/lwjgl3.jar
	wget -c https://github.com/r58Playz/IKVM-WASM-Build/releases/download/$(IKVM_RELEASE)/liblwjgl3-mt.a -O statics/liblwjgl3.a
	wget -c https://github.com/r58Playz/IKVM-WASM-Build/releases/download/$(IKVM_RELEASE)/liblwjgl_stb-mt.a -O statics/liblwjgl_stb.a
	wget -c https://github.com/r58Playz/IKVM-WASM-Build/releases/download/$(IKVM_RELEASE)/libffi-mt.a -O statics/libffi.a
	wget -c $(EPOXY_BASE)/full.js -O statics/epoxy-full.js
	wget -c $(EPOXY_BASE)/full.wasm -O statics/epoxy-full.wasm
	unzip -q -o statics/emsdk.zip -d statics/
	unzip -q -o statics/wink-js.zip -d statics/wink-js/
	touch $@

statics/.unpacked: statics/.ready
	unzip -q -o statics/dotnet.zip -d statics/dotnet
	unzip -q -o statics/ikvm.zip -d statics/ikvm
	touch $@

ikvmc-bundles: statics/.unpacked
	python3 build-ikvmc.py all

deps: statics ikvmc-bundles

build: ikvmc-bundles
	rm -r frontend/public/{_framework,ikvm} loader/bin/Release/net10.0/publish/wwwroot/_framework || true
#
	dotnet publish loader/IkvmWasm.csproj -c Release -p:IkvmWasmEnableAot=$(AOT) -p:IkvmWasmEnableWasmOpt=$(OPT) $(DOTNETFLAGS)
	cp -r loader/bin/Release/net10.0/publish/wwwroot/_framework frontend/public/
	cp -r statics/ikvm/image frontend/public/
	# dotnet messed up
	sed -i 's/this.appendULeb(32768)/this.appendULeb(65535)/' frontend/public/_framework/dotnet.runtime.*.js

serve: build
	cd frontend && pnpm dev

publish: build
	cd frontend && pnpm build

dotnetclean:
	rm -f statics/.unpacked
	rm -rvf statics/dotnet loader/{bin,obj} loader/Generated.targets loader/ikvmc-manifest.g.json || true
ikvmclean:
	rm -f statics/.unpacked
	rm -rvf statics/ikvm {statics,jars}/ikvmc_*.{dll,pdb} {statics,jars}/*.aotprofile {statics,jars}/*.aotprofile.stamp loader/Generated.targets loader/ikvmc-manifest.g.json || true
clean: dotnetclean ikvmclean
	rm -rvf statics || true
