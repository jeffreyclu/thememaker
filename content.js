(async () => {
    const src = chrome.runtime.getURL("src/index.js");
    await import(src);
})();
