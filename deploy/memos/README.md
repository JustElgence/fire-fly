# Memos 接入指南（手机随手发动态，实时生效、无需构建）

> 一次性工作约 15 分钟。完成后：手机/电脑打开 Memos 网页写一句话 → 博客动态页立刻可见。
> 过程中站点不会开天窗：Memos 未就绪时，动态页与侧栏会自动回退到本地动态数据。

## 架构

```
手机/浏览器 ──发动态──> memos.teardrop.cn (Memos 实例, Docker, 仅监听 127.0.0.1)
访客浏览器 ──读 API──> memos.teardrop.cn (Nginx 加 CORS 头) ──> 博客动态页实时渲染
```

博客侧唯一需要的开关在 `src/config/dynamicConfig.ts` 的 `memos` 块（本套件已预填好，见第 5 步）。

## 第 1 步：DNS 解析

在 teardrop.cn 的 DNS 服务商处添加一条 A 记录：

```
memos.teardrop.cn  A  <你服务器的公网 IP>
```

## 第 2 步：部署 Memos 实例

把本目录的 `docker-compose.yml` 上传到服务器（例如 `/opt/memos/`），然后：

```bash
cd /opt/memos
docker compose up -d
```

数据全部落在 `/opt/memos/data/`（SQLite 单文件，备份只需拷走它）。

## 第 3 步：配置反向代理与 CORS

把 `nginx-memos.conf` 放到服务器 Nginx 配置目录，按文件头部注释用 certbot 签发证书后 reload。
CORS 部分已允许 `blog.teardrop.cn` 和 `teardrop.cn` 两个源读取 API——这一步不做，浏览器会因跨域拉不到数据（页面上会表现为回退到本地数据，控制台有跨域报错）。

## 第 4 步：注册账号并迁移旧动态

1. 打开 `https://memos.teardrop.cn`，注册账号（第一个注册的用户即管理员），**用户名建议用 `teardrop`**（与配置预填一致）。
2. 把 `import/` 目录里的 4 个 Markdown 文件内容逐条粘贴到 Memos 发布（可见性保持默认 `PRIVATE` 也行，但**建议设为 Public**，与现有行为一致）。
   - 注意：粘贴导入的时间是导入时刻，原发布时间会丢失；介意的话可以在正文首行补一句原始日期。
   - 「国庆假期中」那条的「福建」位置标签：可在 Memos 编辑器里重新附加位置（可选，不影响展示）。

## 第 5 步：启用并校验

```bash
# 在博客仓库根目录运行；不传参数时读取 dynamicConfig 的预填值
pnpm check-memos
```

脚本会检查：API 可达性、CORS 头是否带上博客源、并把返回数据里实际的 `creator` 值打印出来。
若打印出的 creator 不是 `users/teardrop`，把 `src/config/dynamicConfig.ts` 里的 `parent` 改成打印值。

全部通过后，把 `src/config/dynamicConfig.ts` 中 `memos.enable` 改为 `true`，重新构建部署（Studio 一键构建或 `pnpm build`）。

## 第 6 步：手机端发布方式（任选）

- 手机浏览器打开 `https://memos.teardrop.cn`（可添加到主屏幕，行为接近 PWA）；
- 或者任何支持 Memos API 的第三方客户端。

## 回滚

把 `memos.enable` 改回 `false` 重新构建即可；运行时即使 Memos 宕机，页面也会自动回退到本地数据。
彻底卸载：`docker compose down` + 删掉 Nginx 配置 + 删 DNS 记录。

## 日常备份

```bash
tar czf memos-backup-$(date +%F).tar.gz /opt/memos/data
```
