---
name: MoneyPrinterTurbo for Nimi
description: 面向中文短视频创作者的桌面创作工作台
colors:
  ink: "#1e302e"
  secondary: "#556460"
  paper: "#f6f6f0"
  line: "#d6dcd5"
  accent: "#103d37"
  surface: "#fff"
  action-hover: "#e8ede7"
  accent-hover: "#25534a"
  rail-text: "#f0f1e9"
  nav-text: "#cbdad1"
  result-surface: "#ecefe8"
  field-border: "#c6d0c8"
  focus: "#ce492d"
  selection: "#c9e0d6"
  danger-text: "#943924"
  danger-background: "#fff5ed"
  danger-border: "#d8aa9d"
  stage-border: "#c6d0c5"
  stage-text: "#626d62"
  stage-complete-background: "#dce7db"
  stage-complete-text: "#244b3e"
  history-selected: "#e8efe7"
  aspect-selected: "#e5eee7"
typography:
  headline:
    fontFamily: "'Segoe UI', 'Microsoft YaHei', sans-serif"
    fontSize: "24px"
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  title:
    fontFamily: "'Segoe UI', 'Microsoft YaHei', sans-serif"
    fontSize: "17px"
    fontWeight: 650
    lineHeight: 1.55
  script:
    fontFamily: "'Segoe UI', 'Microsoft YaHei', sans-serif"
    fontSize: "15px"
    lineHeight: 1.8
  body:
    fontFamily: "'Segoe UI', 'Microsoft YaHei', sans-serif"
    fontSize: "14px"
    lineHeight: 1.55
  button:
    fontFamily: "'Segoe UI', 'Microsoft YaHei', sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.55
  label:
    fontFamily: "'Segoe UI', 'Microsoft YaHei', sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.55
  caption:
    fontFamily: "'Segoe UI', 'Microsoft YaHei', sans-serif"
    fontSize: "12px"
    lineHeight: 1.55
  stage:
    fontFamily: "'Segoe UI', 'Microsoft YaHei', sans-serif"
    fontSize: "10px"
    lineHeight: 1.55
rounded:
  control: "7px"
  stage: "4px"
  aspect: "3px"
spacing:
  "5": "5px"
  "7": "7px"
  "8": "8px"
  "10": "10px"
  "12": "12px"
  "16": "16px"
  "18": "18px"
  "20": "20px"
  "24": "24px"
  "28": "28px"
  "32": "32px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "11px 18px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  button-secondary-hover:
    backgroundColor: "{colors.action-hover}"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  button-danger:
    backgroundColor: "{colors.danger-background}"
    textColor: "{colors.danger-text}"
    typography: "{typography.caption}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  button-icon:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "7px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
    width: "100%"
  navigation:
    backgroundColor: "transparent"
    textColor: "{colors.nav-text}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "13px 10px"
  navigation-active:
    backgroundColor: "{colors.accent-hover}"
    textColor: "{colors.surface}"
  stage-tag:
    backgroundColor: "transparent"
    textColor: "{colors.stage-text}"
    typography: "{typography.stage}"
    rounded: "{rounded.stage}"
    padding: "3px 7px"
  stage-tag-complete:
    backgroundColor: "{colors.stage-complete-background}"
    textColor: "{colors.stage-complete-text}"
  history-row:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "17px"
    width: "100%"
  history-row-selected:
    backgroundColor: "{colors.history-selected}"
  aspect-option:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "12px"
  aspect-option-selected:
    backgroundColor: "{colors.aspect-selected}"
---

# Design System: MoneyPrinterTurbo for Nimi

## Overview

**Creative North Star: "创作工作台"**

暖纸色画布、深绿导航与克制的媒体工具构成工作环境。界面围绕中文输入、精确选项和可检查的结果组织信息；视觉重心落在内容与操作上，密度适合持续工作的桌面窗口。

本文记录 App 自有工作台的已实现视觉规则，依据 [Studio.tsx](src/production/Studio.tsx)、[studio.css](src/production/studio.css) 与 [styles.css](src/styles.css)。[PRODUCT.md](PRODUCT.md) 提供界面方向。AI 配置使用官方 Kit 界面，其内部组件继续由 Kit 管理。

**Key Characteristics:**

