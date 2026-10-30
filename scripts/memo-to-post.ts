/**
 * memo-to-post：把一条 Memos 动态转正为博客文章
 *
 * 用法：
 *   pnpm memo-to-post --list                          # 列出最近动态，挑一条
 *   pnpm memo-to-post <memo链接或ID> [选项]
 *   pnpm memo-to-post https://memos.teardrop.cn/m/1781 --dry-run
 *   pnpm memo-to-post 1781 --title "周末去了西湖" --draft
 *
 * 选项：
 *   --title <标题>      手动指定标题（默认取正文首个非图片行，剥掉 Markdown 符号）
 *   --category <分类>   文章分类，默认「日常」
 *   --tags <a,b>        额外标签；正文里的 #标签 也会自动收进 frontmatter（正文原样保留）
 *   --description <文本> 摘要（默认截取正文前 60 字）
 *   --slug <slug>       自定义文件名（默认 YYYY-MM-DD-xxxxxx，与 Studio 生成风格一致）
 *   --draft             生成草稿（draft: true，不出现在站点）
 *   --dry-run           只预览生成的文件内容，不落盘
 *
 * 转正后 Memos 原文不动；发布仍需去 Studio 点一次构建（或 pnpm build）。
 */
import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { dynamicConfig } from "../src/config";

const OK = "\x1b[32m✓\x1b[0m";
const FAIL = "\x1b[31m✗\x1b[0m";

interface Memo {
	name: string;
	createTime: string;
	content: string;
}

/** 解析命令行参数 */
function parseArgs(argv: string[]) {
	const args: Record<string, string | boolean> = {};
	const positional: string[] = [];
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--list" || a === "--draft" || a === "--dry-run") {
			args[a.slice(2)] = true;
		} else if (a.startsWith("--")) {
			const key = a.slice(2);
			const value = argv[++i];
			if (value === undefined) {
				console.error(`${FAIL} 参数 ${a} 缺少值`);
				process.exit(1);
			}
			args[key] = value;
		} else {
			positional.push(a);
		}
	}
	return { args, positional };
}

/** 从链接或纯 ID 中提取 memo id（支持 .../m/1781、memos/1781、1781） */
function extractMemoId(input: string): string {
	const m = input.match(/(?:\/m\/|memos\/)([A-Za-z0-9_-]+)\/?$/) || input.match(/^([A-Za-z0-9_-]+)$/);
	if (!m) {
		console.error(`${FAIL} 无法识别的 memo 标识：${input}（应为链接或 ID）`);
		process.exit(1);
	}
	return m[1];
}

/** 调 Memos 列表接口（与主题动态页同一路径，兼容 0.31） */
async function fetchMemos(): Promise<Memo[]> {
	const memos = dynamicConfig.memos;
	const apiUrl = memos.apiUrl.replace(/\/+$/, "");
	const url = new URL(`${apiUrl}/api/v1/memos`);
	url.searchParams.set("pageSize", "200");
	if (memos.parent) url.searchParams.set("parent", memos.parent);

	const response = await fetch(url, {
		headers: { Accept: "application/json" },
		signal: AbortSignal.timeout(15_000),
	});
	if (!response.ok) {
		throw new Error(`Memos API ${response.status}（检查 ${apiUrl} 是否可达）`);
	}
	const data = (await response.json()) as { memos?: Memo[] };
	return data.memos ?? [];
}

