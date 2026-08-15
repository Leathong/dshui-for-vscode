# dshui-for-vscode 编译部署流程
#
#   make            完整部署（默认目标）：编译 → 打包 vsix → 覆盖安装
#   make deploy     同上
#   make package    只重新打包 vsix（内部先跑 vscode:prepublish：compile + copy:clients）
#   make install    打包并覆盖安装
#   make compile    只编译 TypeScript 到 out/
#   make sync       快速同步运行产物到已安装副本（改 src/*.ts / dshui-plugins/ 后免打包）
#   make clean      清理 out/ 与 vsix
#   make help       列出目标

VERSION := $(shell node -p "require('./package.json').version")
VSIX    := dshui-for-vscode-$(VERSION).vsix
EXT_ID  := dshui.dshui-for-vscode
EXT_DIR := $(HOME)/.vscode/extensions/$(EXT_ID)-$(VERSION)

# vsce 工具：优先用全局安装的 vsce；否则退回 npx（首次自动下载）。
# npx 的下载缓存独立放在 VSCE_CACHE（默认 ~/.cache/dshui-vsce），
# 不写入 ~/.npm，互不干扰；需要时可用 make package VSCE_CACHE=... 覆盖。
VSCE_CACHE ?= $(HOME)/.cache/dshui-vsce
VSCE      ?= $(shell command -v vsce 2>/dev/null || echo "npx --cache $(VSCE_CACHE) --yes @vscode/vsce")

.PHONY: all deploy package install compile sync clean help

all: deploy

compile:
	npm run compile

# vsce package 内部会先执行 vscode:prepublish（compile + copy:clients），
# 因此打包无需显式依赖 compile（见 `Executing prepublish script` 输出）。
package:
	$(VSCE) package -o $(VSIX)

install: package
	# 注意：--install-extension 后必须紧跟文件名，--force 放前面会被 CLI
	# 当成独立布尔参数，导致「requires a non empty value」。
	code --install-extension $(VSIX) --force

deploy: install
	@echo ""
	@echo "已安装 $(VSIX)。重载窗口使新版本生效：Cmd+Shift+P → Developer: Reload Window"

# 开发期快速同步：把运行产物拷入已安装副本，免重新打包 vsix。
# 同步内容：out/（扩展主程序）、dshui-plugins/（host 插件 + 客户端 bundle）、
# patch.yml、media/、package.json。依赖变更（npm install）后请改用 make deploy 完整重装。
sync: compile
	@test -d "$(EXT_DIR)" || (echo "错误：未找到已安装副本 $(EXT_DIR)，请先 make install" && exit 1)
	@DEST="$(EXT_DIR)" && \
	echo "同步到 $$DEST ..." && \
	rm -rf "$$DEST/out" "$$DEST/dshui-plugins" && \
	cp -R out "$$DEST/out" && \
	cp -R dshui-plugins "$$DEST/dshui-plugins" && \
	cp -R media "$$DEST/media" && \
	cp package.json patch.yml "$$DEST/" && \
	echo "同步完成。重载窗口（Developer: Reload Window）使改动生效。"

clean:
	rm -rf out $(VSIX)

help:
	@echo "dshui-for-vscode 编译部署："
	@echo "  make            完整部署（编译 → 打包 vsix → 覆盖安装）"
	@echo "  make deploy     同上"
	@echo "  make package    只重新打包 vsix"
	@echo "  make install    打包并覆盖安装"
	@echo "  make compile    只编译 TypeScript"
	@echo "  make sync       快速同步运行产物到已安装副本（免打包）"
	@echo "  make clean      清理 out/ 与 vsix"
	@echo "  make help       本帮助"
