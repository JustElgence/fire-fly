/**
 * memo-to-post：把 Memos 动态转正为博客文章
 *
 * 自动模式（配合 GitHub Actions 定时任务，无需参数）：
 *   pnpm memo-to-post --auto
 *   扫描 Memos，把带 #转文章 标记的动态自动转成文章文件（直接发布态）；
 *   memo 在 Memos 里被编辑过（updateTime 变化）会自动重新同步到同一篇文章；
 *   已处理的记入仓库根目录 .memo-to-post-state.json，不会重复转正。
 *
 * 手动模式（转指定一条，用于不等定时、或需要精细控制）：
 *   pnpm memo-to-post --list                          # 列出最近动态，挑一条
 *   pnpm memo-to-post <memo链接或ID> [选项]
 *   pnpm memo-to-post https://memos.teardrop.cn/m/1781 --dry-run
 *   选项：--title --category --tags --description --slug --draft --dry-run
 *
 * 转正后 Memos 原文不动；发布仍需去 Studio 点一次构建（或 pnpm build）。
 */
import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { dynamicConfig } from "../src/config";

const OK = "\x1b[32m✓\x1b[0m";
const FAIL = "\x1b[31m✗\x1b[0m";

/** 自动转正的触发标记：动态正文里带 #转文章 即视为要发布成文章 */
const POST_MARKER = process.env.MEMO_POST_TAG || "转文章";
const STATE_FILE = ".memo-to-post-state.json";

interface MemoAttachment {
	name: string;
	filename: string;
	type: string;
}

interface Memo {
	name: string;
	createTime: string;
	updateTime: string;
	content: string;
	attachments?: MemoAttachment[];
}

interface StateEntry {
	slug?: string;
	skipped?: string;
	/** 上次转正时的 memo updateTime，用于检测后续编辑并重新同步 */
	updateTime?: string;
}

interface State {
	processed: Record<string, StateEntry>;
}

interface ConvertOptions {
	title?: string;
	category?: string;
	tags?: string[];
	description?: string;
	slug?: string;
	draft?: boolean;
	dryRun?: boolean;
	/** 从正文里剔除的标记词（如「转文章」），同时不会进入文章 tags */
	stripMarkers?: string[];
}

