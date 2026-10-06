# Browsing Cache Contract

**Status**: 实现现状；没有新增桥接方法或协议。

## 列表

- 数据缓存启用且上下文命中：直接展示快照，后台调用既有 `fetchItems`。
- 未命中：沿用加载提示，成功更新并保存。
- 有快照但刷新失败：保留并显示 `Could not refresh this library. Showing saved content.`。
- 无快照且失败：显示 `Could not load this library.`，不复用其他上下文。
- 保持项目 ID 卡片键，相同内容刷新不将整个网格切换成加载界面。

## 图片桥接

既有 `window.embyDesktop.imageCache` 保持 `resolve(sourceUrl)`、`stats()`、`clear()`、`configure(config)`。解析结果为 `{ cacheKey, fromCache, url }`，服务器回退允许空 cacheKey。

只有本地协议地址可记为成功复用；不以 `fromCache` 判定能否记录，新下载到本地的地址也有效。失败/服务器回退不能永久记为本地命中。

## hook 和卡片

`useCachedImageUrl(sourceUrl: string | null): string | null` 保持类型：桥接可用未命中返回空，命中同步返回本地地址，同来源共享处理；无有效来源为空。

`invalidateCachedImageUrls(sourceUrl?: string)` 提供来源时删单个地址，不提供则整体 store 失效；旧 store 不能向新 store 写入旧本地地址。

卡片空值时不设置 `src`；本地失败删记录并先回退服务器图，之后沿用备用及占位。`loading="lazy"`、`decoding="async"` 保持。

## 清理和设置

设置页图片清理/配置变化及顶层图片开关、分辨率、容量变化使图片地址失效。数据清理同时删列表快照，数据缓存关闭不读写该快照。

## 图片协议读取

`taluxa-image-cache://<cacheKey>` 沿用协议处理器调用 `ImageCache.read`，成功读字节后尽力写访问时间。写访问时间失败不影响返回；协议响应格式和缓存响应头保持。
