# handdrawn-summer-excerpt-video 项目总结

## 项目定位

这个项目是一个面向“读书内容讲解 / 书摘短视频”的 Remotion 视频模板。它把书摘内容拆成多个场景，通过 JSON 驱动画面、文字、视觉隐喻、时长和旁白音频，最终渲染成竖屏 MP4。

当前主风格是“纯人类手绘儿童涂色页”：纸张底纹、胶带、粗黑线条、蜡笔填色、轻微抖动、手绘符号和代码渲染中文文字。

核心目标不是每次重新 AI 生图，而是用一套稳定的 Remotion/SVG/CSS 画面系统承接不同书摘内容。Coze 或 GPT 负责生成结构化 JSON，Remotion 负责确定性渲染视频。

## 当前能力

- 支持 720x960 竖屏短视频。
- 支持多场景卡片式读书视频。
- 支持 JSON 驱动画面内容。
- 支持手绘儿童涂色页视觉风格。
- 支持每屏不同视觉隐喻。
- 支持完整 TTS 音频接入。
- 支持根据音频时长自动缩放所有场景时长。
- 不依赖 AI 生图 API。
- 可部署到 VPS 批量渲染。

## 项目结构

```txt
handdrawn-summer-excerpt-video/
  input.json                  当前视频实例数据
  input.template.json         给 Coze / GPT 使用的 JSON 模板
  package.json                Remotion 渲染脚本
  tsconfig.json               TypeScript 配置
  PROJECT_SUMMARY.md          当前总结文档
  src/
    index.ts                  Remotion 入口
    Root.tsx                  注册 Composition
    videoData.ts              读取 input.json，处理总时长、旁白、场景缩放
    ColoringPageVideo.tsx     当前主版本：儿童涂色页风格视频
    SummerExcerptVideo.tsx    早期版本：保留作参考
  renders/
    summer-excerpt-coloring.mp4          当前完整输出
    summer-excerpt-coloring-preview.mp4  6 秒预览输出
    summer-excerpt.mp4                   早期版本输出
```

## 当前主输出

当前推荐查看：

```txt
renders/summer-excerpt-coloring.mp4
```

预览输出：

```txt
renders/summer-excerpt-coloring-preview.mp4
```

## JSON 数据流

当前项目从根目录的 `input.json` 读取数据。核心结构如下：

```json
{
  "template": "handdrawn_reading_coloring_video",
  "version": "1.0.0",
  "style": "children_coloring_page",
  "book": {
    "title": "书名",
    "chapter": "章节名",
    "author": "作者"
  },
  "video": {
    "width": 720,
    "height": 960,
    "fps": 30
  },
  "narration": {
    "enabled": true,
    "mode": "full_track",
    "audioSrc": "audio/narration.mp3",
    "duration": 68.42,
    "syncMode": "fit_audio",
    "volume": 1,
    "text": "完整口播稿"
  },
  "scenes": []
}
```

## Scene 字段说明

每一屏是一个 scene：

```json
{
  "id": "hook",
  "kind": "hook",
  "visualMetaphor": "street_frame_people",
  "visualLabel": "画框挡住路人",
  "duration": 6,
  "eyebrow": "《书名》",
  "title": "我们真的看见\n身边的人了吗？",
  "body": "一屏只讲一个意思。",
  "note": "补充解释或读书笔记。",
  "accent": "blue"
}
```

字段含义：

- `id`：场景唯一 ID，建议英文、小写、无空格。
- `kind`：场景类型，可用于内容组织。
- `visualMetaphor`：画面隐喻，决定这一屏上方的手绘图。
- `visualLabel`：给工作流或人工理解用的图像说明，目前画面中主要由组件内置标签承载。
- `duration`：原始场景时长，单位秒。如果启用 `fit_audio`，它会被当作比例权重。
- `eyebrow`：顶部小标题。
- `title`：主标题，支持 `\n` 换行。
- `body`：正文解释，建议一屏只讲一个意思。
- `note`：底部补充说明。
- `accent`：主题色，可选 `blue`、`green`、`red`、`ink`。

## 支持的视觉隐喻

当前 `visualMetaphor` 支持：

```txt
street_frame_people  画框挡住路人
museum_faces         大师的脸
emotion_icons        恨 / 爱 / 泪 / 乐
body_gesture         真实落在姿态
empty_courtyard      没有明天的庭院
meaning_vs_real      寻找意义的人
real_face            真实的脸
```

这些隐喻不是为单本书写死的，而是为了抽象类书摘准备的通用图像积木。Coze 在生成 scenes 时，应优先从这几个值里选择最贴近该屏意思的一个。

## Coze 工作流建议

推荐把 Coze 工作流拆成 4 个阶段：

1. 书摘理解
   - 输入原始书摘。
   - 提取核心观点、情绪、冲突和读者可理解的解释。

2. 分屏脚本生成
   - 生成 5-8 个 scenes。
   - 每屏一条明确观点。
   - 每屏选择一个 `visualMetaphor`。
   - 每屏生成 `eyebrow`、`title`、`body`、`note`、`accent`、`duration`。

3. 完整口播稿生成
   - 把所有 scenes 串成一条完整旁白。
   - 不建议每屏单独 TTS，优先生成一条完整音频。
   - 这样声音更连贯，不会有段落之间的机械停顿。

4. TTS_full 语音合成
   - 输入完整口播稿。
   - 输出 `data.link` 和 `data.duration`。
   - 把它们写入 JSON 的 `narration.audioSrc` 和 `narration.duration`。

