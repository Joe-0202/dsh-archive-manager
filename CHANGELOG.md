# Changelog

本文件记录本插件的所有重要变更。
格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [0.1.0] - 2026-10-14

首个版本。

### 新增

- **侧边栏入口**：底部（设置旁）新增「归档管理」图标，打开管理面板。
- **双 Tab 面板**：「已归档」与「活跃会话」两个页签，面板高度固定，列表独立滚动。
- **每行操作并排**：
  - 已归档行 →【取消归档】【删除】
  - 活跃行 →【归档】【删除】
- **归档 / 取消归档**：复用 DSH 原生 `archiveSession` / `unarchiveSession`，
  数据不移动、不复制。
- **彻底删除**：删除会话的日志目录与投影缓存，**保留**绑定的用户工作目录。
- **幽灵条目识别**：数据已丢失、只剩归档记录的条目会标为「数据已不存在」。
- **自定义确认框**：替代 Electron 原生的 `window.confirm`，使用 harness 设计 token，
  明确标注「绑定的工作目录不会被删除」。
- **路径可点击**：会话绑定的工作目录可点击，直接在系统资源管理器中打开。
- **Agent 工具**：`archive_list` / `archive_add` / `archive_remove` / `archive_delete`。

### 设计要点

- **待清理队列**：彻底删除时不立即取消归档，而是把会话 id 排入
  `$DSH_HOME/storages/archive-manager-pending.json`，由插件在 DSH 下次启动时
  执行收尾。这样可避免「数据已删、但内存中仍有会话对象」的会话被
  `unarchiveSession` 送回活跃列表，变成一个无法打开、且必须重启才能消除的幽灵。
- **归档集优先读运行时投影**：`workspaceController.follow()` 的首帧 baseline 携带
  `archivedSessionIds`，读到即中止流；失败时回退到 `workspace.json` 快照。
- **UI 与自带界面同一套视觉体系**：样式表通过 `styles` builtin 注入，
  全部使用 `--dsw-alias-*` 设计 token。

[Unreleased]: https://github.com/Joe-0202/dsh-archive-manager/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Joe-0202/dsh-archive-manager/releases/tag/v0.1.0
