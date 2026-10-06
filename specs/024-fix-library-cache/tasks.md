# Tasks: 电影列表返回与缩略图缓存复用

**Input**: `specs/024-fix-library-cache/` 的规格及设计文档。

**Prerequisites**: [plan.md](./plan.md)、[spec.md](./spec.md)、[research.md](./research.md)、[data-model.md](./data-model.md)、[contracts/browsing-cache.md](./contracts/browsing-cache.md)。

**Status**: 按已完成实现补记。共 33 项：30 项已完成，3 项真实客户端验收未执行；没有未完成的编码任务。

**Tests**: 测试任务记录已经建立和执行过的回归，不要求重新编写。全量自动验证与构建使用前序实施记录，本轮只核对文档及源码。

## Format and Status

- `[x]` 表示代码、测试、审查或文档已具备相应完成证据；`[ ]` 仅用于未执行的真实客户端验收。
- `Txxx` 为顺序任务 ID；`[USn]` 对应规格用户故事。路径相对仓库根目录。
- 下列阶段表示已实施方案的依赖顺序，不表示必须重新运行实施流程。

## Phase 1: Setup — 已完成

- [x] T001 核对 `specs/024-fix-library-cache/spec.md` 与 `package.json`，确定媒体库列表及共享图片卡片范围，沿用当前技术栈。
- [x] T002 根据实际源码和实施记录补写 `specs/024-fix-library-cache/plan.md`、`research.md`、`data-model.md`、`contracts/browsing-cache.md` 与 `quickstart.md`，区分已实现及未执行验收。

## Phase 2: Foundational — 已完成

- [x] T003 复用 `src/shared/utils/sessionSnapshot.ts` 的有界 store 和键生成能力，列表使用默认 20 条上限，图片成功地址使用 2000 条上限；该 helper 为既有代码。
- [x] T004 沿用 `src/electron/main/ipc/imageCache.ts` 的图片解析、清理、配置返回约定，以及 `src/renderer/app/router.tsx` 的请求代次保护，不新增桥接接口。

## Phase 3: User Story 1 — 返回立即继续浏览（P1，已完成）

**Goal**: 返回时先显示列表和海报，后台刷新不使未变化海报重载。

**Independent Test**: `src/renderer/app/router.browsing.test.tsx` 返回流程；缓存命中时没有加载提示、直接使用本地地址、解析次数不增加，后台相同内容刷新保留图片节点。

- [x] T005 在 `src/renderer/app/router.browsing.test.tsx` 建立受控延迟返回回归，复现原先返回列表重新进入加载状态。
- [x] T006 在 `src/renderer/app/router.tsx` 的 `LibraryItemsRoute` 新增列表快照读取和初始状态复用，成功结果写入 store，空数组也视为有效快照。
- [x] T007 在 `src/renderer/app/router.tsx` 保留后台 `fetchItems`、取消标志与代次检查，以稳定身份字段作为依赖，成功刷新更新已有网格。
- [x] T008 在 `src/renderer/app/router.browsing.test.tsx` 强化返回断言，检查本地海报地址、解析调用次数和后台刷新前后的同一图片节点。

## Phase 4: User Story 2 — 本地海报加载（P1，已完成）

**Goal**: 同图复用及共享处理，避免先服务器再本地的额外加载。

**Independent Test**: `src/renderer/components/useCachedImageUrl.test.tsx` 的重挂载、共享 pending、来源切换，及 `PosterCard.test.tsx` 的首次来源断言。

