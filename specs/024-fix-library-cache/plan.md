# Implementation Plan: 电影列表返回与缩略图缓存复用

**Branch**: `codex/024-fix-library-cache` | **Date**: 2026-10-06 | **Spec**: [spec.md](./spec.md)

**Input**: `specs/024-fix-library-cache/spec.md`、当前代码修改及前序测试与审查记录。

**Status**: 实现已完成；本文补记实际方案和验证结果，不安排重新实施。

## Summary

原媒体库列表每次进入都展示加载状态；图片卡片先使用服务器地址，再切换到异步取得的本地地址。修复在列表路由复用会话快照并后台刷新，在共享图片 hook 保存有效本地地址及共享未完成请求，并补齐清理、设置变化和本地文件失效后的恢复。磁盘图片读取更新最近访问时间，避免跳过地址解析后常用图片被提前淘汰。

前序实施轮次已完成代码、自动回归和独立审查：58 个测试文件、645 项测试通过，`npm.cmd run build` 通过。真实客户端完整矩阵未执行，见 [quickstart.md](./quickstart.md)。本次文档补写不将历史结果表述为新一轮测试。

2026-10-06 显式提交前复验：当前仓库全量 62 个测试文件、674 项测试通过，`npm.cmd run build` 通过。测试数量包含期间已纳入仓库的其他功能回归，本次提交范围仍为本功能。

## Technical Context

**Language/Version**: TypeScript `^5.6.3`。

**Primary Dependencies**: Electron `^32.2.3`、React `^18.3.1`、React Router `^6.26.2`；无新增依赖。

**Storage**: 渲染端会话内列表快照及图片地址；磁盘沿用 `ImageCache` 文件与元数据，仅更新既有 `lastAccessedAt`；无新增持久化字段或迁移。

**Testing**: Vitest `^2.1.8`、Testing Library、jsdom、可控 promise、Node 临时文件及注入时间。

**Target Platform**: Windows 桌面应用。

**Project Type**: Electron 桌面应用的浏览页面与图片缓存。

**Performance Goals**: 返回时先展示有效快照和本地海报，不等待本次网络刷新；同来源共享处理中请求；内容不变的刷新保留图片节点和地址。

**Constraints**: 尊重缓存设置，隔离身份与排序，失败可恢复；保留导航、备用图、占位和播放行为。

**Scale/Scope**: 列表 store 使用既有默认上限 20 条；每个图片桥接 store 保存最多 2000 条成功本地地址，另维护完成即删除的 pending 表。列表新增缓存仅针对媒体库项目路由，图片行为由共享卡片覆盖首页、媒体库、聚合和搜索。

## Constitution Check

`.specify/memory/constitution.md` 为未填写模板，示例不是已批准约束。依据实际修改进行以下检查，补记设计后复核通过：

- **PASS — 范围受控**：修改原路由、共享 hook、两类图片卡片和磁盘读取，没有全面页面重构。
- **PASS — 复用既有能力**：沿用有界会话 store、请求代次、图片桥接和设置入口。
- **PASS — 有界且可恢复**：列表 20 条、图片地址 2000 条；pending 完成删除；失败和服务器回退不作为永久本地命中。
- **PASS — 身份隔离**：列表键包含账号、运行范围、服务器、用户、认证凭据、媒体库与排序；凭据仅用于内存键，不新增日志或持久化。
- **PASS — 无新增依赖或协议**：既有图片桥接返回格式及本地图片协议保持。
- **PASS — 证据明确**：关键失败先被回归复现，修复后通过；真实客户端及完整场景矩阵不冒充已验证。

## Project Structure

### Documentation (this feature)

```text
specs/024-fix-library-cache/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/browsing-cache.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── renderer/app/
│   ├── router.tsx
│   └── router.browsing.test.tsx
├── renderer/components/
│   ├── useCachedImageUrl.ts
│   ├── useCachedImageUrl.test.tsx
│   ├── PosterCard.tsx
│   ├── PosterCard.test.tsx
│   └── LibraryCardRow.tsx
├── electron/main/image/
│   ├── imageCache.ts
│   └── imageCache.test.ts
└── shared/utils/sessionSnapshot.ts   # 既有 helper，本次复用
```

既有 `src/electron/main/ipc/imageCache.ts`、`src/electron/main/image/protocol.ts` 提供接口；`src/renderer/app/App.test.tsx`、`src/renderer/features/home/HomePage.test.tsx` 提供回归依据，本次缓存修复未修改这些文件。

## Phase 0: 已完成的根因调查

`LibraryItemsRoute` 原先从空列表及加载状态开始；hook 和卡片原先在本地结果未知时直接使用服务器图。首页和详情已使用会话快照，因此列表复用同一机制。地址复用跳过原 `resolve` 的访问时间更新后，审查又发现容量淘汰问题，并通过真实文件红绿回归验证。决策见 [research.md](./research.md)，没有未确定技术选择。

