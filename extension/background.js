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
                    'generated/extension_audits.js' ]
    injectContentScript(tabId, scripts, opt_callback);
}

chrome.extension.onRequest.addListener(
    function(request, sender, callback) {
        switch(request.command) {
        case 'injectContentScripts':
            var tabId = request.tabId;
            var framesLoaded = {};
            injectContentScripts(tabId, callback);
            var framesInjected = [];
            if (inspectedTabs.indexOf(tabId) == -1) {
                chrome.webNavigation.onBeforeNavigate.addListener(
                    function(details) {
                        if (details.tabId == tabId && details.frameId == 0) {
                            framesLoaded = {};
                            framesInjected = null;
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
                            framesInjected = Object.keys(framesLoaded);
                        } else if (framesInjected &&
                                   framesInjected.indexOf(String(details.frameId)) == -1) {
                            // If a frame completes loading after the top frame, we need to inject
                            // content scripts into all frames again, so that we catch this one.
                            injectContentScripts(tabId);
                            framesInjected.push(String(details.frameId));
                        } else {
                            // If a frame completes loading before the top frame, keep track of it
                            // so we know what frames we're injecting content scripts into.
                            framesLoaded[details.frameId] = true;
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
