const SHOW_DRAWER = "show-drawer";

function init() {
  const manageBtn = document.getElementById(
    "eazy-bookmark-menu-list-item-manager"
  );
  const queryBtn = document.getElementById(
    "eazy-bookmark-menu-list-item-query"
  );

  manageBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: "chrome://bookmarks/" });
  });

  queryBtn.addEventListener("click", () => {
    chrome.bookmarks.getTree(async function (treeList) {
      const message = {
        cmd: SHOW_DRAWER,
        treeList,
      };
      await sendMessageToInitScript(message);
    });
  });
}

/**
 * 发送消息到init.js
 * @param {*} message
 * @returns
 */
async function sendMessageToInitScript(message) {
  const tabList = await chrome.tabs.query({ active: true });
  const response = await chrome.tabs.sendMessage(tabList[0].id, message);
  return response;
}

init();
