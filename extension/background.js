var inspectedTabs = [];
var contentScriptTokens = {};

function injectContentScript(tabId, remaining_scripts, token, opt_callback) {
    if (token != contentScriptTokens[tabId]) {
        console.log('out of date token:', token, 'does not match', contentScriptTokens[tabId]);
        return;
    }
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
                injectContentScript(tabId, remaining_scripts, token, opt_callback);
            else if (opt_callback)
                opt_callback({ success: true });
        });
};

function injectContentScripts(tabId, opt_callback) {
chrome.tabs.executeScript(tabId, { code: 'console.log("about to inject scripts");' });
    console.log('injecting content scripts');
    if (!(tabId in contentScriptTokens)) {
        console.log(tabId, 'not in', contentScriptTokens);
        contentScriptTokens[tabId] = 0;
    } else {
        console.log(tabId, 'in', contentScriptTokens, '; incrementing');
        contentScriptTokens[tabId]++;
    }
    var token = contentScriptTokens[tabId];
    console.log('token', token);
    var scripts = [ 'generated/axs.js',
                    'generated/constants.js',
                    'generated/utils.js',
                    'generated/properties.js',
                    'generated/audits.js',
                    'generated/extension_properties.js',
                    'generated/extension_audits.js' ]
    injectContentScript(tabId, scripts, token, opt_callback);
}

chrome.extension.onRequest.addListener(
    function(request, sender, callback) {
        switch(request.command) {
        case 'injectContentScripts':
            var tabId = request.tabId;
            injectContentScripts(tabId, callback);
            var topFrameLoaded = true;
            if (inspectedTabs.indexOf(tabId) == -1) {
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
                        console.log('frame', details.frameId, 'completed loading');
                        if (details.frameId == 0) {
                            console.log('page reloaded; injecting content scripts');
                            // When the top frame completes loading, inject content scripts into all
                            // frames. Copy the list of all frames seen so far into |framesInjected|
                            injectContentScripts(tabId);
                            topFrameLoaded = true;
                        } else if (topFrameLoaded) {
                            console.log('frame', details.frameId, details.url,
                                        'completed after top frame; re-injecting content scripts');
                            // If a frame completes loading after the top frame, we need to inject
                            // content scripts into all frames again, so that we catch this one.
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