/** 从 Markdown 正文提取纯文本（用于标题与摘要） */
function plainText(markdown: string): string {
	return markdown
		.replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
		.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
		.replace(/[#>*_`~[\]()-]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

/** 标题：首个非空且非图片的行，剥掉行首 Markdown 标记 */
function pickTitle(content: string): string | undefined {
	for (const raw of content.split("\n")) {
		const line = raw.trim();
		if (!line) continue;
		if (line.startsWith("![") || line.startsWith("<")) continue;
		return line.replace(/^#{1,6}\s*/, "").replace(/[*_`~]/g, "").slice(0, 80);
	}
	return undefined;
}

/** YAML 双引号安全转义 */
function yamlQuote(text: string): string {
	return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

async function main() {
	const { args, positional } = parseArgs(process.argv.slice(2));
	const memos = dynamicConfig.memos;
	const apiUrl = memos.apiUrl.replace(/\/+$/, "");

	// ---- --list：列出最近动态供挑选 ----
	if (args.list) {
		const all = await fetchMemos();
		if (all.length === 0) {
			console.log("实例暂无动态");
			return;
		}
		console.log(`最近 ${all.length} 条动态（memos.teardrop.cn 的 memo id 取链接末段）：`);
		for (const memo of all.slice(0, 20)) {
			const id = memo.name.split("/").pop();
			const preview = plainText(memo.content).slice(0, 30) || "（仅图片）";
			console.log(`  ${id}  ${memo.createTime.slice(0, 16)}  ${preview}`);
		}
		return;
	}

	// ---- 转正流程 ----
	if (positional.length === 0) {
		console.error(`${FAIL} 缺少 memo 链接或 ID。先用 pnpm memo-to-post --list 挑一条`);
		process.exit(1);
	}
	const memoId = extractMemoId(positional[0]);

	console.log(`正在从 ${apiUrl} 获取 memo ${memoId} ...`);
	const all = await fetchMemos();
	const memo = all.find((m) => m.name.split("/").pop() === memoId);
	if (!memo) {
		console.error(
			`${FAIL} 没找到 memo ${memoId}。用 pnpm memo-to-post --list 查看可选的 ID（注意：仅限 ${memos.parent} 名下、对博客可见的动态）`,
		);
		process.exit(1);
	}

	const content = memo.content;
	const title = (args.title as string) || pickTitle(content);
	if (!title) {
		console.error(`${FAIL} 正文里找不到可作标题的文字行，请用 --title 指定`);
		process.exit(1);
	}

	// 标签：--tags 传入 + 正文 #标签 自动收集（正文不动）
	const inlineTags = [...content.matchAll(/(?<=^|\s)#([^\s#.,!?，。！？]+)/g)].map((m) => m[1]);
	const tags = [
		...new Set([...(args.tags ? String(args.tags).split(",").map((t) => t.trim()) : []), ...inlineTags]),
	].filter(Boolean).slice(0, 8);

	const description =
		(args.description as string) || `${plainText(content).slice(0, 60)}${plainText(content).length > 60 ? "…" : ""}`;

	// slug：YYYY-MM-DD-xxxxxx，与 Studio 生成风格一致；已存在则再随机
	const datePart = memo.createTime.slice(0, 10).replaceAll("-", "-");
	let slug = (args.slug as string) || `${datePart}-${randomBytes(3).toString("hex")}`;
	let filePath = path.resolve("src/content/posts", `${slug}.md`);
	while (await fs.access(filePath).then(
		() => true,
		() => false,
	)) {
		slug = `${datePart}-${randomBytes(3).toString("hex")}`;
		filePath = path.resolve("src/content/posts", `${slug}.md`);
	}

	const draft = args.draft ? "true" : "false";
	const category = (args.category as string) || "日常";
	const tagsLine = tags.length > 0 ? `\ntags: [${tags.map(yamlQuote).join(", ")}]` : "";

	const file = `---
title: ${yamlQuote(title)}
published: ${datePart}
description: ${yamlQuote(description)}
category: ${yamlQuote(category)}${tagsLine}
draft: ${draft}
---

${content}
`;

	if (args["dry-run"]) {
		console.log(`\n${OK} 预览（--dry-run，未写文件）：将创建 src/content/posts/${slug}.md\n`);
		console.log(file);
		return;
	}

	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, file, "utf8");

	console.log(`\n${OK} 文章已生成：src/content/posts/${slug}.md`);
	console.log(`   标题：${title}`);
	console.log(`   分类：${category}${tags.length > 0 ? `　标签：${tags.join(" / ")}` : ""}${draft === "true" ? "　（草稿）" : ""}`);
	console.log(`   下一步：Studio 点「发布并构建」上线${draft === "true" ? "（草稿不会显示，写完把 draft 改 false 再构建）" : ""}`);
}

main().catch((error: unknown) => {
	console.error(`${FAIL} ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
});
