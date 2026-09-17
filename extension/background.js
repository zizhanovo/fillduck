// 后台只做一件事：点工具栏图标时打开侧边栏。不读取任何网页内容。
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((e) => console.error('设置侧边栏行为失败', e));
