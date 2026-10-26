# dshui-for-vscode 编译部署流程
#
#   make            完整部署（默认目标）：编译 → 打包 vsix → 覆盖安装
#   make deploy     同上
#   make package    只重新打包 vsix（内部先跑 vscode:prepublish：compile + copy:clients + sync:dsh）
#   make install    打包并覆盖安装
#   make compile    只编译 TypeScript 到 out/
#   make dsh-build  （推荐首次）从 dsh 源码构建 .dsh-src（clone+切基提交+套补丁+install+build）
#   make dsh-apply-patch  （子步骤）只准备 .dsh-src 检出并套补丁；RESET=1 可重置到基提交重套
#   make dsh-gen-patch （漂移后）重新导出 patches/dshui-bundles.patch
#   make sync-dsh   （可选）从 .dsh-src 构建产物同步 @deepseek-ai/* 到 node_modules
#   make sync       快速同步运行产物到已安装副本（改 src/*.ts / dshui-plugins/ 后免打包）
#   make login      登录 VS Code 市场（发布前一次性操作，或导出 VSCE_PAT 代替）
#   make publish    发布到 VS Code 市场（默认不递增版本，BUMP=... 时递增）
#   make publish-vsix    直接上传当前 vsix（不递增版本）
#   make publish-ovsx    发布到 Open VSX 市场（需 OVSX_TOKEN）
#   make release    发布 vsix 到 GitHub Release（需 gh CLI 已登录）
#   make unpublish  从 VS Code 市场下架（危险，需 FORCE=1 确认）
#   make clean      清理 out/ 与 vsix
#   make help       列出目标
#
# 依赖说明：扩展的 @deepseek-ai/* 运行时不再从 npm 下载，而是由 .dsh-src 源码构建产物
# 填充（scripts/sync-dsh.mjs）。打包（vsce 的 vscode:prepublish）会自动跑 sync:dsh；
# 手动 npm install 后 postinstall 也会跑一次，故开发机需先 clone 并构建 .dsh-src
# （可直接 make dsh-build 一键完成；仅同步已构建产物用 make sync-dsh）。
# 闭包用到的第三方依赖必须出现在根 package.json 的 dependencies 里（sync-dsh 清空了
# @deepseek-ai/* 的依赖表，只有根清单能安装它们）：sync-dsh（preinstall）校验声明，
# make verify-deps 连已安装版本一起校验，vscode:prepublish 打包前必跑。

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

# GitHub Release 相关参数（均可覆盖：make release GH_TAG=v0.2.0 GH_REPO=owner/repo）
# GH_TAG：发布使用的 git tag / release 名；GH_REPO：非空则指定目标仓库（默认取 git origin）。
GH_TAG    ?= v$(VERSION)
GH_REPO   ?=

.PHONY: all deploy package install compile dsh-build dsh-apply-patch dsh-gen-patch sync-dsh \
        verify-deps sync clean help login verify-pat publish publish-vsix publish-ovsx release unpublish

all: deploy

compile:
	npm run compile

