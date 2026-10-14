# 0.1.0

MoneyPrinterTurbo迁移到Nimi Desktop监督的Electron Host。React创作界面和App控制器通过Nimi执行AI，Python/FFmpeg负责确定性媒体处理；原独立API、CLI、Docker和Python AI provider入口已退役。

真实核心成片、三种画幅、时间轴字幕、预览复用、阶段结果、批量和Host自动化已有实际运行结果。共享视频条件音乐与独立演绎输入已接入，具体模型、账户和费用限制下的验收范围见NIMI_ADAPTATION.md。

独立身份/演绎参考已通过本地VoxCPM2实际成片。修复长配乐延长音轨、短配乐循环、文字提交恢复、Host自动化分页/回调隔离以及设置保存范围。Windows完整媒体payload已包含实际可执行的Python/FFmpeg worker。

Windows 包使用正式 Nimi 服务所需的 SDK 0.21、Kit/native 0.19.3 和 Electron 44。脚本流会忽略 reasoning-summary 事件，避免将推理摘要当作旁白或提前结束正文。

2026-10-14 发布前检查：类型检查、11 个业务测试和 120 个媒体测试通过。Windows 安装包和公开下载仍在验收；macOS/Linux 未声明为本次发布目标。库存素材与 Upload-Post 的账户依赖路径仍按 NIMI_ADAPTATION.md 保留限制。