## Phase 1: 已采用的设计

### 列表复用

`router.tsx` 新增 `librarySessionSnapshots`。使用 `createSessionSnapshotKey`，加入账号、桥接运行范围、服务器、用户、令牌、媒体库和排序。缓存启用时，初始状态及刷新入口读取快照，空数组也有效；后台成功更新并保存，失败保留旧列表并提示。

请求依赖使用稳定的用户 ID 和令牌，不再依赖可能被重建的整个 session 对象。沿用取消标志及请求代次检查旧响应。既有项目 ID 保持卡片键，后台刷新不把整个网格替换为加载提示。

### 图片地址与共享处理

`useCachedImageUrl.ts` 按图片桥接对象用 `WeakMap` 保存 store，包含有界本地地址记录和来源到 promise 的 pending 表。仅 `taluxa-image-cache://` 地址进入成功记录；服务器回退及失败不永久记为命中。

命中同步返回本地地址；桥接可用但未命中时先返回空值。`PosterCard` 和 `LibraryCardCollageImage` 此时不设置 `src`，不提前加载服务器图。同来源共享 promise，结束后删除 pending。显示状态绑定来源和 store，来源变化不显示旧图；离开页面取消其状态更新。

### 失效和恢复

`invalidateCachedImageUrls(sourceUrl?)` 删除单个来源或整个桥接 store。整体失效后旧 promise 检查 store 身份，不重新写入旧本地地址。设置页清理图片及配置变化、`AppRouter` 观察到图片开关/分辨率/容量变化时失效；数据缓存关闭不读写列表快照，清理数据同时清空列表 store。

两类卡片用 `failedCachedUrl` 记录失败本地地址，删除来源的成功记录，先回退同来源服务器图，再沿用备用和占位。下次访问可重新解析。

### 磁盘使用记录

`ImageCache.read` 成功读取后尽力更新 `lastAccessedAt`，写入失败不阻止字节返回。既有淘汰函数继续按最近访问排序并保护新增图片。实际协议读取计为使用；未发生协议读取的浏览器内存命中不声称额外更新磁盘时间。

结构及状态见 [data-model.md](./data-model.md)，界面和桥接行为见 [contracts/browsing-cache.md](./contracts/browsing-cache.md)。

## Phase 2: 已完成的实施与验证

| 部分 | 状态与证据 |
|---|---|
| 列表快照、后台更新和失败保留 | 已完成；路由测试检查返回时无加载提示、本地地址立即可见、解析次数不增、刷新保留节点及失败保留内容 |
| 地址复用、共享处理、来源切换 | 已完成；hook 测试覆盖重挂载、共享 pending、来源切换、失败重访 |
| 上下文、清理和配置变化 | 已完成；其他媒体库隔离、地址清理、清理后旧 promise 测试及配置入口源码检查 |
| 本地文件失效恢复 | 已完成；海报测试覆盖服务器回退及再次解析 |
| 读取影响淘汰顺序 | 已完成；注入四个时间点及真实文件，保留 A/C、淘汰 B |
| 全量回归与构建 | 前序已通过：58 文件、645 测试；类型检查及构建通过 |
| 独立审查 | 已完成；访问记录遗漏已修复，最终无剩余重要发现 |
| 真实客户端完整矩阵 | 未执行；记录在 `quickstart.md`，不是剩余编码工作 |

## Requirement Coverage

| 需求/指标 | 实现与验收 |
|---|---|
| FR-001–FR-004；SC-001、SC-002、SC-004 | 路由快照、身份键、请求保护；路由回归及人工完整矩阵 |
| FR-005–FR-007；SC-003 | hook 和两类卡片；hook/海报回归，三卡片真实下载检查未执行 |
| FR-008、FR-011；SC-005 | 设置页、顶层设置观察、地址与列表失效；局部回归及人工配置矩阵 |
| FR-009；SC-006 | 单地址失效、服务器回退、候选图；海报回归及真实失效验收 |
| FR-010；SC-007 | 磁盘读取更新时间；真实临时文件自动测试 |
| FR-012 | 既有有界 store、图片 2000 上限、pending 清理；源码及既有 store 回归 |
| FR-013、FR-014 | 共享卡片调用范围及既有首页、设置、导航、播放回归 |

自动测试不等同于 SC-001 的十次真实返回及三秒网络延迟、SC-003 的三卡片实际下载次数，或 SC-004/SC-005 完整矩阵。支持证据与待验收事项分开记录。

## Complexity Tracking

没有新增依赖、存储迁移、桥接方法或协议。后续仅完善验证记录；已完成的编码任务在 `tasks.md` 勾选，不再要求重做。
