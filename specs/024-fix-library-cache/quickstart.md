# Verification: 电影列表返回与缩略图缓存复用

## 已有自动验证

前序实施最终 `npm.cmd test` 为 58 文件、645 测试通过；`npm.cmd run build` 类型检查和构建通过。独立审查提出访问记录遗漏，补齐并通过淘汰回归后无剩余重要发现。

本轮仅补文档并核对源码，不重复宣称执行代码测试。需要重新验证时，在仓库根目录运行：

**提交前复验（2026-10-06）**：用户显式要求提交后，重新执行上述全量测试和构建；62 个文件、674 项测试通过，类型检查及构建通过。此结果是提交轮次新增记录，不替代前序实施的历史记录；真实客户端矩阵仍未执行。

```powershell
npx.cmd vitest run src/renderer/app/router.browsing.test.tsx src/renderer/components/useCachedImageUrl.test.tsx src/renderer/components/PosterCard.test.tsx src/electron/main/image/imageCache.test.ts
npm.cmd test
npm.cmd run build
```

| 已有测试文件 | 本功能相关证据 |
|---|---|
| `src/renderer/app/router.browsing.test.tsx` | 返回无加载提示、立即本地地址、解析次数不增、刷新保留节点、失败保留、媒体库隔离 |
| `src/renderer/components/useCachedImageUrl.test.tsx` | 重挂载、两张卡片共享 pending、来源切换、失败重访、清理及旧处理结果 |
| `src/renderer/components/PosterCard.test.tsx` | 初始不设置服务器来源、本地失败回退、重访重新解析、备用及占位 |
| `src/electron/main/image/imageCache.test.ts` | 真实文件按 A/B/再读A/C 操作保留 A/C、淘汰 B；既有容量回归 |
| `src/renderer/app/App.test.tsx`、`src/renderer/features/home/HomePage.test.tsx` | 既有设置、排序、导航、首页及播放回归 |

## 真实客户端矩阵（未执行）

| 场景 | 步骤与通过条件 | 标准 | 状态 |
|---|---|---|---|
| 返回及刷新 | 缓存有效，10 次打开详情返回，刷新延迟 3 秒；首画面有内容、无整页等待、相同图不重载；刷新失败保留 | SC-001、SC-002 | 未执行 |
| 同图并发 | 同时三张卡片引用同图，观察实际请求；下载最多一次，本地处理期间无额外服务器图加载 | SC-003 | 未执行 |
| 上下文 | 切换服务器、账号/认证身份、媒体库、排序，并延迟旧请求；无混用或旧请求覆盖 | SC-004 | 未执行 |
| 设置 | 清理数据/图片，切换图片开关、分辨率、容量和数据开关后访问；按当前设置加载，旧延迟处理不恢复地址 | SC-005 | 未执行 |
| 失效 | 删除本地文件保留服务器图，检查回退；全部来源失败检查占位，重访再次缓存处理 | SC-006 | 未执行 |
| 容量 | 实际客户端可控容量下执行 A/B/再读A/C，保留 A/C | SC-007 | 自动文件测试通过；客户端未执行 |

人工结果追加在本文件，注明环境、步骤、观察结论。未执行项不勾选通过；本表为验收记录完善事项，不要求再次实现代码。
