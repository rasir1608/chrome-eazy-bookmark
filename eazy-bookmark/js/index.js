(function () {
  const SHOW_DRAWER = "show-drawer";
  const STORAGE_COLOR = "EAZY_BOOKMARK_THEME_COLOR";
  const FOLDER_STATUSE_ENUM = {
    NONE: 0,
    EXPENDED: 1,
    UN_EXPEND: 2,
  };

  const TAG_NAMES = {
    CLOSE_BTN_CLASS: "eazy-bookmark-close",
    LIST_ITEM_ICON_CLASS: "eazy-bookmark-list-item-icon",
    LIST_ITEM_CLASS: "eazy-bookmark-list-item",
    LIST_ITEM_A_CLASS: "eazy-bookmark-list-item-a",
    BACKGROUND_THEME_INPUT_ID: "eazy-bookmark-theme",
    KEYWROD_INPUT_CLEAR_CLASS: "eazy-bookmark-keyword-clear",
    KEYWROD_INPUT_ID: "eazy-bookmark-keyword-input",
    BOOKMARK_LIST_ID: "eazy-bookmark-list",
  };
  const wrapperId = "eazy-bookmark-drawer";
  let rootDom;
  let hideTimer;
  let bodyTimer;
  let closeBtn;
  let bgInput;
  let listDom;
  // 所有收藏到书签的元素
  let bookmarkTreeList = [];
  // 书签的目录列表
  let dirTreeList = [];
  // 书签与目录，目录与目录之间的归属关系
  let bookmarkRelationMap = new Map();
  let bookmarkDataList = [];
  let keyword = "";
  const fragment = document.createDocumentFragment();

  function initPage() {
    console.log("eazy-bookmark loaded");
    document.body.addEventListener("click", () => {
      if (bodyTimer) clearTimeout(bodyTimer);
      bodyTimer = setTimeout(() => {
        if (document.querySelector("#" + wrapperId)) {
          hide();
        }
      }, 100);
    });
    chrome.runtime.onMessage.addListener((request) => {
      const { cmd, treeList } = request;
      if (cmd === SHOW_DRAWER) {
        bookmarkDataList = ((treeList || [])[0] || {}).children || [];
        show();
      }
    });
  }

  async function initDom() {
    closeBtn = rootDom.querySelector("." + TAG_NAMES.CLOSE_BTN_CLASS);
    bgInput = rootDom.querySelector("#" + TAG_NAMES.BACKGROUND_THEME_INPUT_ID);
    keywrodClearBtn = rootDom.querySelector(
      "." + TAG_NAMES.KEYWROD_INPUT_CLEAR_CLASS
    );
    keywrodInput = rootDom.querySelector("#" + TAG_NAMES.KEYWROD_INPUT_ID);
    listDom = rootDom.querySelector("#" + TAG_NAMES.BOOKMARK_LIST_ID);
    const defaultColor = (await getLocalStroage(STORAGE_COLOR)) || "#ffe4c4";
    bgInput.defaultValue = defaultColor;
    changeBgColor(defaultColor);
    initTreeData(bookmarkDataList);
    bgInput.addEventListener("input", async (event) => {
      const inputColor = event.target.value;
      changeBgColor(inputColor);
      await saveLocalStorage(STORAGE_COLOR, inputColor);
    });
    keywrodInput.addEventListener("input", async (event) => {
      keyword = event.target.value;
      reflushListTreeDom();
    });
    keywrodInput.addEventListener("keydown", async (event) => {
      const { keyCode } = event;
      if (keyCode === 13) {
        reflushListTreeDom();
      }
    });
    keywrodClearBtn.addEventListener("click", () => {
      if (keyword) {
        keyword = "";
        keywrodInput.value = "";
        reflushListTreeDom();
      }
    });
    closeBtn.addEventListener("click", () => {
      hide();
    });
  }

  function initTreeData(list) {
    listDom.innerHTML = "";
    fragment.innerHTML = "";
    bookmarkRelationMap.clear();
    bookmarkTreeList = [];
    dirTreeList = [];
    const paddingLeft = 20;
    recursionTree(list, 0, "a");
    /* 递归树状结构数据 */
    function recursionTree(list, depth, parentKey) {
      list.forEach((item) => {
        const { parentId, title, index, dateAdded, children, id, url } = item;
        const key = `${parentKey}-${id}`;
        const isLeaf = !Array.isArray(children);
        const itemDom = document.createElement("li");
        itemDom.classList.add(TAG_NAMES.LIST_ITEM_CLASS);
        itemDom.style.paddingLeft = `${depth * paddingLeft}px`;
        itemDom.style.cursor = "pointer";
        itemDom.id = key;
        if (!isLeaf) {
          itemDom.title = `${title || ""}`;
          const iconDom = document.createElement("span");
          iconDom.className = TAG_NAMES.LIST_ITEM_ICON_CLASS;
          iconDom.innerHTML = "-";
          itemDom.appendChild(iconDom);
          const titleDom = document.createElement("h3");
          titleDom.innerHTML = `${title || ""}`;
          itemDom.appendChild(titleDom);
        } else {
          itemDom.title = `${title || ""}\n${url || ""}`;
          const aDom = document.createElement("a");
          aDom.classList.add(TAG_NAMES.LIST_ITEM_A_CLASS);
          aDom.href = url;
          aDom.target = "_blank";
          const iconDom = document.createElement("img");
          const location = new URL(url);
          iconDom.src = getFaviconURL(location.origin);
          iconDom.width = 20;
          iconDom.height = 20;
          aDom.appendChild(iconDom);
          const divDom = document.createElement("div");
          aDom.appendChild(divDom);
          const titleDom = document.createElement("p");
          titleDom.innerHTML = `${title || ""}`;
          const urlDom = document.createElement("p");
          urlDom.innerHTML = `${url || ""}`;
          divDom.appendChild(titleDom);
          divDom.appendChild(urlDom);
          itemDom.appendChild(aDom);
        }
        const treeNode = {
          key,
          isLeaf,
          status: isLeaf
            ? FOLDER_STATUSE_ENUM.NONE
            : FOLDER_STATUSE_ENUM.EXPENDED,
          parentKey,
          parentId,
          title,
          index,
          dateAdded,
          id,
          el: itemDom,
          depth,
          url,
          children,
          isShow: true,
        };
        if (!bookmarkRelationMap.has(parentKey)) {
          bookmarkRelationMap.set(parentKey, []);
        }
        const relationBookmark = bookmarkRelationMap.get(parentKey);
        relationBookmark.push(treeNode);
        appendTreeNodeDomToFragment(itemDom);
        if (!isLeaf) {
          dirTreeList.push(treeNode);
          itemDom.addEventListener("click", () => toggleExpend(treeNode));
          recursionTree(children, depth + 1, key);
        } else {
          bookmarkTreeList.push(treeNode);
        }
      });
    }
    listDom.appendChild(fragment);
    bookmarkDataList = undefined;
  }

  // 收起或者展开
  function toggleExpend(item, needExpend) {
    const { status, isLeaf, key, el: itemDom } = item;
    if (isLeaf) return;
    // true 展开 false 收起
    // 如果指定展开或者收起就直接使用指定的值，否则通过节点状态来判断
    const willExpend =
      needExpend !== undefined
        ? needExpend
        : status === FOLDER_STATUSE_ENUM.UN_EXPEND;
    changeExpendIcon(itemDom, willExpend);
    item.status = willExpend
      ? FOLDER_STATUSE_ENUM.EXPENDED
      : FOLDER_STATUSE_ENUM.UN_EXPEND;
    const childNodes = bookmarkRelationMap.get(key);
    childNodes.forEach((childData) => {
      const { el: childNode, isLeaf } = childData;
      childNode.style.display = willExpend ? "flex" : "none";
      if (!isLeaf) {
        toggleExpend(childData, false);
      }
    });
  }

  function changeExpendIcon(itemDom, willExpend) {
    const iconDom = itemDom.querySelector("." + TAG_NAMES.LIST_ITEM_ICON_CLASS);
    if (iconDom) {
      iconDom.innerHTML = willExpend ? "-" : "+";
    }
  }

  /* 构建标签列表树 */
  function appendTreeNodeDomToFragment(itemDom) {
    fragment.appendChild(itemDom);
  }

  /* 刷新标签列表树 */
  function reflushListTreeDom() {
    bookmarkTreeList.forEach((treeNode) => {
      const { title, url, el: itemDom } = treeNode;
      if (keyword) {
        if (title.includes(keyword) || (url || "").includes(keyword)) {
          itemDom.style.display = "flex";
        } else {
          itemDom.style.display = "none";
        }
      } else itemDom.style.display = "flex";
      treeNode.isShow = itemDom.style.display !== "none";
    });
    reflushDirTreeDom();
  }

  /* 刷新文件夹状态 */
  const cacheDirMap = new Map();
  function reflushDirTreeDom() {
    cacheDirMap.clear();
    dirTreeList.forEach((dirNode) => {
      if (cacheDirMap.has(dirNode.key)) return;
      getAndAdjustDirStatus(dirNode, cacheDirMap);
    });
  }

  /* 修正目录的展开状态 */
  function getAndAdjustDirStatus(dirNode, cacheDirMap) {
    const { key } = dirNode;
    cacheDirMap.set(key, 1);
    const childNodes = bookmarkRelationMap.get(key);
    let isExpend = false;
    childNodes.forEach((childNode) => {
      const { isLeaf, isShow } = childNode;
      let ret = isLeaf ? isShow : getAndAdjustDirStatus(childNode, cacheDirMap);
      if (ret) isExpend = true;
    });
    dirNode.status = isExpend
      ? FOLDER_STATUSE_ENUM.EXPENDED
      : FOLDER_STATUSE_ENUM.UN_EXPEND;
    changeExpendIcon(dirNode.el, isExpend);
    return isExpend;
  }

  /* 修改背景色 */
  function changeBgColor(color) {
    bgInput.style.backgroundColor = color;
    rootDom.style.backgroundColor = color;
  }

  async function getLocalStroage(key) {
    const storage = await chrome.storage.local.get();
    return JSON.parse(storage[key] || JSON.stringify(null));
  }

  async function saveLocalStorage(key, value) {
    await chrome.storage.local.set({ [key]: JSON.stringify(value) });
  }

  async function show() {
    if (!rootDom) {
      hideTimer = undefined;
      rootDom = document.createElement("div");
      rootDom.innerHTML = createInnerHtml();
      rootDom.id = wrapperId;
      rootDom.style.transition = "all .2s ease";
      rootDom.classList.add("hide");
      rootDom.addEventListener("click", () => {
        setTimeout(() => {
          if (bodyTimer) clearTimeout(bodyTimer);
        }, 50);
      });
      await initDom();
    }
    if (hideTimer) {
      clearTimeout(hideTimer);
    } else {
      document.body.appendChild(rootDom);
    }

    setTimeout(() => {
      rootDom.classList.remove("hide");
      rootDom.classList.add("show");
    }, 100);
  }

  function hide() {
    if (!rootDom || hideTimer) return;
    rootDom.classList.remove("show");
    rootDom.classList.add("hide");
    hideTimer = setTimeout(() => {
      hideTimer = undefined;
      document.body.removeChild(rootDom);
    }, 300);
  }

  /* 获取网页的favicon缓存文件 */
  function getFaviconURL(origin) {
    const url = new URL(chrome.runtime.getURL("/_favicon/"));
    url.searchParams.set("pageUrl", origin);
    url.searchParams.set("size", "32");
    return url.toString();
  }

  function createInnerHtml() {
    return ` <div class="eazy-bookmark-wrapper">
  <div class="eazy-bookmark-head">
    <div class="eazy-bookmark-head-inner">
        <label class="eazy-bookmark-theme-selector"
        >背景色
        <input type="color" name="theme" id="eazy-bookmark-theme" />
        </label>
        <div class="eazy-bookmark-title">书签</div>
        <div class="eazy-bookmark-close">
          <span>x</span>
        </div>
    </div>
  </div>
  <div class="eazy-bookmark-filters">
    <div class="eazy-bookmark-keyword-input-wrapper">
      <input
      id="eazy-bookmark-keyword-input"
      type="text"
      placeholder="请输入网站名称或者url"
      />
      <div class="eazy-bookmark-keyword-clear">
          <span>x</span>
      </div>
    </div>
  </div>
  <ul id="eazy-bookmark-list"></ul>
</div>`;
  }
  initPage();
})();