# ---- dsh 源码构建 ----
# .dsh-src 是 deepseek-harness 的上游源码检出（不入库），扩展的 @deepseek-ai/* 运行时由它
# 源码构建产物填充（见 scripts/sync-dsh.mjs 与 patches/README.md）。以下变量均可覆盖。
# 注意：值后不要跟内联注释（make 会把 # 前的空格算进值里），注释一律放上一行。
# DSH_SRC  — 上游源码检出目录
DSH_SRC ?= .dsh-src
# DSH_REPO  — 上游仓库
DSH_REPO ?= https://github.com/deepseek-ai/deepseek-harness.git
# DSH_BASE  — 锁定基提交（来自 patches/README.md，不能漂移，漂移会导致补丁无法套用）
# 当前为 dsh 0.2.1-rc.3 的发布合并提交（tag dsh-v0.2.1-rc.3）。换基升级后必须同步改这里，
# 否则 dsh-gen-patch 会把「上一版基提交 → 新版」的全部上游差异一并导出（曾导出过 3447 文件
# / 15 MB 的整版快照），补丁随即不可用。
DSH_BASE ?= 1f81c047fc48fa190a683e469daa699857e9afe8
# DSH_PATCH — dshui 未归档改动（client bundle + host 运行时）
DSH_PATCH := patches/dshui-bundles.patch
# DSH_PNPM — 包管理器，需要 pnpm 11.7.0、Node ^22.19 || >=24
DSH_PNPM ?= pnpm
# 客户端公共构建值。dsh 只有经 scripts/build.ts 调用时才会注入 DSH_CLIENT_*；这里直接
# 调 tsdown / vite，必须自己传入。缺了它 process.env 会被定义成 {}，产物里的
# process.env.DSH_CLIENT_VERSION 变成 undefined，账号登录等客户端功能会以
# "client build carries no DSH_CLIENT_VERSION" 失败（界面提示“操作未完成，请重试”）。
DSH_CLIENT_VERSION ?= $(shell node -p "require('./$(DSH_SRC)/package.json').version")
DSH_CLIENT_COMMIT_HASH ?= $(shell git -C $(DSH_SRC) rev-parse HEAD 2>/dev/null | cut -c1-7)
DSH_CLIENT_ENV := DSH_CLIENT_VERSION=$(DSH_CLIENT_VERSION) DSH_CLIENT_COMMIT_HASH=$(DSH_CLIENT_COMMIT_HASH)