- [x] T009 在 `src/renderer/components/useCachedImageUrl.test.tsx` 建立重挂载直接获得本地地址、并发共享和来源切换回归，并在修复前确认相关断言失败。
- [x] T010 在 `src/renderer/components/useCachedImageUrl.ts` 按图片桥接对象建立 store，保存有界成功本地地址，命中时同步返回。
- [x] T011 在 `src/renderer/components/useCachedImageUrl.ts` 按来源共享 pending promise，完成后清理，页面离开后取消对应状态更新。
- [x] T012 在 `src/renderer/components/useCachedImageUrl.ts` 将显示状态绑定来源与 store，避免新来源显示旧图；本地结果未知时先返回空值。
- [x] T013 在 `src/renderer/components/PosterCard.tsx` 和 `src/renderer/components/LibraryCardRow.tsx` 移除未解析时的无条件服务器 `src`，保持懒加载及异步解码属性。
- [x] T014 在 `src/renderer/components/PosterCard.test.tsx` 检查解析未完成时不设置服务器图片来源，完成后展示本地图片。

## Phase 5: User Story 3 — 刷新失败保留内容（P2，已完成）

**Goal**: 网络失败不丢失已有列表，图片回退允许下次恢复。

**Independent Test**: 列表刷新拒绝时保留内容及提示；图片缓存拒绝或返回服务器来源后，重访再次尝试并能获得本地地址。

- [x] T015 在 `src/renderer/app/router.tsx` 根据有无保存列表区分刷新失败保留提示与首次加载失败提示。
- [x] T016 在 `src/renderer/app/router.browsing.test.tsx` 验证后台刷新失败后仍显示原电影，并展示保存内容提示。
- [x] T017 在 `src/renderer/components/useCachedImageUrl.ts` 处理解析拒绝和服务器地址回退，不将其保存为永久本地命中。
- [x] T018 在 `src/renderer/components/useCachedImageUrl.test.tsx` 验证解析失败及服务器回退后重访重新处理。

## Phase 6: User Story 4 — 身份及缓存设置一致（P2，已完成）

**Goal**: 快照隔离浏览上下文，清理与配置变化使记录失效。

**Independent Test**: 另一媒体库不复用旧列表；图片地址清理后重新解析，清理前旧 promise 完成不恢复本地记录。完整身份和配置矩阵见最终人工验收。

- [x] T019 在 `src/renderer/app/router.tsx` 将账号、运行范围、服务器、用户、认证令牌、媒体库与排序加入列表键；在 `router.browsing.test.tsx` 验证不同媒体库隔离。
- [x] T020 在 `src/renderer/components/useCachedImageUrl.ts` 实现单来源及整体地址失效和旧 store 身份检查；在 `src/renderer/app/router.tsx` 接入图片清理、配置操作及顶层设置变化。
- [x] T021 在 `src/renderer/app/router.tsx` 按数据缓存开关控制快照读写，并在清理数据缓存时清空列表 store。
- [x] T022 在 `src/renderer/components/useCachedImageUrl.test.tsx` 验证清理后不复用地址、重新解析及旧 promise 结果不重建失效记录。

## Phase 7: User Story 5 — 图片失效与容量恢复（P2，已完成）

**Goal**: 本地文件失效先尝试服务器图，实际读取计入最近使用。

**Independent Test**: 海报本地错误触发同来源服务器回退，重访再次解析；真实临时文件 A/B/再次读 A/C 顺序保留 A/C、淘汰 B。

- [x] T023 在 `src/renderer/components/PosterCard.tsx` 与 `src/renderer/components/LibraryCardRow.tsx` 记录失败本地地址并删复用记录，先回退服务器图，再沿用候选和占位流程。
- [x] T024 在 `src/renderer/components/PosterCard.test.tsx` 验证本地文件不可用的回退和再次访问时重新解析，保留既有候选图回归。
- [x] T025 在 `src/electron/main/image/imageCache.ts` 的成功 `read` 后尽力更新 `lastAccessedAt`，更新失败不影响已读取字节返回。
- [x] T026 在 `src/electron/main/image/imageCache.test.ts` 用注入时间和真实文件建立读取影响淘汰的失败回归，修复后验证保留 A/C、淘汰 B。

## Phase 8: Cross-Cutting Verification and Documentation

### 已完成