## TTS 接入方式

如果 Coze 的 TTS 节点输出：

```json
{
  "data": {
    "link": "https://example.com/audio.mp3",
    "duration": 68.42
  }
}
```

则 JSON 填：

```json
"narration": {
  "enabled": true,
  "mode": "full_track",
  "audioSrc": "https://example.com/audio.mp3",
  "duration": 68.42,
  "syncMode": "fit_audio",
  "volume": 1,
  "text": "完整口播稿"
}
```

如果 Coze 的 `duration` 是毫秒，比如 `68420`，需要先换算成秒：

```txt
68420 / 1000 = 68.42
```

推荐生产环境先把远程音频下载到本地：

```txt
public/audio/narration.mp3
```

然后 JSON 填：

```json
"audioSrc": "audio/narration.mp3"
```

这样比直接使用远程链接更稳定，因为远程链接可能过期或被 VPS 网络环境阻断。

## 音频与视频如何对齐

当前对齐逻辑在 `src/videoData.ts` 和 `src/ColoringPageVideo.tsx` 中。

当满足以下条件时：

```json
"enabled": true,
"mode": "full_track",
"syncMode": "fit_audio",
"duration": 68.42
```

项目会：

1. 使用 `narration.duration` 作为视频总时长。
2. 计算所有 scene 原始 `duration` 的总和。
3. 按比例缩放每个 scene 的显示时长。
4. 从第 0 帧开始播放整条音频。
5. 最后一屏自动补齐剩余帧，避免小数秒造成黑屏或空白。

例子：

```txt
原始 scenes 总时长：66 秒
TTS 实际音频时长：72 秒
缩放比例：72 / 66 = 1.0909
每个 scene 自动变长 9.09%
```

这样可以保证音频完整走完，画面也完整走完，中间没有音频断层。

## 本地运行命令

当前项目的脚本复用了本机另一个 Remotion 项目的依赖和 Chrome 路径。

打开 Remotion Studio：

```bash
npm run studio
```

渲染当前主版本：

```bash
npm run render:coloring
```

渲染 6 秒预览：

```bash
npm run render:coloring-preview
```

早期版本保留：

```bash
npm run render
npm run render:preview
```

## VPS 部署说明

这个项目可以部署到 VPS 使用。当前画面不调用 AI 大模型生图，不需要图像生成 API。它是：

```txt
JSON -> Remotion / React / SVG / CSS -> MP4
```

VPS 需要准备：

- Node.js
- npm
- Chrome 或 Chromium
- Remotion 依赖
- 中文字体
- 可写的 renders 输出目录

需要注意：

- 当前 `package.json` 里是 Windows 本机绝对路径。
- 上 VPS 前应改成标准依赖安装方式。
- Chrome 路径要改成 VPS 上的 Chromium/Chrome 路径。
- 如果使用远程 TTS 链接，VPS 必须能访问该链接。
- 更稳定的方式是让 Coze 或后端先下载音频，再用本地音频文件渲染。

## 当前限制

- 视觉隐喻目前是固定的 7 种，不能自动生成任意新图像。
- `visualLabel` 目前主要用于数据说明，不是每处都直接驱动画面文字。
- 项目尚未做成 HTTP API 服务，目前仍是命令行渲染。
- `package.json` 仍依赖本机旧项目路径，未完全独立化。
- 还没有背景音乐、字幕逐字高亮、自动下载 TTS 音频等后端能力。

## 后续改进方向

优先级建议：

1. 独立化依赖
   - 在当前项目内正常安装 `node_modules`。
   - 移除对 `hand-drawn-remotion-ae-test-main` 的路径依赖。

2. 增加音频下载脚本
   - 输入 Coze TTS link。
   - 下载到 `public/audio/narration.mp3`。
   - 自动更新 JSON。

3. 做成 VPS API
   - 接收 JSON。
   - 下载音频。
   - 调用 Remotion 渲染。
   - 返回 MP4 文件路径或下载链接。

4. 扩展视觉隐喻库
   - 增加更多通用书摘画面，如门、镜子、路、火、海、书页、灯、杯子、钟表。
   - 让 Coze 更容易为不同类型书摘选择合适画面。

5. 增加字幕 / 口播同步
   - 可基于 TTS 时间戳做逐句字幕。
   - 如果 Coze 能输出分句时间戳，可进一步实现画面跟随旁白精确切换。

## 推荐的 Coze 输出约束

给 GPT / Coze 的提示词里可以明确要求：

```txt
请输出合法 JSON，不要输出 Markdown。
必须符合 input.template.json 的字段结构。
scenes 数量控制在 5-8 个。
每个 scene 的 title 不超过 18 个中文字符，可用 \n 换行。
每个 scene 的 body 控制在 24-48 个中文字符。
每个 scene 的 note 控制在 16-36 个中文字符。
visualMetaphor 只能从允许列表中选择。
accent 只能从 blue、green、red、ink 中选择。
如果接入 TTS_full，把 data.link 写入 narration.audioSrc，把 data.duration 写入 narration.duration。
如果 duration 是毫秒，先除以 1000。
```

## 一句话总结

这个项目已经从“单条书摘演示视频”变成了一个可由 Coze 生成 JSON 驱动的半自动读书短视频模板：内容由工作流生成，画面由 Remotion 稳定渲染，音频可由 TTS_full 一条完整音频驱动总时长。
