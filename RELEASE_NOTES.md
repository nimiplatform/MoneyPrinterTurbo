# 0.1.2

优化远程与桌面首用提交流程，并更新正式上线后的随包使用指南。

- 提交流程解耦：点击「制作视频」仅以当前表单快照创建制作任务（`create`），不再隐式写入默认创作参数，避免覆盖电脑端已保存的默认模板，也无需远程客户端在未保存默认参数时预先授予 `studio.settings.save`；点击「保存创作参数」仍显式保存默认配置。
- 首用说明更新：移除 0.1.1 上架前的过渡提示，补充从官网应用页进入托管 Web 的主 Runtime 确认步骤与 Nimi Home「集成」权限清单。
- 商店资料与打包瘦身：升级至 `@nimiplatform/sdk@0.24.0-rc.11`、`@nimiplatform/kit@0.24.0-rc.18`、`@nimiplatform/app-tools@0.16.0-rc.15` 与 Electron 45，主进程采用单文件纯净打包（移除冗余根 `node_modules`）并启用确定性有界 Deflate 压缩，同时补齐 `metadata.storefront` 中英文介绍（`NIMI_APP.md` / `NIMI_APP.en.md`）、分类、标签、亮点及真实产品界面封面与画廊。

# 0.1.1

同步上游 MoneyPrinterTurbo 1.3.10 媒体与创作修复，升级至公开发布的 Nimi App Tools 0.16.0-rc.10、SDK 0.24.0-rc.10、Kit 与 Windows 原生载体 0.24.0-rc.16，并补齐受保护 Web 托管候选与 Android 系统保存能力。

- 合成与媒体管线：合入上游不透明画布逐层局部合成（`OpaqueCompositeVideoClip`）、亚像素平滑放大与静止图片动效选项（`imageMotion`）、相机 EXIF 方向与 CMYK / 16 位灰度 / 双值图安全解码、阿拉伯字母字幕连写整形（`khatt`）、顺序拼接多轮切片覆盖及循环配乐末尾淡出。
- 脚本、配音与库存素材：合成前自动移除表情符号与半/全角停顿标签，脚本清理保留行内 `#` 与 Markdown 链接文本；Pixabay 与 Pexels 优先选取填满画幅的最小分辨率（如 1080p 而非 4K），并在大于 1 倍画面速度时按实际片段覆盖时长准备库存视频。
- Web 与 Android 远程工作区：PC Host 在 `moneyprinterturbo.production.v1` 中提供工作区快照、创作默认项读写、配音预览、字幕校对保存、按源隔离的分块媒体导入与流式读取；业务服务密钥与 Upload-Post 发布保持仅在 PC 执行。Web 与 Android 依赖 PC 端 0.1.1 或更高版本，旧版 Catalog 0.1.0 不包含上述远程工作区操作。

# 0.1.0

MoneyPrinterTurbo 迁移到 Nimi Desktop 监督的 Electron Host。React 创作界面和 App 控制器通过 Nimi 执行 AI，Python/FFmpeg 负责确定性媒体处理；原独立 API、CLI、Docker 和 Python AI provider 入口已退役。

真实核心成片、三种画幅、时间轴字幕、预览复用、阶段结果、批量和 Host 自动化已有实际运行结果。Windows 包使用正式 Nimi 服务所需的 SDK 0.21、Kit/native 0.19.3 和 Electron 44。
