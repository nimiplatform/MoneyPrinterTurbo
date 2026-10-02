---
name: moneyprinterturbo-production
description: Operate the running MoneyPrinterTurbo Host through Nimi Integration.
---

# MoneyPrinterTurbo Host 操作

这是 App 的产品操作指南。开发、安装与升级使用 App Tools 管理的 lifecycle skill。不要安装上游 provider 依赖、索要 AI API key 或调用退役的 CLI。

## 准备

在 Nimi Desktop 启动准确的 MoneyPrinterTurbo App。在 App 的「AI 配置」选择实际可用的能力资源；在「业务设置」填写库存素材或 Upload-Post 账户。通过 Nimi 的 Integration 管理界面授权调用者连接当前 Host 的 `moneyprinterturbo.production.v1` provider。运行中的同一 Host 是自动化入口；没有独立 HTTP 服务。

## 操作

- `list {"limit": 20}`：查询本 Host 的任务摘要，每页最多50条。返回`nextCursor`时，传入`{"cursor":"...","limit":20}`读取下一页；新任务通过重新读取第一页发现。完整时间轴不放在列表中。
- `create {"params": ...}`：提交完整业务参数快照，返回 `taskIds`。参数结构使用本 App 的 `src/production/types.ts`，可从已有任务的 `params` 取回并编辑。保持主题、脚本、素材、配音、字幕、音乐、画幅、批量与 `stopAt` 的真实选择。
- `task {"id": "..."}`：查询原任务，检查状态、错误、已知 Job ID 与资产的返回 `relativePath`。完成后通过`asset`取回实际产物，或在MPT中预览、导出。
- `asset {"id": "...", "name": "final.mp4", "offset": 0, "length": 32768}`：按任务产物白名单读取实际数据，返回base64、现有资产SHA、nextOffset和eof；读取到eof后核对完整字节。调用者不能把MPT的relativePath当作自己App存储中的路径。
- `cancel {"id": "..."}`：停止该任务的 App 调度，终止其媒体工作并请求取消已知 Runtime Job。分别查看停止调度与实际取消结果。

单条详细任务若超过Integration的1 MiB返回上限，调用走正式失败通道（Runtime归一为`PROVIDER_FAILED`），不会记为成功。通过`list`查看摘要，使用`asset`分块读取`script.txt`、`subtitle.srt`、`final.mp4`等已保存产物，或在MPT查看完整任务。回调传递失败不意味着业务未执行，不能据此重新`create`。

调用 `create` 的写操作不支持自动重试。响应不确定时不要盲目重新创建或重新计费。已知 Job ID 查询原任务；只有源码与契约支持的音乐操作使用 submission lookup。Host 重开或会话恢复不会自动重放业务队列；在 App 中检查已保存产物后明确继续或创建新任务。

## 产物与发布

字幕来自真实 typed transcription words，保留原转写与时间轴。素材、音频和视频按返回 `relativePath` 消费，不猜测安装目录或源码 storage 路径。阶段产物并不都代表完整成片。

Upload-Post 在 App 中进行：检查成片、文案、平台、账号与 YouTube 受众/隐私声明，再由用户明确确认提交。此 provider 不提供自动社交发布。提交前保存 request ID 与业务账号；不确定响应只查询原请求。逐平台失败、跳过和 TikTok 送入草稿不能宣布为全部已发布。

实际已验收及 NOT-VERIFIED 路径见 [NIMI_ADAPTATION.md](../../NIMI_ADAPTATION.md)。
