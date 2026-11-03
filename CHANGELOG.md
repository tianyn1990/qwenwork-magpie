# 更新记录

## 0.1.1 — 2026-11-03

- 修复 Magpie 供应商卡片「没有用量」：在 `config.provider[qwenwork-community]` 增加 `usage: true` 标志，使界面渲染用量面板（调用已有的 `auth.usage`）。
- 修复 Magpie 供应商卡片「没有模型」：把内部 `MODELS` 转成 Magpie 模型 schema（`id/name/npm/url/apiId/context/input/output/reasoning/image/tool_call` 等），界面正常显示「千问办公·基础 / 高级」两档位。
- 新增「签到」：`auth.checkin` 复用 `getAccount` + `quotaForMagpie` 重新拉取账号上下文刷新积分余额，等价于千问办公「每日登录送 100 积分」。供应商卡片同步增加 `checkin: true` 标志以显示签到按钮。
- 独立 ID 保持 `qwenwork-community`，不接管官方 `qwenwork` 供应商。

## 0.1.0 — 2026-10-22

- 首个正式发布版本，包含 beta.2 的流式结束标记修复。
- 在隔离网关与临时工作目录中完成真实 Codex CLI → Magpie Responses 转换 → 本插件 → 千问办公验证，返回预期文本；不修改运行中的客户端配置。
- 仓库更名为 `qwenwork-magpie`，让发现页先显示产品名；旧 GitHub 地址保留重定向。
- 增加绿色 Q 图标和中文简介，图标通过 `magpie.icon` 内嵌，发现页与供应商列表无需额外下载图标。
- 图形安装、检查更新与 `release` 发布分支继续支持；安装包名和 `qwenwork-community` 供应商标识不变。
- Windows/Linux 真实客户端、令牌到期刷新、具体扣分金额和跨供应商旧会话仍按兼容性文档列明范围。

## 0.1.0-beta.2 — 2026-10-22

- 修复真实请求完成后误报「千问办公响应缺少 choices 或 usage」：识别响应信封内的 `[DONE]`，不再把后续耗时统计当作模型事件。
- 保留完成标记校验；截断回答和结束前的上游错误仍会报告失败。
- 新增流式与非流式回归测试，覆盖上游结束标记、统计尾帧、提前结束和结束前错误。
- 使用现有插件授权完成真实基础档回答、高级档流式工具调用及工具结果回传验证；不刷新令牌、不修改已安装插件或客户端配置。
- 默认推荐 Magpie 界面的 GitHub 安装和更新，提供 `release` 分支；补充文件夹选择器安装，无需运行 `.command`。首次登录、刷新、扣分金额与旧会话切换仍未完整验收，继续作为 beta 发布。

## 0.1.0-beta.1 — 2026-10-22

- 首次发布独立千问办公供应商插件，标识 `qwenwork-community`。
- 浏览器独立授权、刷新和办公积分查询；不导入 App 登录文件。
- 从本机官方 App 加载签名 WASM，不分发该二进制。
- 支持 Chat Completions、工具调用、图片消息和额度错误归一化。
- 提供 macOS/Linux/Windows 安装脚本、固定目录升级及文件回滚。
- 提供离线测试、隔离宿主验证入口、校验和与 GitHub Release 工作流。
- 真实账号授权、真实推理、积分扣减和跨供应商旧会话接续尚未验收，因此标为 beta。
