# Research: 电影列表返回与缩略图缓存复用

**Date**: 2026-10-06

本文补记实际实现决策，依据源码、前序红绿测试和审查记录。

## 1. 列表复用

**Decision**: 在 `src/renderer/app/router.tsx` 的 `LibraryItemsRoute` 使用既有 `src/shared/utils/sessionSnapshot.ts`，返回先展示、后台刷新。

**Rationale**: 原路由每次进入都显示加载状态；首页和详情已有同类快照，不必增加持久化模型。

**Alternatives**: 全部页面常驻或跨重启列表存储扩大生命周期与失效管理范围，不属于此次修复。

## 2. 图片来源和重访

**Decision**: `src/renderer/components/useCachedImageUrl.ts` 仅保存本地地址；未确定结果时不使用服务器地址；两类卡片移除无条件原地址回退。

**Rationale**: 原行为在服务器和本地图片之间切换，重挂载重复解析。回归复现地址不能同步复用和首次额外服务器来源，再验证修复。

**Alternatives**: 仅有磁盘文件不阻止卡片先加载服务器图；推算本地地址会复制主进程缓存键规则。

## 3. 并发与失效

**Decision**: 按桥接对象保存成功地址及来源到 promise 的表；显示状态绑定来源/store；只向当前 store 写入成功地址。

**Rationale**: 多卡片可共享同图，来源切换和清理存在旧异步结果；不需新增桥接方法。

**Alternatives**: 单卡片内保存结果不能服务重访；永久保存失败或服务器回退会阻止缓存恢复。

## 4. 本地文件失效

**Decision**: `PosterCard.tsx` 与 `LibraryCardRow.tsx` 删除失效地址记录，先回退同来源服务器图，再沿用候选和占位。

**Rationale**: 记住地址不代表文件仍存在；先使用同图可避免单海报电影直接变成占位，下次还能恢复。

**Alternatives**: 重复本地地址会持续失败；直接跳过来源会放弃仍可用的服务器图。

## 5. 淘汰记录

**Decision**: `src/electron/main/image/imageCache.ts` 的成功 `read` 尽力更新访问时间。

**Rationale**: 审查发现跳过解析也跳过原访问时间更新；真实文件测试 A/B/再次读取 A/C 原先淘汰 A，修复后淘汰 B。

**Alternatives**: 重访重新解析全部图片增加批量桥接工作；按加入顺序淘汰不能反映最近实际使用。

## 6. 验证边界

**Decision**: 分别记录已完成代码、局部自动回归、历史全量验证及未执行的真实客户端矩阵。

**Rationale**: 已有两张卡片共享处理和一次受控返回测试，不等同于三卡片实际下载或十次真实返回。文档不扩大已完成验证结论。
