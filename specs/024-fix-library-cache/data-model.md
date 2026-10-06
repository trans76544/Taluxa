# Data Model: 电影列表返回与缩略图缓存复用

**Status**: 现有实现补记；无新增持久化结构。

## 浏览上下文与列表快照

`src/renderer/app/router.tsx` 的内存键含账号 ID，以及 `library`、运行范围、服务器、用户、令牌、媒体库 ID、排序方式。值为 `LibraryItem[]`，空数组有效。

既有 `src/shared/utils/sessionSnapshot.ts` 维护 `lastUsedAtMs`，读取更新时间，超过默认 20 条淘汰最旧记录。令牌仅在内存键使用，不新增日志或持久化。

状态：未命中 → 加载 → 保存；命中 → 展示并刷新 → 成功替换/失败保留；清理 → 删除；关闭数据缓存 → 不读写。异步完成检查取消和请求代次。

## 图片地址 store

`src/renderer/components/useCachedImageUrl.ts` 的 `WeakMap` 按桥接对象隔离：

| 字段 | 类型和规则 |
|---|---|
| `urls` | 来源到本地地址的有界 store，最多 2000；仅本地协议结果入表，可按来源删除 |
| `pending` | `Map<string, Promise<string>>`，共享同来源处理中请求，完成删除 |

显示状态为 `{ sourceUrl, store, url }`。当前来源/store 不匹配则使用新来源初始值；桥接可用但未命中为空，无桥接可直接返回来源。

状态：未知 → 共享处理 → 成功本地或本次服务器回退；命中 → 立即显示；整体失效 → 新 store；旧处理结束 → 不将旧本地地址写入有效 store。

## 卡片失效恢复

两类卡片的 `failedCachedUrl` 保存已失败本地地址。第一次失败删除复用记录并回退来源服务器图；再次失败继续候选直至占位。`PosterCard` 沿用 `candidateIndex`，媒体库封面沿用失败候选列表，不新增永久失败字段。

## 磁盘元数据

`ImageCacheMetadata` 沿用 `cachedAt`、`contentType`、`fileName`、`lastAccessedAt`、`sizeBytes`、`sourceUrl`。本次仅使成功读取更新 `lastAccessedAt`，写入失败仍返回字节。容量和淘汰继续使用既有配置与元数据。
