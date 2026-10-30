/**
 * Memos 接入自检脚本
 *
 * 用法：
 *   pnpm check-memos                        # 读取 src/config/dynamicConfig.ts 的 memos 预填值
 *   pnpm check-memos https://memos.example.com users/admin
 *
 * 检查项：
 *   1. Memos API（GET /api/v1/memos）是否可达
 *   2. 响应是否带博客源的 CORS 头（浏览器端实时拉取动态的前提）
 *   3. 打印返回数据中的实际 creator 值，用于确定 dynamicConfig.memos.parent 该填什么
 *
 * 详见 deploy/memos/README.md
 */
import { dynamicConfig } from "../src/config";
import { siteConfig } from "../src/config";

const OK = "\x1b[32m✓\x1b[0m";
const FAIL = "\x1b[31m✗\x1b[0m";
const WARN = "\x1b[33m!\x1b[0m";

const memos = dynamicConfig.memos;
const apiUrl = (process.argv[2] || memos.apiUrl || "").replace(/\/+$/, "");
const expectedParent = process.argv[3] || memos.parent || "";

if (!apiUrl) {
	console.error(`${FAIL} 未提供 Memos 地址（参数或 dynamicConfig.memos.apiUrl）`);
	process.exit(1);
}

// 博客 origin：从 site_url 推导，用作 CORS 检查的 Origin 头
const siteOrigin = new URL(siteConfig.site_url).origin;
const blogOrigins = [...new Set([siteOrigin, "https://blog.teardrop.cn"])];

let failed = false;

// ---- 1. API 可达性 + 2. CORS ----
for (const origin of blogOrigins) {
	try {
		const response = await fetch(`${apiUrl}/api/v1/memos?pageSize=5`, {
			headers: { Accept: "application/json", Origin: origin },
			signal: AbortSignal.timeout(10_000),
		});
		if (!response.ok) {
			console.error(
				`${FAIL} ${origin} -> API 返回 ${response.status}（实例在线但接口异常，确认反向代理路径）`,
			);
			failed = true;
			continue;
		}
		console.log(`${OK} ${origin} -> API 可达 (${response.status})`);

		const allowOrigin = response.headers.get("access-control-allow-origin");
		if (allowOrigin === origin || allowOrigin === "*") {
			console.log(`${OK} CORS 头已允许博客源：${allowOrigin}`);
		} else {
			console.error(
				`${FAIL} CORS 头缺失或不匹配（access-control-allow-origin: ${allowOrigin ?? "无"}）——按 deploy/memos/nginx-memos.conf 补上 CORS 配置`,
			);
			failed = true;
		}

		// ---- 3. creator 取值（仅第一个源查询一次即可） ----
		if (origin === blogOrigins[0]) {
			const data = (await response.json()) as { memos?: { creator?: string }[] };
			const creators = [
				...new Set((data.memos ?? []).map((m) => m.creator).filter(Boolean)),
			];
			if (creators.length === 0) {
				console.log(
					`${WARN} 实例暂无可见动态：注册账号并发布/导入后再运行本脚本（见 deploy/memos/README.md 第 4 步）`,
				);
			} else {
				console.log(`实际 creator 值：${creators.join(", ")}`);
				if (expectedParent && creators.includes(expectedParent)) {
					console.log(`${OK} dynamicConfig.memos.parent（${expectedParent}）匹配`);
				} else {
					console.error(
						`${FAIL} dynamicConfig.memos.parent 当前为「${expectedParent || "未设置"}」，请改为上面列出的实际值`,
					);
					failed = true;
				}
			}
		}
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		console.error(`${FAIL} ${origin} -> 无法连接 ${apiUrl}：${reason}`);
		failed = true;
	}
}

if (failed) {
	console.error(`\n${FAIL} 存在未通过项，按上方提示处理后重试`);
	process.exit(1);
}
console.log(`\n${OK} 全部通过：把 dynamicConfig.memos.enable 改为 true 并重新构建即可上线`);
