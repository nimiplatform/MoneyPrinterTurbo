# MoneyPrinterTurbo

Enter a topic or paste your own script, choose visuals and narration, and render 1080p short videos with aligned subtitles. You can inspect every stage—script, keywords, voiceover, subtitles, footage, and final MP4—before deciding whether to continue or re-render.

## Create Your First Video

1. Open the app from Nimi Home on a Windows x64 PC, then go to **AI Config** (`AI 配置`) to select local or cloud Nimi resources for script generation, voice synthesis, word-aligned transcription, visuals, or music as needed.
2. Enter a topic to generate a script, or write your own script directly. Pick 9:16, 16:9, or 1:1 1080p output and choose local media, Nimi AI visuals, or a configured stock footage provider.
3. Choose Nimi auto narration, uploaded audio, or no narration, and adjust image motion (smooth zoom or static), transitions, subtitle style, background music, batch variants, and stop-at stage.
4. Inspect stage artifacts and subtitles, proofread cues to re-render with existing audio if needed, preview the finished clip, and open or save your MP4 and SRT files.

Providing a manual script skips script generation, and uploading narration skips speech synthesis. Before auto narration runs, emojis and pause markers (such as `[pause: 2s]` or `（停顿2秒）`) are stripped so they are not spoken aloud. Word-by-word subtitles require a transcription resource that outputs real word timestamps; plain text transcription cannot substitute. Arabic-script subtitles automatically apply ligature shaping and right-to-left layout. Independent voice performance references and video-conditioned music require a selected Nimi resource that explicitly supports those inputs and are never silently replaced with plain voice cloning or text-only music. The current native desktop package targets Windows x64, and the in-app workspace interface is currently in Chinese.

## Using from Web or Android

Connecting remotely from Web or Android to your PC workspace requires **MoneyPrinterTurbo 0.1.1 or newer** installed and running on your Windows PC together with a compatible Nimi Home release (the earlier 0.1.0 package exposed only basic automation endpoints and does not support remote workspaces).

For first-time browser setup:

1. Keep Nimi Home and MoneyPrinterTurbo running on your PC. In Nimi Home under **Connections & Access**, confirm this PC is set as your account's primary Runtime with remote access enabled.
2. Open https://nimi.ai/apps/moneyprinterturbo and click **Open in Browser** (or visit https://moneyprinterturbo.nimi.xyz directly), sign in with the same Nimi account, and approve the source on your PC in Nimi Home on first connection.
3. In Nimi Home on your PC under **Integrations**, allow the required operations for `MoneyPrinterTurbo video production`:
   - **Core creation & readback**: `studio.settings` (read defaults), `studio.snapshot` (list tasks), `media.upload` (import local images/audio/video), `media.read` (preview and download outputs/stage files), `create` (submit production tasks), `task` (inspect task progress and artifacts), and `studio.settings.save` (save default creation settings; required only when clicking Save defaults in 0.1.2+, whereas 0.1.1 Web also called it on task submission).
   - **Preview, task control & cue re-render (optional)**: `preview.start` (voice preview), `cancel` (stop a task), `resume` (explicitly continue a paused task), `cues.save` (save proofread subtitles), `regenerate` (re-render from edited cues), and `jobs` (inspect underlying AI job records).

Web and Android access tasks on the same PC workspace strictly through approved Integration operations and do not share private storage across separate registrations. Once connected, you can import media, rewrite scripts, submit or stop tasks, proofread subtitles, inspect stage artifacts, and download finished videos. On Android, **Save Video** and artifact save buttons use the system file-location picker while **Share** hands the file to your chosen app; canceling never deletes the PC original, and completion is reported only after the destination write finishes. Remote media transfer is capped at 256 MB per file—open larger renders directly on PC.

While disconnected, already-loaded results and current unsaved form edits stay visible in the page; reconnecting never auto-resubmits tasks. Closing the browser tab or app process discards unsaved edits, so save creation defaults first. After a PC restart, unfinished tasks pause until you inspect prior outputs and explicitly resume them. External service API keys, social account settings, and Upload-Post publishing remain PC-only.

## Data & External Services

Task records, stage artifacts, and imported media are stored in your PC workspace's Nimi App storage. AI models and credentials are managed by Nimi; choosing a cloud resource sends only the inputs needed for that task to the selected provider. Stock footage services (Pexels, Pixabay, Coverr) and Upload-Post accounts are configured separately in the PC app's Business Settings, and those keys are never sent to browser or mobile clients.

Publishing to external social platforms requires explicit review of captions, accounts, and target platforms on PC before submission; video rendering and social upload are recorded independently.

## License & Support

Adapted from the open-source project https://github.com/harry0703/MoneyPrinterTurbo under the MIT License. For help or bug reports, open an issue at https://github.com/nimiplatform/MoneyPrinterTurbo/issues with the task stage, input mode, and error message—never include private media or service API keys.