# 从 dsh 源码全新构建：clone/切基提交/套补丁 → pnpm install → build host+client+web →
# gen-client-catalog（槽目录）→ copy-clients（客户端 bundle 拷入 dshui-plugins/）→
# sync-dsh（@deepseek-ai/* 拷入 node_modules）。之后即可 make package / make deploy 打包安装。
# build:web 不能漏：浏览器 shell 里打包了客户端插件 require 的共享模块（react / ui-slots /
# ui-primitives …），漏掉它会让新版客户端插件全部加载失败（Failed to load plugins）。
dsh-build:
	cd $(DSH_SRC) && $(DSH_PNPM) clean && $(DSH_PNPM) install
	cd $(DSH_SRC) && $(DSH_CLIENT_ENV) $(DSH_PNPM) run build:lib:host
	# gen-client-catalog 必须排在 build:lib:client 之前：它重写的 slot-catalog.ts 是
	# cordis-client-runner 的浏览器产物输入（运行时「槽目录」数据），生成后再构建才进得去。
	cd $(DSH_SRC) && $(DSH_PNPM) run gen-client-catalog
	cd $(DSH_SRC) && $(DSH_CLIENT_ENV) $(DSH_PNPM) run build:lib:client
	cd $(DSH_SRC) && $(DSH_CLIENT_ENV) $(DSH_PNPM) run build:web
	@if grep -rqs '{}[.]DSH_CLIENT_VERSION' $(DSH_SRC)/packages/client/*/lib/client.js; then \
		echo "错误：客户端构建未注入 DSH_CLIENT_VERSION（产物仍含 {}.DSH_CLIENT_VERSION），账号登录会失败"; \
		exit 1; \
	fi
	npm run sync:dsh
	node scripts/copy-clients.mjs
	@echo ""
	@echo "dsh 源码构建完成。现在可 make package（打包 vsix）或 make deploy（打包并安装）。"

# 准备 .dsh-src 检出并切到锁定基提交、套用补丁。
# 默认：若已存在则复用且不重置（避免破坏本地改动）；新检出或 RESET=1 时重置到基提交并重套补丁。
dsh-apply-patch:
	@NEED_SETUP=""; \
	if [ ! -d "$(DSH_SRC)/.git" ]; then \
		echo "clone $(DSH_REPO) -> $(DSH_SRC) ..."; \
		git clone $(DSH_REPO) $(DSH_SRC); \
		NEED_SETUP=1; \
	fi; \
	if [ -n "$$NEED_SETUP" ] || [ -n "$(RESET)" ]; then \
		echo "切换到基提交 $(DSH_BASE) ..."; \
		cd $(DSH_SRC) && git fetch origin $(DSH_BASE) && git checkout FETCH_HEAD && \
		if git apply --binary --reverse --check ../$(DSH_PATCH) 2>/dev/null; then \
			echo "补丁已套用，跳过"; \
		elif git apply --binary --check ../$(DSH_PATCH) 2>/dev/null; then \
			git apply --binary ../$(DSH_PATCH) && echo "补丁已套用"; \
		else \
			echo "错误：补丁无法套用（基提交已漂移？请参照 patches/README.md 重基）"; \
			exit 1; \
		fi; \
	else \
		echo "复用已有 $(DSH_SRC)（未重置）；若需重置到基提交并重套补丁：make dsh-apply-patch RESET=1"; \
	fi

# 重做（重新导出）patch：直接相对基提交 $(DSH_BASE) 导出 .dsh-src 之上的改动并覆盖 patches/dshui-bundles.patch。
# 由于「从基提交导出」，已提交或未提交的改动都能导出，无需先重置回基提交，也不用改动必须未提交。
# 适用：上游基提交漂移后，按 README「跟随 dsh 版本升级」手动逐个重套补丁，需要把改动固化回补丁文件。
# 前置：.dsh-src 检出在锁定基提交之上（相对 $(DSH_BASE) 存在改动；HEAD 可领先基提交）。
# --binary 不可省略：0.1.7-rc.2 起的上游快照含 PNG/ICO 等二进制资产，普通 git diff 只会写下
# 「Binary files ... differ」占位（不含内容），git apply 遇到就整体报
# 「cannot apply binary patch ... without full index line」并拒绝套用。dshui 自身的改动目前全是文本，
# 但只要基提交里含二进制新增就会踩中，所以导出时一律带 --binary。
#
# 实现注意：全程用 `git -C $(DSH_SRC)` + 绝对输出路径，不写 `cd $(DSH_SRC) && … > "../$(DSH_PATCH)"`。
# 后者曾在花括号组内改变工作目录，导致后续 `$$(cd $(DSH_SRC) && …)` 在 .dsh-src 里再找 .dsh-src 而失败；
# 更糟的是那句末尾的重定向在 cd 失败时会把 $(DSH_PATCH) 截断成空文件。
dsh-gen-patch:
	@test -d "$(DSH_SRC)/.git" || (echo "错误：未找到 $(DSH_SRC)，请先 make dsh-apply-patch" && exit 1)
	@if [ -z "$$(git -C $(DSH_SRC) diff --stat $(DSH_BASE))" ]; then \
		echo "错误：$(DSH_SRC) 相对基提交 $(DSH_BASE) 没有改动，无法重新导出。"; \
		echo "（请确认 .dsh-src 检出在基提交之上，且已套上 dshui 改动）"; \
		exit 1; \
	fi
	@{ \
		echo "备份现有 $(DSH_PATCH) -> $(DSH_PATCH).bak ..."; \
		cp $(DSH_PATCH) $(DSH_PATCH).bak; \
		echo "导出 $(DSH_PATCH)（相对基提交 $(DSH_BASE)，含 --binary）..."; \
		git -C $(DSH_SRC) diff --binary $(DSH_BASE) > "$(CURDIR)/$(DSH_PATCH)"; \
	}; \
	echo "已重新导出 $(DSH_PATCH)：$$(git -C $(DSH_SRC) diff --stat $(DSH_BASE) | tail -1)"; \
	echo "提示：旧补丁备份在 $(DSH_PATCH).bak；可运行 make dsh-apply-patch RESET=1 验证新补丁能干净套用，确认后删除备份。"

# 从 .dsh-src 构建产物同步 @deepseek-ai/* 到 node_modules（源码编译，非 npm）。
# 注意目标名用 sync-dsh（冒号在 make 里是保留字）；npm script 名仍是 sync:dsh。
sync-dsh:
	npm run sync:dsh

# 校验根 package.json 覆盖了 dsh 运行时闭包的第三方依赖，且已安装版本不低于上游要求。
verify-deps:
	npm run verify:deps

# vsce package 内部会先执行 vscode:prepublish（compile + copy:clients），
# 因此打包无需显式依赖 compile（见 `Executing prepublish script` 输出）。
package:
	$(VSCE) package -o $(VSIX)

install: package
	# 注意：--install-extension 后必须紧跟文件名，--force 放前面会被 CLI
	# 当成独立布尔参数，导致「requires a non empty value」。
	code --install-extension $(VSIX) --force
	@# dsh ≤ 0.1.5 的 link backend 会在 $$DSH_HOME/profiles/node_modules 留下指向
	@# 上一版扩展的软链：指向旧版的可用软链会遮蔽新版的包，悬空软链则直接解析失败
	@# （0.1.5 宿主 + 0.1.7 客户端 bundle 混装时表现为 "Failed to load plugins"）。
	@# dsh 0.1.7 不再维护这些投射，装完清一次；失败不阻断安装。
	-node scripts/clean-profile-links.mjs

deploy: install
	@echo ""
	@echo "已安装 $(VSIX) 并清理了旧的 profile 软链。重载窗口使新版本生效：Cmd+Shift+P → Developer: Reload Window"

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

# 发布 vsix 到 GitHub Release：tag 对应的 release 不存在则创建，已存在则覆盖上传。
# 需要 gh CLI 且已 gh auth login；仓库默认取 git origin，可用 GH_REPO=owner/repo 覆盖。
release: package
	@command -v gh >/dev/null || (echo "错误：需要 GitHub CLI（brew install gh 并 gh auth login）" && exit 1)
	gh release view $(GH_TAG) $(if $(GH_REPO),--repo $(GH_REPO),) >/dev/null 2>&1 || \
		gh release create $(GH_TAG) --title "$(GH_TAG)" --notes "" \
			$(if $(GH_REPO),--repo $(GH_REPO),)
	gh release upload $(GH_TAG) $(VSIX) --clobber $(if $(GH_REPO),--repo $(GH_REPO),)

# 从 VS Code 市场下架，不可撤销，需显式 FORCE=1 确认。
unpublish:
	@test "$(FORCE)" = "1" || (echo "危险：将下架 $(EXT_ID)，不可撤销。确认请用 FORCE=1 make unpublish" && exit 1)
	$(VSCE) unpublish $(EXT_ID) $(AUTH_FLAG)

# 开发期快速同步：把运行产物拷入已安装副本，免重新打包 vsix。
# 同步内容：out/（扩展主程序）、dshui-plugins/（host 插件 + 被替换的 UI 客户端
# bundle）、patch.yml、media/、package.json。注意：node_modules/@deepseek-ai
# 不在同步范围，依赖变更后请改用 make deploy 完整重装。
sync: compile
	@test -d "$(EXT_DIR)" || (echo "错误：未找到已安装副本 $(EXT_DIR)，请先 make install" && exit 1)
	@node scripts/verify-overlay.mjs
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
	@echo "  make dsh-build  从 dsh 源码构建 .dsh-src（clone+切基提交+套补丁+install+build）"
	@echo "  make dsh-apply-patch  （子步骤）准备 .dsh-src 检出并套补丁；RESET=1 重置到基提交重套"
	@echo "  make dsh-gen-patch   （漂移后）从基提交重新导出 patches/dshui-bundles.patch"
	@echo "  make sync-dsh   从 .dsh-src 源码构建产物同步 @deepseek-ai/* 到 node_modules"
	@echo "  make verify-deps 校验根 package.json 覆盖了运行时闭包的第三方依赖"
	@echo "  make sync       快速同步运行产物到已安装副本（免打包）"
	@echo "  make login      登录 VS Code 市场（发布前一次性操作，或导出 VSCE_PAT）"
	@echo "  make verify-pat 校验认证是否有效（PAT 或 AZURE=1 的 Entra ID 身份）"
	@echo "  make publish    发布到 VS Code 市场（默认不递增版本，BUMP=patch|minor|major 时递增）"
	@echo "                  认证：默认已存 PAT；VSCE_PAT=xxx 临时 PAT；AZURE=1 用 Entra ID"
	@echo "  make publish-vsix   直接上传当前 vsix（不递增版本）"
	@echo "  make publish-ovsx   发布到 Open VSX 市场（需 OVSX_TOKEN）"
	@echo "  make release    发布 vsix 到 GitHub Release（需 gh 已登录，GH_TAG/GH_REPO 可覆盖）"
	@echo "  make unpublish  从市场下架（危险，需 FORCE=1 确认）"
	@echo "  make clean      清理 out/ 与 vsix"
	@echo "  make help       本帮助"
