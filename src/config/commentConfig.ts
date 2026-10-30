// giscus 已指向本站源码仓库 JustElgence/fire-fly（repoId 已从 GitHub API 获取）。
// 首次启用前还需在 GitHub 仓库完成 3 步（见 https://giscus.app/zh-CN）：
//   1. 仓库 Settings → General → Features → 勾选 Discussions
//   2. 安装 giscus App：https://github.com/apps/giscus
//   3. 在 https://giscus.app/zh-CN 输入 JustElgence/fire-fly，
//      选择讨论分类 General，把页面下方的 data-category-id 填入 categoryId
import type { CommentConfig } from "../types/commentConfig";

export const commentConfig: CommentConfig = {
	// 评论系统类型: none, twikoo, waline, giscus, disqus, artalk，默认为none，即不启用评论系统
	type: "giscus",

	//twikoo评论系统配置
	twikoo: {
		envId: "https://twikoo.vercel.app",
		// 设置 Twikoo 评论系统语言
		lang: "zh-CN",
		// 是否启用文章访问量统计功能
		visitorCount: true,
		// Twikoo JS 文件地址，支持 CDN 链接
		// 中国推荐1: https://registry.npmmirror.com/twikoo/1.7.14/files/dist/twikoo.min.js
		// 中国推荐2: https://s4.zstatic.net/npm/twikoo@1.7.14/dist/twikoo.min.js
		// 国际推荐: https://cdn.jsdelivr.net/npm/twikoo@1.7.14/dist/twikoo.min.js
		jsUrl: "https://cdn.jsdelivr.net/npm/twikoo@1.7.14/dist/twikoo.min.js",
		// Twikoo 自定义 CSS 文件地址，为空则不加载
		cssUrl: "/assets/css/twikoo-custom.css",
	},

	//waline评论系统配置
	waline: {
		// waline 后端服务地址
		serverURL: "https://waline.vercel.app",
		// 设置 Waline 评论系统语言
		lang: "zh-CN",
		// 设置 Waline 评论系统表情地址
		emoji: [
			"https://unpkg.com/@waline/emojis@1.4.0/weibo",
			"https://unpkg.com/@waline/emojis@1.4.0/bilibili",
			"https://unpkg.com/@waline/emojis@1.4.0/bmoji",
		],
		// 评论登录模式。可选值如下：
		//   'enable'   —— 默认，允许访客匿名评论和用第三方 OAuth 登录评论，兼容性最佳。
		//   'force'    —— 强制必须登录后才能评论，适合严格社区，关闭匿名评论。
		//   'disable'  —— 禁止所有登录和 OAuth，仅允许匿名评论（填写昵称/邮箱），适用于极简留言。
		login: "enable",
		// 是否启用文章访问量统计功能
		visitorCount: true,
	},

	// artalk评论系统配置
	artalk: {
		// artalk后端程序 API 地址
		server: "https://artalk.example.com/",
		// 设置 Artalk 语言
		locale: "zh-CN",
		// 是否启用文章访问量统计功能
		visitorCount: true,
	},

	//giscus评论系统配置
	giscus: {
		// 设置 Giscus 评论系统仓库（本站源码仓库，公开）
		repo: "JustElgence/fire-fly",
		// 设置 Giscus 评论系统仓库ID（来自 GitHub API 的 repo node_id）
		repoId: "R_kgDOQ5k4-A",
		// 设置 Giscus 评论系统分类
		category: "General",
		// 获取 Giscus 评论系统分类ID
		// TODO: 仓库开启 Discussions 后，从 https://giscus.app/zh-CN 获取 General 分类的 ID 填入
		categoryId: "DIC_TODO_需要从giscus.app获取",
		// 获取 Giscus 评论系统映射方式
		// pathname：按页面路径绑定讨论串，标题改动不会丢评论
		mapping: "pathname",
		// 获取 Giscus 评论系统严格模式
		strict: "0",
		// 获取 Giscus 评论系统反应功能
		reactionsEnabled: "1",
		// 获取 Giscus 评论系统元数据功能
		emitMetadata: "1",
		// 获取 Giscus 评论系统输入位置
		inputPosition: "top",
		// 获取 Giscus 评论系统语言
		lang: "zh-CN",
		// 获取 Giscus 评论系统加载方式
		loading: "lazy",
	},

	//disqus评论系统配置
	disqus: {
		// 获取 Disqus 评论系统
		shortname: "firefly",
	},
};
