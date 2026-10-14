# MoneyPrinterTurbo for Nimi

在 Nimi Desktop 中制作短视频：输入主题或手工脚本，选画面与配音，得到 MP4、真实时间轴字幕和可检查的阶段产物。AI 资源、模型选择与 AI 凭据由 Nimi 管理；素材服务和 Upload-Post 业务账号由本 App 管理。

## 当前可用范围

2026-10-14 正式交付：[0.1.0](https://github.com/nimiplatform/MoneyPrinterTurbo/releases/tag/v0.1.0) 的 tag 工作流、provenance 与不可变 Release 已成功，依赖为 SDK 0.21.0、Kit/native 0.19.3、App Tools 0.12.0 和 Electron 44。Windows 构建、生产格式打包、类型检查、11 个业务测试与 120 个媒体测试通过。Python/uv 初始化已纳入项目脚本，CI 不再依赖作者机的现成环境。正式包已下载并核对摘要，通过 Home 本地导入、启动至创作界面并连接 Nimi Host；安装版已完成 Deepseek 脚本、Qwen3 TTS Flash / Cherry 配音、Whisper 逐词转写、两条字幕和 9:16 成片；5.20 秒 MP4 播放到结尾，FFprobe 核对为 1080×1920、30 fps、H.264/AAC，正常关闭后从 Home 重开仍可读取结果。MiMo 限流、本机 VoxCPM2 未配置和动态声音占位项的限制见 NIMI_ADAPTATION.md。[Registry PR 104](https://github.com/nimiplatform/nimi-app-registry/pull/104) 已按用户明确批准完成 Windows x86_64 / stable 准入，最终检查与 Registry main 校验通过。Catalog 已显示该版本并开始下载；尚未声明 Catalog 安装与业务验收通过。

Windows x86_64 开发 App 已由 Desktop 监督运行。已实际完成主题生成脚本、自动配音、带真实 words 的转写、AI 图片素材和 9:16 成片；另完成 16:9 无配音两条批量、1:1 图片/视频混合素材与上传配音、逐词字幕及弹跳动效。实际输出均可通过受控资产 URL 播放，媒体参数由 FFprobe 核对。完整配音预览、script/audio/subtitle 阶段结果、字幕校对及复用音频/时间轴重新成片也已运行。完整预览复用已核对无新增 TTS Job，实际音频字节和时长一致；55秒上传音频已运行两段真实转写，保留原始结果，offset只加一次。

创作页提供脚本改写、关键词顺序、画幅、速度、fit、转场、句级/逐词字幕与样式、批量及 stop_at。记录页保留参数、原始转写、words、SRT、素材、配音、成片和 Job ID。重开时未完成队列暂停，只有明确继续才恢复业务调度；无 ID 的不确定提交不会盲目重做。

本地 VoxCPM2 已实际使用独立的声音身份音频与演绎音频/逐字稿，完成配音和方形成片；30字试听也已完成。脚本改写、自动关键词、同空间素材匹配与各 stop_at 阶段均已运行。本地配乐已混入实际视频，并修复长音乐把成片音轨延长的问题。

Host 自动化已实际完成创建、查询、分页、取回完整成片，以及停止排队和正在渲染的任务。当前 provider 为 `moneyprinterturbo.production.v1`，使用方法见 [Host 操作指南](docs/skill/SKILL.md)。Pexels/Pixabay/Coverr、Nimi AI 视频、通用 voice-create 后再合成、AI 配乐和 Upload-Post 已实现对应消费者，具体外部路径仍有 NOT-VERIFIED 项。视频条件配乐与独立演绎所选资源需明确支持；不能以普通音乐或声音克隆替代。准确状态见 [NIMI_ADAPTATION.md](NIMI_ADAPTATION.md)。

## 使用条件

从 Nimi Desktop 启动本 App，并在 App 的「AI 配置」选择任务所需资源。自动字幕需支持实际逐词对齐的转写资源；普通文字转写不够。手工脚本会跳过脚本生成，上传配音会跳过 TTS，无配音使用指定时长的静音轨。所选 Nimi 资源仍可能拒绝不支持的生成参数。

库存素材需要在「业务设置」填写对应服务账号。上传音乐与本地素材可独立使用。Upload-Post 与制作结果分别记录，只有核对文案、平台、业务账号并明确确认后才提交发布；本次开发尚未向社交平台上传。

首屏制作按钮显示当前画幅、批量和结束阶段。「保存创作参数」只保存创作输入；「保存业务设置」只保存业务账户和平台选择；AI 配置使用其自身保存动作。配置在任务中改变时，任务会暂停，已返回的原始结果保留；失效会话和重开不会自动重放未完成任务。

重要项目与资产保存在 Nimi 声明的 App JSON/asset 存储中，使用当前注册/账户 scope。Host profile、scratch 和持久项目分开；项目不写入源码根 storage 或安装目录。不同开发注册不是同一项目存储，继续既有数据须使用 Desktop 当前提供的 registration selector，不能靠 App ID 猜测恢复。

## 开发

Node 24、pnpm 10.34.5；媒体开发与 Windows bundle 使用 Python 3.14.4、锁定 media wheels、FFmpeg/FFprobe 9.0.1 和 Noto Sans CJK SC。平台依赖使用正式发布的 SDK 0.21.0、Kit/native 0.18.1、App Tools 0.11.4、Nimi Coding 0.6.5 与 Electron 44，由 lock 固定 registry 解析，不需要外部平台归档或 Nimi 源码目录依赖。

```powershell
pnpm install --frozen-lockfile
pnpm run media:prepare
pnpm exec nimi-app check
pnpm exec nimi-app test
pnpm run dev
```

`media:prepare` 准备真实开发工具和独立 Windows 媒体 bundle；编译成功不说明整个 App 包验收完成。使用正式 Desktop-supervised Electron，直接 Vite/Streamlit 或另一 App 不能代验。

正式开发 skill 与 managed AGENTS block 由 App Tools init/sync 管理。上游 docs/skill 属于产品操作指南，不是开发指令入口。原 Python provider/key/base_url、Edge TTS、本地 Whisper 与独立裸 CLI 不属于最终 Nimi 产品入口；相关源码、依赖、配置模板与 active 操作入口已硬切，历史由 Git 保存。

## Support

失败时先停止任务，保存任务 ID、阶段、Job ID 与错误信息。检查已保存产物和原 Job 后，再决定明确继续或创建新任务。技术会话恢复不会自动重放队列；「停止调度」与「确认 Runtime/媒体进程取消」分别报告。不要提交业务密钥或用户原始媒体作为公开诊断。

问题反馈：[本 fork Issues](https://github.com/nimiplatform/MoneyPrinterTurbo/issues)。

App identity 为 moneyprinterturbo.studio，开发版本 0.1.0；上游 Python 1.3.7 是独立版本。源自 [harry0703/MoneyPrinterTurbo](https://github.com/harry0703/MoneyPrinterTurbo)，保留 MIT LICENSE。

Windows 0.1.0 完整 Electron payload 已完成最终构建。实际包内 Python/FFmpeg 已渲染约9.93秒、1080×1080、带中文/动效字幕、配音和循环配乐的MP4；包内使用锁定依赖和Noto字体。工程包不代替安装验收。当前受保护 App 验收环境通过 Nimi 主仓的 `pnpm dev:runtime` 和 `pnpm dev:desktop` 运行，保留原 `D:/DataNimi`、Desktop origin 与 MPT 注册。

本轮不切换安装包环境、不发布。安装、macOS arm64、Registry admission 和公开发布均 NOT-VERIFIED。视频条件配乐缺 ElevenLabs API key；按用户的费用限制，保留实现并标记真实模型路径 NOT-VERIFIED，不以普通 prompt 音乐替代。库存和 Upload-Post 业务账户为空，相应外部路径未实跑。
