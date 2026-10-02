# MoneyPrinterTurbo 后续 worker 交接 prompt

适配实现基线：`0409020`（2026-10-03）。本文件用于后续维护和迭代；最初迁移已完成，实际验收范围与剩余限制见 `NIMI_ADAPTATION.md` 顶部和 `NIMI_APP.md`。

在 Codex 中选择工作目录 `D:/nimi-realm/nimi-apps/third-party/MoneyPrinterTurbo`，复制下面的 prompt，并补上最后一行的具体任务。

```text
你是 MoneyPrinterTurbo for Nimi 的后续实施 worker。工作目录：
D:/nimi-realm/nimi-apps/third-party/MoneyPrinterTurbo

先读当前 AGENTS.md、package.json、NIMI_APP.md，以及 NIMI_ADAPTATION.md
顶部的当前实施状态。遵循由 App Tools 生成的
.agents/skills/nimi-app-lifecycle/SKILL.md，只读取本次任务需要的场景。
历史审计中的版本、缺口和未验证状态不能覆盖顶部的当前结果。

当前阶段已经完成 Nimi 底座适配，业务代码基线为 0409020。
不要重做 create/init，不恢复原 Streamlit、FastAPI、裸 CLI、Docker、
Python AI provider、Edge TTS 或 Whisper 入口。
AGENTS managed blocks 和 lifecycle skill 继续由正式 App Tools init/sync 管理；
本交接文件是工作说明，不是自定义 skill 或平台产品权威。

已确认产品形态：
- 以 Nimi Desktop 为主，自动化跟随同一 Host。
- App 负责创作参数、生产队列、字幕、素材、剪辑混音、历史和业务账号。
- Nimi 负责模型选择、AI 凭据、模型执行、受保护会话和 App 存储。
- Python/FFmpeg 只执行固定媒体操作，不接收 Nimi 凭据、Runtime 地址或通用转发。
- 不修改 OpenMontage 来证明本项目可用。

开发与验收使用 D:/nimi-realm/nimi 的正式源码入口：
pnpm dev:runtime
pnpm dev:desktop

先复用已有源码环境。需要启动或恢复时使用上述入口，不改走安装版 Runtime/Desktop。
保留原 D:/DataNimi、Desktop userData/origin 和 MPT 开发注册。
在 MPT 根用 pnpm exec nimi-app dev --list-registrations 刷新选择器，
再用 pnpm exec nimi-app dev --resume <当前选择器> 恢复既有注册。
不要把旧选择器写死，也不要用普通 dev 新建注册来掩盖恢复问题。
真实验收连接该次启动报告的准确 MPT CDP target；先用 CDP，
只有 CDP 做不到的操作再使用 Computer Use。直接 Vite 不代表受监督 App 验收。

现有平台输入为完整本地 tarball 和正式 pnpm overrides/lock：
SDK 0.19.0、Kit 0.16.0、native npm 0.16.0、App Tools 0.11.4、
nimi-coding 0.6.3。共享修复基线到 Nimi main 的 64fec5bef；
具体包来源及后续变更以当前文档、lock 和实际构建为准。
同版本号不代表同源二进制；不用源码目录链接替代完整包。
后续更换平台组合时按 lifecycle upgrade 指南处理，复用仍适用的检查结果。

已经实际运行的代表路径包括：
主题→脚本→配音→真实逐词时间轴→AI 图片→成片；
三种画幅、上传/无配音、批量与阶段结果、字幕校对、预览复用；
55秒音频分块转写、VoxCPM2独立身份/演绎参考；
本地改写、关键词和素材描述排序；
Host Integration 创建/分页查询/取消/分块取回真实成片；
配置改变、失效会话、Host中断与重开后的暂停；
长音乐裁剪、短本地音乐循环及包内 Python/FFmpeg 渲染。

保留已知限制：
视频条件配乐缺少所需 ElevenLabs 凭据，实际模型路径 NOT-VERIFIED；
库存/Upload-Post 账号为空，相应外部路径未实跑；
AI 视频、声音创建等未跑的付费路径以当前报告为准；
安装、macOS、Registry 和公开发布不属于已通过范围。
沿用用户的费用限制，优先已有产物和本地资源，不自行购买收费服务。
本轮采用原有视频配乐流程；“视频理解→音乐规划→音乐模型”的新业务链
属于后续产品迭代，只有具体任务包含它时才实施。
普通 prompt 音乐不能冒充音乐模型实际接收了成片视频。

后续变更继续守住这些行为：
- 字幕来自真实 transcription.words，分块偏移只加一次，不伪造时间轴。
- 已确认的文字响应和媒体可以复用；不确定提交不自动重新计费。
- 不把 music 的 submission lookup 扩展为所有模型操作的恢复保证。
- 配置或会话改变后，不让旧任务迟到写入新 scope；重连不重放业务队列。
- 自动化使用当前 moneyprinterturbo.production.v1 的声明；
  list 返回分页摘要，asset 只读取该任务的已保存产物。
  结果按 UTF-8 字节有界，失败走正式失败通道，回调失败不重放业务写操作。
- 模型生成的原始时长、终止原因和资产保持真实；剪辑混音属于 App。
- 共享能力缺口在正确的 Runtime/SDK/Kit/App Tools owner 修复，
  不在 App 按 provider/model 名称硬编码或增加 AI REST 旁路。
  进入 Nimi 仓时遵循其 AGENTS 和 nimi-app-runtime-evolution skill。

默认在当前 nimi 分支工作，保留无关修改。按具体风险选择现有检查：
pnpm exec nimi-app check
pnpm exec nimi-app test
构建/打包仅在受影响时运行当前 package.json 和 lifecycle 指南中的正式命令。
实际产品路径与单元测试分别报告。不要为已有充分证据的事实新增 receipt、
证明账本或重复全量检查；也不能用局部检查代替受影响的真实旅程。

自主推进到本次具体目标完成。仅在需要审计/验收的完整检查点集中提交结果，
不逐条向 manager 或其他会话发送进度。不自动 push、tag、发布或社交上传。
更新现有 NIMI_ADAPTATION.md/NIMI_APP.md 的当前状态，保存本地 Git checkpoint，
说明代码变化、真实结果和精确的 NOT-VERIFIED 项。

本次具体任务：<在这里填写维护、修复或迭代目标>
```
