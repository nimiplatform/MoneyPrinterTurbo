# MoneyPrinterTurbo checks

从 App 根目录运行：

```powershell
pnpm exec nimi-app check
pnpm exec nimi-app test
```

直接测试命令由 `.nimi/config/build-profile.yaml` 声明。Node 测试验证时间轴规则、进程失败和发布回执规则；Python `test/media` 验证保留的确定性剪辑/字幕/音频行为，使用隔离 scratch，含真实 FFmpeg 编码与解码检查。测试用的故障注入或 MoviePy 替身只证明对应机制，不是产品产物。

真实验收必须使用 Desktop 监督的准确 MoneyPrinterTurbo Electron target，优先 CDP。UI 操作、完整媒体消费、播放与 FFprobe 的实际范围记录在现有 NIMI_ADAPTATION.md；check/build 或 mock 回归不能代替它。媒体 bundle 在开发 build 中准备，实际包内 Python worker 另行执行媒体任务。

原 Python AI providers、API、CLI 与 WebUI 测试随对应产品入口硬切。Git 保留历史；未为退役入口增加兼容层。
