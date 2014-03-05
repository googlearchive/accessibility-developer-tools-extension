var inspectedTabs = [];

function injectContentScript(tabId, remaining_scripts, opt_callback) {
    var script = remaining_scripts.shift();
    chrome.tabs.executeScript(
        tabId,
        { file: script, allFrames: true },
        function() {
            if (chrome.extension.lastError) {
                if (opt_callback)
                    opt_callback({ error: chrome.extension.lastError.message });
                return;
            }
            if (remaining_scripts.length)
                injectContentScript(tabId, remaining_scripts, opt_callback);
            else if (opt_callback)
                opt_callback({ success: true });
        });
};

function injectContentScripts(tabId, opt_callback) {
    var scripts = [ 'generated/axs.js',
                    'generated/constants.js',
                    'generated/utils.js',
                    'generated/properties.js',
                    'generated/audits.js',
                    'generated/extension_properties.js',
                    'generated/extension_audits.js' ];
    injectContentScript(tabId, scripts, opt_callback);
}

chrome.extension.onRequest.addListener(
    function(request, sender, callback) {
        switch(request.command) {
        case 'injectContentScripts':
            var tabId = request.tabId;
            injectContentScripts(tabId, callback);
            if (inspectedTabs.indexOf(tabId) == -1) {
                chrome.webNavigation.onCommitted.addListener(
                    function(details) {
                        if (details.tabId == tabId && details.frameId == 0) {
                            injectContentScripts(tabId);
                        }
                    });
            }
            inspectedTabs.push(tabId);
            return;
        case 'getAuditPrefs':
            chrome.storage.sync.get('auditRules', callback);
            return;
        }
});