function parseArgs(argv: string[]) {
	const args: Record<string, string | boolean> = {};
	const positional: string[] = [];
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--list" || a === "--draft" || a === "--dry-run" || a === "--auto") {
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

function extractMemoId(input: string): string {
	const m =
		input.match(/(?:\/m\/|memos\/)([A-Za-z0-9_-]+)\/?$/) ||
		input.match(/^([A-Za-z0-9_-]+)$/);
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

function plainText(markdown: string): string {
	return markdown
		.replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
		.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
		.replace(/[#>*_`~[\]()-]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function pickTitle(content: string): string | undefined {
	for (const raw of content.split("\n")) {
		const line = raw.trim();
		if (!line) continue;
		if (line.startsWith("![") || line.startsWith("<")) continue;
		return line.replace(/^#{1,6}\s*/, "").replace(/[*_`~]/g, "").slice(0, 80);
	}
	return undefined;
}

function yamlQuote(text: string): string {
	return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

async function exists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function loadState(): Promise<State> {
	try {
		return JSON.parse(await fs.readFile(STATE_FILE, "utf8")) as State;
	} catch {
		return { processed: {} };
	}
}

async function saveState(state: State): Promise<void> {
	await fs.writeFile(STATE_FILE, `${JSON.stringify(state, null, "\t")}\n`, "utf8");
}

/** 生成文章内容并写入；existingSlug 用于编辑重同步（覆盖同一文件，链接不变） */
async function convertMemo(
	memo: Memo,
	state: State,
	options: ConvertOptions = {},
): Promise<string> {
	const apiUrl = dynamicConfig.memos.apiUrl.replace(/\/+$/, "");
	let content = memo.content;
	// Memos 编辑器/附件插入的图片是相对路径（/file/...），文章页上不可达，补全为实例绝对地址
	content = content.replace(/\]\(\s*(\/?file\/)/g, `](${apiUrl}/file/`);
	for (const marker of options.stripMarkers ?? []) {
		content = content
			.replace(new RegExp(`(?<=^|\\s)#${marker}(?=\\s|$)`, "g"), "")
			.replace(/[ \t]+\n/g, "\n")
			.trim();
	}

	const title = options.title || pickTitle(content);
	if (!title) {
		throw new Error("正文里找不到可作标题的文字行，请用 --title 指定");
	}

	const inlineTags = [...content.matchAll(/(?<=^|\s)#([^\s#.,!?，。！？]+)/g)].map((m) => m[1]);
	const tags = [
		...new Set([
			...(options.tags ?? []),
			...inlineTags.filter((t) => !(options.stripMarkers ?? []).includes(t)),
		]),
	]
		.filter(Boolean)
		.slice(0, 8);

	const bodyText = plainText(content);
	const description = options.description || `${bodyText.slice(0, 60)}${bodyText.length > 60 ? "…" : ""}`;

	// 正文里没有引用到的图片附件，追加到文末（与动态页的展示习惯一致）
	const attachedImages = (memo.attachments ?? [])
		.filter((a) => a.type?.startsWith("image/") && a.filename && !content.includes(a.filename))
		.map((a) => {
			const id = a.name.split("/").pop();
			return `![${a.filename}](${apiUrl}/file/attachments/${id}/${a.filename})`;
		});
	if (attachedImages.length > 0) content = `${content}\n\n${attachedImages.join("\n\n")}`;

	// slug：优先使用已有（编辑重同步，保持 URL 稳定），否则按日期+随机生成并查重
	const datePart = memo.createTime.slice(0, 10);
	let slug = options.slug || `${datePart}-${randomBytes(3).toString("hex")}`;
	let filePath = path.resolve("src/content/posts", `${slug}.md`);
	if (!options.slug) {
		while (await exists(filePath)) {
			slug = `${datePart}-${randomBytes(3).toString("hex")}`;
			filePath = path.resolve("src/content/posts", `${slug}.md`);
		}
	}

	const category = options.category || "日常";
	const tagsLine = tags.length > 0 ? `\ntags: [${tags.map(yamlQuote).join(", ")}]` : "";
	const file = `---
title: ${yamlQuote(title)}
published: ${datePart}
description: ${yamlQuote(description)}
category: ${yamlQuote(category)}${tagsLine}
draft: ${options.draft ? "true" : "false"}
---

${content.trimEnd()}
`;

	if (options.dryRun) {
		console.log(`\n${OK} 预览（--dry-run，未写文件）：将创建 src/content/posts/${slug}.md\n`);
		console.log(file);
		return slug;
	}

	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, file, "utf8");
	state.processed[memo.name] = { slug, updateTime: memo.updateTime };
	console.log(`  ${OK} ${memo.name} -> src/content/posts/${slug}.md（${title}）`);
	return slug;
}

async function main() {
	const { args, positional } = parseArgs(process.argv.slice(2));

	// ---- --list：列出最近动态供挑选 ----
	if (args.list) {
		const all = await fetchMemos();
		if (all.length === 0) {
			console.log("实例暂无动态");
			return;
		}
		console.log(`最近 ${all.length} 条动态：`);
		for (const memo of all.slice(0, 20)) {
			const id = memo.name.split("/").pop();
			const preview = plainText(memo.content).slice(0, 30) || "（仅图片）";
			console.log(`  ${id}  ${memo.createTime.slice(0, 16)}  ${preview}`);
		}
		return;
	}

	const state = await loadState();
	let stateDirty = false;

	// ---- --auto：转正带标记的新动态 + 同步被编辑过的已转正动态 ----
	if (args.auto) {
		const all = await fetchMemos();
		const markerRe = new RegExp(`(?<=^|\\s)#${POST_MARKER}(?=\\s|$)`);

		// 1) 编辑重同步：已转正、带 updateTime 记录、Memos 里 updateTime 有变化、标记还在
		const toSync = all.filter((memo) => {
			const entry = state.processed[memo.name];
			return (
				entry?.slug &&
				entry?.updateTime &&
				memo.updateTime !== entry.updateTime &&
				markerRe.test(memo.content)
			);
		});

		// 2) 新转正：未处理且带标记
		const fresh = all.filter((memo) => !state.processed[memo.name] && markerRe.test(memo.content));

		console.log(
			`扫描 ${all.length} 条动态：${fresh.length} 条新待转正，${toSync.length} 条有编辑待重新同步`,
		);
		if (fresh.length === 0 && toSync.length === 0) return;

		if (fresh.length > 0) {
			console.log("转正新文章：");
			for (const memo of fresh) {
				try {
					await convertMemo(memo, state, { draft: !!args.draft, stripMarkers: [POST_MARKER] });
					stateDirty = true;
				} catch (error) {
					// 无标题等不可转正的内容也记入状态，避免每次运行都重试
					state.processed[memo.name] = {
						skipped: error instanceof Error ? error.message : String(error),
					};
					stateDirty = true;
					console.warn(`  ${FAIL} 跳过 ${memo.name}：${error instanceof Error ? error.message : String(error)}`);
				}
			}
		}

		if (toSync.length > 0) {
			console.log("重新同步编辑过的文章：");
			for (const memo of toSync) {
				try {
					await convertMemo(memo, state, {
						slug: state.processed[memo.name].slug, // 覆盖同一文件，链接不变
						stripMarkers: [POST_MARKER],
					});
					stateDirty = true;
				} catch (error) {
					console.warn(`  ${FAIL} 同步失败 ${memo.name}：${error instanceof Error ? error.message : String(error)}`);
				}
			}
		}

		if (!args["dry-run"] && stateDirty) {
			await saveState(state);
			console.log(`${OK} 状态已写入 ${STATE_FILE}`);
			console.log("下一步：去 Studio 点「发布并构建」上线");
		}
		return;
	}

	// ---- 手动模式：转指定一条 ----
	if (positional.length === 0) {
		console.error(`${FAIL} 缺少 memo 链接或 ID。先用 pnpm memo-to-post --list 挑一条，或用 --auto 自动扫描`);
		process.exit(1);
	}
	const memoId = extractMemoId(positional[0]);

	const memos = dynamicConfig.memos;
	console.log(`正在从 ${memos.apiUrl} 获取 memo ${memoId} ...`);
	const all = await fetchMemos();
	const memo = all.find((m) => m.name.split("/").pop() === memoId);
	if (!memo) {
		console.error(
			`${FAIL} 没找到 memo ${memoId}。用 pnpm memo-to-post --list 查看可选的 ID（注意：仅限 ${memos.parent} 名下、对博客可见的动态）`,
		);
		process.exit(1);
	}

	const slug = await convertMemo(memo, state, {
		title: args.title as string | undefined,
		category: args.category as string | undefined,
		tags: args.tags ? String(args.tags).split(",").map((t) => t.trim()).filter(Boolean) : undefined,
		description: args.description as string | undefined,
		slug: args.slug as string | undefined,
		draft: !!args.draft,
		dryRun: !!args["dry-run"],
		stripMarkers: [POST_MARKER],
	});

	if (!args["dry-run"]) {
		await saveState(state);
		console.log(`   下一步：Studio 点「发布并构建」上线${args.draft ? "（草稿不会显示，写完把 draft 改 false 再构建）" : ""}`);
	}
}

main().catch((error: unknown) => {
	console.error(`${FAIL} ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
});