- 暖白主画布与浅灰绿结果区，用色面区分工作区域。
- 深绿导航和主按钮形成稳定的操作锚点。
- 紧凑中文标签、统一界面字族和 Lucide 线性图标。
- 平面容器、细边线、轻圆角与清晰的键盘焦点。

## Colors

绿色承担导航、主操作和选中状态，暖白与灰绿承载长时间阅读的内容区域。

### Primary

- **深绿**（`accent`）：导航轨道、主按钮、选中项边线与输入光标。
- **浅一档深绿**（`accent-hover`）：导航悬停、当前导航和主按钮悬停。
- **朱红焦点色**（`focus`）：键盘焦点轮廓；不作为常态装饰。

### Neutral

- **纸面暖白**（`paper`）：工作台底色。
- **白色控件面**（`surface`）：顶栏、输入框和普通按钮。
- **灰绿结果面**（`result-surface`）：制作与预览区域。
- **深色正文**（`ink`）与**次级灰绿**（`secondary`）：主要文本和辅助说明。
- **分隔线**（`line`）与**字段边线**（`field-border`）：区分区域和输入边界。
- **浅色导航字**（`rail-text`、`nav-text`）：深绿轨道上的信息层级。

组件状态色在 frontmatter 中按用途命名：普通悬停、文本选择、危险操作、阶段进度、选中记录和选中画幅。它们用于对应状态，不扩展为新的品牌强调色。

**The Task Accent Rule.** 深绿锚定导航、主操作与选中状态；焦点和错误使用各自的状态色。

## Typography

**Body Font:** Segoe UI，回退到 Microsoft YaHei 与 sans-serif。界面标题、正文、标签和表单共用这个字族，没有独立的展示字体。

**Character:** 标题以适度加重和间距建立层次，中文说明保持清楚、紧凑。脚本编辑区使用更松的行距，让长段落仍便于修改。

### Hierarchy

- **Headline:** 页面标题；尺寸、字重、行高和字距见 `typography.headline`。
- **Title:** 表单章节和结果区标题，见 `typography.title`。
- **Script:** 脚本编辑文本，见 `typography.script`。
- **Body:** 工作台默认文本，见 `typography.body`。
- **Label:** 字段名和折叠摘要，见 `typography.label`；字段输入文字继承字段的字号，但不继承标签的加重。
- **Caption:** 说明、辅助操作和文件信息，见 `typography.caption`。
- **Stage:** 紧凑阶段标签，见 `typography.stage`。

脚本编辑区最小高度（170px），内边距（16px）。介绍性说明限宽（65ch）；预览空状态的说明限宽（25ch）。字幕时间输入使用等宽数字，技术回执保留代码文本格式。

**The Working Text Rule.** 标题、字段与说明使用同一中文可读的界面字族，以字号、字重和行距区分职责。

## Layout

当前界面是 Windows 桌面工作台。根容器占满视口（100vh）并限制外层滚动；顶栏和页脚固定占位，编辑区、结果区及设置内容在各自区域滚动。

默认导航轨道宽（216px）。顶栏内边距（25px 32px）；主编辑区内边距（32px），结果区内边距（28px 24px）。工作区使用两列：编辑区为 `minmax(360px, 1fr)`，结果区为 `minmax(290px, 360px)`。这是当前创作与记录页的组成方式，不要求设置页重复双栏。

表单章节以下边线分隔，底部内边距和章节间距均为（28px）。字段内部间距（7px），字段底部间距（18px）；成对字段使用两列，列间距（16px）。相邻操作允许换行，文件名在有限空间内省略，错误和长路径允许断行。

现有窄窗规则：

- 不大于（1120px）：导航缩至（168px），工作区调整为 `minmax(330px, 1fr) 300px`，编辑内边距降至（24px），顶栏隐藏输出摘要。
- 不大于（900px）：导航缩至图标轨道（64px），工作区为 `minmax(310px, 1fr) 280px`，页面标题缩至（22px）。
- 不大于（700px）：编辑与结果区域按纵向排列，由工作区统一滚动；业务表单改为一列。

这些断点描述现有窗口适配，不增加移动端产品承诺。

## Elevation & Depth

App 自有工作台没有投影。区域深度来自暖纸、白色和灰绿的色面关系，辅以细边线和留白。结果面与编辑面直接相邻；列表和表单不额外套装饰卡片。

