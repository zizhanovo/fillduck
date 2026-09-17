// 后台只做一件事：点工具栏图标时打开侧边栏。不读取任何网页内容。
// 侧边栏在两家浏览器里不是同一个 API：Chrome / Edge 用 sidePanel，Firefox 用 sidebar_action。
// 这里两条路都写，各自只走自己支持的那条，插件源码保持一份。
const sidePanel = chrome.sidePanel; // Chromium 系
const sidebarAction = chrome.sidebarAction; // Firefox

if (sidePanel?.setPanelBehavior) {
  // Chromium：让点击工具栏图标直接展开侧边栏
  sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((e) => console.error('设置侧边栏行为失败', e));
} else if (sidebarAction?.open) {
  // Firefox：sidebar_action 没有「点击即展开」的开关，自己在这一下点击里打开
  chrome.action.onClicked.addListener(() => {
    sidebarAction.open().catch((e) => console.error('打开侧边栏失败', e));
  });
}
