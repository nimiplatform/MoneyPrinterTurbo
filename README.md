# MoneyPrinterTurbo for Nimi

本 fork 在 Nimi Desktop 中制作短视频。输入主题或手工脚本，使用本地、库存或 Nimi AI 素材，选择配音、字幕、配乐与画幅，保存真实 MP4 和阶段产物。

使用条件、已运行范围与开发命令见 [NIMI_APP.md](NIMI_APP.md)；实施与验收状态见 [NIMI_ADAPTATION.md](NIMI_ADAPTATION.md)。Host 自动化操作见 [docs/skill/SKILL.md](docs/skill/SKILL.md)。未运行的条件性路径明确保留 NOT-VERIFIED。

AI 路由、模型和凭据通过 Nimi 配置。Pexels/Pixabay/Coverr 与 Upload-Post 业务账户在 App 中管理。唯一产品入口是 Desktop 监督的 Electron Host；原 Streamlit、独立 API、Docker、裸 Python CLI 与 Python AI provider 已退役。

开发入口是 App Tools 正式生成的 [.agents/skills/nimi-app-lifecycle/SKILL.md](.agents/skills/nimi-app-lifecycle/SKILL.md)。产品操作指南不安装开发依赖、不索要 AI API key，也不调用旧 CLI。

源自 [harry0703/MoneyPrinterTurbo](https://github.com/harry0703/MoneyPrinterTurbo)，保留 MIT [LICENSE](LICENSE)。上游代码与历史由 Git 保存。
