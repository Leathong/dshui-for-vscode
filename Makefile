# dshui-for-vscode 编译部署流程
#
#   make            完整部署（默认目标）：编译 → 打包 vsix → 覆盖安装
#   make deploy     同上
#   make package    只重新打包 vsix（内部先跑 vscode:prepublish：compile + copy:clients）
#   make install    打包并覆盖安装
#   make compile    只编译 TypeScript 到 out/
#   make sync       快速同步运行产物到已安装副本（改 src/*.ts / dshui-plugins/ 后免打包）
#   make login      登录 VS Code 市场（发布前一次性操作，或导出 VSCE_PAT 代替）
#   make publish    发布到 VS Code 市场（默认不递增版本，BUMP=... 时递增）
#   make publish-vsix    直接上传当前 vsix（不递增版本）
#   make publish-ovsx    发布到 Open VSX 市场（需 OVSX_TOKEN）
#   make unpublish  从 VS Code 市场下架（危险，需 FORCE=1 确认）
#   make clean      清理 out/ 与 vsix
#   make help       列出目标

# 以下均从 package.json 动态读取，改 publisher/name/version 后无需改 Makefile。
NAME      := $(shell node -p "require('./package.json').name")
VERSION   := $(shell node -p "require('./package.json').version")
PUBLISHER := $(shell node -p "require('./package.json').publisher")
VSIX      := $(NAME)-$(VERSION).vsix
EXT_ID    := $(PUBLISHER).$(NAME)
EXT_DIR   := $(HOME)/.vscode/extensions/$(EXT_ID)-$(VERSION)

# vsce 工具：优先用全局安装的 vsce；否则退回 npx（首次自动下载）。
# npx 的下载缓存独立放在 VSCE_CACHE（默认 ~/.cache/dshui-vsce），
# 不写入 ~/.npm，互不干扰；需要时可用 make package VSCE_CACHE=... 覆盖。
VSCE_CACHE ?= $(HOME)/.cache/dshui-vsce
VSCE      ?= $(shell command -v vsce 2>/dev/null || echo "npx --cache $(VSCE_CACHE) --yes @vscode/vsce")
OVSX      ?= $(shell command -v ovsx 2>/dev/null || echo "npx --cache $(VSCE_CACHE) --yes ovsx")

# 发布相关参数（均可通过命令行覆盖：make publish BUMP=minor VSCE_PAT=...）
BUMP      ?=                   # 非空（patch|minor|major）才递增版本；默认空 = 不递增，直接发布当前版本
NO_GIT_TAG ?=                  # 非空则跳过 git 提交与 tag（工作树不干净时用）
SKIP_DUPLICATE ?=              # 非空则版本已存在于市场时静默跳过（--skip-duplicate）
AZURE     ?=                   # 非空则用 Microsoft Entra ID 认证（--azure-credential），与 VSCE_PAT 互斥。
                               # 需已 az login（或用 AZURE_CLIENT_ID/AZURE_TENANT_ID/AZURE_FEDERATED_TOKEN_FILE
                               # 环境变量走工作负载身份），且该身份是市场 publisher 的 Contributor 成员。

# 认证参数拼接：AZURE=1 → --azure-credential；否则 VSCE_PAT 非空 → --pat。
AUTH_FLAG := $(if $(AZURE),--azure-credential,$(if $(VSCE_PAT),--pat '$(VSCE_PAT)',))

.PHONY: all deploy package install compile sync clean help \
        login verify-pat publish publish-vsix publish-ovsx unpublish

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

# ---- 发布到市场 ----
# 首次发布前先 make login（会要求输入 Azure DevOps PAT），或直接导出 VSCE_PAT。
# PAT 需对 $(PUBLISHER) 拥有 Marketplace → Manage 权限，获取方式见：
#   https://code.visualstudio.com/api/working-with-extensions/publishing-extension
login:
	$(VSCE) login $(PUBLISHER)

# 校验认证是否有效：默认用已存储凭据；VSCE_PAT=xxx 用临时 PAT；AZURE=1 用 Entra ID 身份。
# 发布前先跑一次，避免发布时才撞上过期 token / 身份权限问题。
verify-pat:
	$(VSCE) verify-pat $(PUBLISHER) $(AUTH_FLAG)

# 发布到 VS Code 市场：默认不递增版本，直接打包并发布当前 package.json 版本。
# 需要递增时显式指定 BUMP=patch|minor|major，vsce 会先递增 package.json 版本、
# 执行 vscode:prepublish 打包、再上传。递增时工作树不干净导致 npm version 报错，
# 可加 NO_GIT_TAG=1 跳过 git 提交与 tag。
publish:
	$(VSCE) publish $(if $(BUMP),$(BUMP),) \
		$(if $(NO_GIT_TAG),--no-git-tag-version) \
		$(if $(SKIP_DUPLICATE),--skip-duplicate) \
		$(AUTH_FLAG)

# 直接上传已打包好的 $(VSIX)，不递增版本（版本需尚未发布；重复时报错，
# 可加 SKIP_DUPLICATE=1 容忍）。
publish-vsix: package
	$(VSCE) publish --packagePath $(VSIX) \
		$(if $(SKIP_DUPLICATE),--skip-duplicate) \
		$(AUTH_FLAG)

# 发布到 Open VSX 市场（open-vsx.org），需要 OVSX_TOKEN 环境变量。
publish-ovsx: package
	@test -n "$(OVSX_TOKEN)" || (echo "错误：需要 OVSX_TOKEN（Open VSX 访问令牌）" && exit 1)
	$(OVSX) publish $(VSIX) -p $(OVSX_TOKEN)

# 从 VS Code 市场下架，不可撤销，需显式 FORCE=1 确认。
unpublish:
	@test "$(FORCE)" = "1" || (echo "危险：将下架 $(EXT_ID)，不可撤销。确认请用 FORCE=1 make unpublish" && exit 1)
	$(VSCE) unpublish $(EXT_ID) $(AUTH_FLAG)

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
	@echo "  make login      登录 VS Code 市场（发布前一次性操作，或导出 VSCE_PAT）"
	@echo "  make verify-pat 校验认证是否有效（PAT 或 AZURE=1 的 Entra ID 身份）"
	@echo "  make publish    发布到 VS Code 市场（默认不递增版本，BUMP=patch|minor|major 时递增）"
	@echo "                  认证：默认已存 PAT；VSCE_PAT=xxx 临时 PAT；AZURE=1 用 Entra ID"
	@echo "  make publish-vsix   直接上传当前 vsix（不递增版本）"
	@echo "  make publish-ovsx   发布到 Open VSX 市场（需 OVSX_TOKEN）"
	@echo "  make unpublish  从市场下架（危险，需 FORCE=1 确认）"
	@echo "  make clean      清理 out/ 与 vsix"
	@echo "  make help       本帮助"