**The Flat Surface Rule.** 常驻区域靠底色、边线和空间分层，不使用投影。

状态过渡只有按钮背景变化（0.16s ease）。系统启用减少动态效果时取消过渡。焦点采用外置轮廓（3px 实线，偏移 3px），文件导入区域使用相同的容器焦点提示。

## Shapes

控件、提示和媒体框使用 `rounded.control` 的轻圆角。阶段标签采用更小的 `rounded.stage`，画幅示意轮廓采用 `rounded.aspect`。标准控件边线为（1px）；导入区域使用虚线，画幅示意使用较细的轮廓图形（1.5px）。

主体区域保持完整色面，圆角用来标明可操作或可检查的局部单元。状态点是小圆点，不扩展为大面积胶囊容器。

## Components

### Buttons

按钮紧凑、直接，图标与文字共同说明动作。

- 普通按钮使用白面、深色文字和细边线；主按钮使用深绿面、白字和加重文字。
- 次要透明按钮保留边界；纯图标按钮取消边线并缩小内边距。
- 危险操作使用暖色浅底、暗红文字和同色系边线。
- 通用图文间距（7px）；主要尺寸、颜色和内边距见各按钮 token。
- 默认按钮与主按钮有背景悬停状态；透明、危险和纯图标变体按当前样式保留各自背景。所有按钮使用同一键盘焦点轮廓；禁用态降低不透明度（0.5）并显示不可用指针。

### Chips

阶段标签是紧凑的进度标识。未到达阶段使用透明背景、细边线和灰绿文字；已到达阶段使用浅绿底和较深文字。标签允许换行排列，间距（5px），不作为可点击筛选器。

### Cards / Containers

主体以分区和分隔线组织。可点击的制作记录是一整行，内边距见 `history-row`：标题和辅助信息在左，状态在右；选中后改变底色与边线，保留相同几何形状。长标题省略显示。

结果区容纳任务选择、阶段状态、媒体和产物。视频宽度填满容器，最大高度（390px）；音频控件宽度填满容器，高度（40px）。没有媒体时使用说明性空状态。

### Inputs / Fields

白色输入面配灰绿边线，采用统一圆角和焦点轮廓。字段名在上，输入在下，辅助说明跟随对应字段；输入宽度填满可用空间。

普通文本域最小高度（80px），允许纵向调整；脚本编辑区采用更大的文本和内边距。成对的数字、选择器和字幕时间字段保持紧凑对齐。复选框使用深绿系统强调色。

### Navigation

深绿纵向轨道包含图标和中文文字。普通状态使用浅灰绿文字，当前项和悬停项使用浅一档深绿背景与白字。图标来自 Lucide，常规导航尺寸（19px），窄窗图标轨道尺寸（20px）。

### Aspect Selection and Disclosure

画幅以三个并列选项呈现：竖屏、横屏和方形；轮廓尺寸分别为（22 × 32px）、（34 × 22px）和（27 × 27px）。选中项改变底色和边线，不改变尺寸。

高级设置使用原生折叠摘要，摘要字重和字号遵循标签层级。折叠区域以顶部边线分隔，垂直内边距（13px），摘要与内容间距（12px）。同样的折叠形式用于脚本设置、剪辑设置、声音参考、字幕样式和结果详情。

## Do's and Don'ts

### Do:

- **Do** 用暖白、白色与灰绿区分工作区域，保持深绿主操作清楚可见。
- **Do** 保持中文标签、输入和辅助说明的层次，并在对应字段附近解释条件。
- **Do** 复用现有轻圆角、细边线、键盘焦点和减少动态效果规则。
- **Do** 使用 Lucide 线性图标，媒体区域展示对应内容或说明性的空状态。
- **Do** 在新增工作台区域延续平面分区，按内容需要使用独立滚动或现有窄窗行为。

### Don't:

- **Don't** 给创作工作台添加营销段落或装饰性仪表盘。
- **Don't** 把状态色当作常态装饰，或仅靠颜色表达操作名称。
- **Don't** 为 App 自有平面分区增加投影、装饰大卡片或无关展示型标题。
- **Don't** 用字符字形代替新控件的图标，或将官方 Kit 配置组件复制成自有视觉分支。