- [x] T027 完成前序全量 `npm.cmd test`，记录 58 个文件、645 项通过；验证范围及已有测试路径整理于 `specs/024-fix-library-cache/quickstart.md`。
- [x] T028 完成前序 `npm.cmd run build`，类型检查及构建通过；命令依据 `package.json`，记录于 `specs/024-fix-library-cache/plan.md`。
- [x] T029 完成独立审查并修复 `src/electron/main/image/imageCache.ts` 的访问记录遗漏，红绿回归后无剩余重要发现，记录于 `specs/024-fix-library-cache/research.md`。
- [x] T030 核对 `specs/024-fix-library-cache/tasks.md` 的任务格式、编号、状态、文件引用及需求映射，并将 `AGENTS.md` 的计划引用更新至本功能。

### 未执行的真实客户端验收（不是待编码任务）

- [ ] T031 按 `specs/024-fix-library-cache/quickstart.md` 完成真实客户端十次返回/三秒延迟、刷新成功与失败、三张同图卡片实际下载观察，记录 SC-001 至 SC-003 结果。
- [ ] T032 按 `specs/024-fix-library-cache/quickstart.md` 完成服务器、账号/认证、媒体库、排序隔离及数据/图片缓存清理与设置矩阵，记录 SC-004、SC-005 结果。
- [ ] T033 按 `specs/024-fix-library-cache/quickstart.md` 完成本地文件失效、备用来源耗尽、重访恢复及真实客户端容量压力验收，记录 SC-006、SC-007 结果。

## Dependencies and Order

Setup → 既有缓存与桥接基础 → US1 列表复用 / US2 图片处理 → US3 失败保留 / US4 失效管理 → US5 图片恢复及访问时间 → 全量回归和审查。

- US1 使用列表 store；完整海报复用体验同时依赖 US2。
- US3 的列表部分依赖 US1，图片回退部分依赖 US2。
- US4/US5 使用 US2 的成功地址及失效入口；US4 的列表清理还依赖 US1。
- 路由及共享 hook 有多个故事共同修改，不能将这些修改视为互不影响的并行任务。
- T031–T033 在已完成代码上验收，不阻塞或要求重复完成 T005–T026。

## Independent Validation and Parallel Opportunities

以下是需要重验时的只读验证分组，不是新增实施安排，也不要求启动代理：

| 用户故事 | 可独立验证的文件或场景 | 并行边界 |
|---|---|---|
| US1 | `src/renderer/app/router.browsing.test.tsx` 返回用例 | 可与 hook 的单元回归分组执行 |
| US2 | `src/renderer/components/useCachedImageUrl.test.tsx`、`PosterCard.test.tsx` | 同一文件内测试作为一组，不分别修改共享 hook |
| US3 | 路由失败用例与 hook 失败重访用例 | 两个文件的只读回归可以独立执行 |
| US4 | hook 清理用例、路由媒体库隔离及人工设置矩阵 | 人工改配置时不得与其他人工缓存场景共用运行实例 |
| US5 | `src/electron/main/image/imageCache.test.ts` 及海报失效用例 | Node 临时文件测试可与渲染回归分组执行 |

## Implementation Strategy and Completion Evidence

最小修复由 US1 的列表快照和 US2 的本地地址复用组成；异常保留、上下文失效、文件恢复及最近使用记录补齐完整方案。这些增量均已实现，不再建立新的编码里程碑。

每个用户故事已有源码和局部自动回归支持；上下文及设置的所有排列、实际网络传输次数和十次真实客户端返回尚未逐项验收。完成状态区分实现、自动证据和真实客户端证据，不能因为 T031–T033 未执行就重做代码，也不能把它们勾选为已通过。

文档补写阶段未自动提交。2026-10-06 用户显式要求提交后，全量复验为 62 个测试文件、674 项通过，构建通过。`specs/` 与 `AGENTS.md` 受既有忽略规则影响，本次提交定向加入 `024` 功能文档及其上下文引用，不修改全局忽略规则。
