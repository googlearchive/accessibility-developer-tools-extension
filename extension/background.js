var inspectedTabs = {};
var contentScriptTokens = {};

function injectContentScript(tabId, remaining_scripts, token) {
    if (token != contentScriptTokens[tabId]) {
        return;
    }
    var script = remaining_scripts.shift();
    chrome.tabs.executeScript(
        tabId,
        { file: script, allFrames: true },
        function() {
            if (chrome.extension.lastError) {
                if ('callback' in inspectedTabs[tabId]) {
                    var callback = inspectedTabs[tabId].callback;
                    callback({ error: chrome.extension.lastError.message });
                    delete inspectedTabs[tabId].callback;
                }
                return;
            }
            if (remaining_scripts.length)
                injectContentScript(tabId, remaining_scripts, token);
            else if ('callback' in inspectedTabs[tabId]) {
                var callback = inspectedTabs[tabId].callback;
                callback({ success: true });
                delete inspectedTabs[tabId].callback;
            }
        });
};

function injectContentScripts(tabId) {
    if (!(tabId in contentScriptTokens)) {
        contentScriptTokens[tabId] = 0;
    } else {
        contentScriptTokens[tabId]++;
    }
    var token = contentScriptTokens[tabId];
    var scripts = [ 'generated/axs.js',
                    'generated/constants.js',
                    'generated/utils.js',
                    'generated/properties.js',
                    'generated/audits.js',
                    'generated/extension_properties.js',
                    'generated/extension_audits.js' ]
    injectContentScript(tabId, scripts, token);
}

chrome.extension.onRequest.addListener(
    function(request, sender, callback) {
        switch(request.command) {
        case 'injectContentScripts':
            var tabId = request.tabId;
            var topFrameLoaded = true;
            if (!(tabId in inspectedTabs)) {
                chrome.webNavigation.onBeforeNavigate.addListener(
                    function(details) {
                        if (details.tabId == tabId && details.frameId == 0) {
                            topFrameLoaded = false;
                        }
                    });
                chrome.webNavigation.onCompleted.addListener(
                    function(details) {
                        if (details.tabId != tabId)
                            return;
                        if (details.frameId == 0) {
                            // When the top frame completes loading, inject content scripts into all
                            // frames. Copy the list of all frames seen so far into |framesInjected|
                            injectContentScripts(tabId);
                            topFrameLoaded = true;
                        } else if (topFrameLoaded) {
                            // If a frame completes loading after the top frame, we need to inject
                            // content scripts into all frames again, so that we catch this one.
                            injectContentScripts(tabId);
                        }
                    });
            }
            inspectedTabs[tabId] = { callback: callback };
            injectContentScripts(tabId);
            return;
        case 'getAuditPrefs':
            chrome.storage.sync.get('auditRules', callback);
            return;
        }
});
