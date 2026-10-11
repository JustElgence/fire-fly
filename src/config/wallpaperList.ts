// ============================================================================
// 壁纸清单 - 由本地壁纸管理页（/wallpaper-admin）自动生成与维护
// Wallpaper manifest - managed by the local wallpaper admin page
//
// 请勿手工编辑本文件：上传/删除壁纸时会整体重写。
// 路径格式与 backgroundWallpaper.src 一致（src 目录相对路径，不带前导 /）。
// desktop/mobile 至少各保留 1 张，管理页会阻止删空。
// ============================================================================

export const wallpaperList: {
	desktop: string[];
	mobile: string[];
} = {
	desktop: [
		"assets/images/DesktopWallpaper/genshin.avif",
		"assets/images/DesktopWallpaper/wuwa.avif",
	],
	mobile: [
		"assets/images/MobileWallpaper/genshin.avif",
		"assets/images/MobileWallpaper/wuwa.avif",
	],
};
