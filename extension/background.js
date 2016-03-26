// Map of tabId to either a callback or an empty object.
var inspectedTabs = {};

// Map of tabId to a token indicating which iteration of content script injection is current.
var contentScriptTokens = {};

var ports = [];

function runAxeRule(ruleId, tabId, port) {
    if (!ports[tabId]) {
        // set up a connection to content
        ports[tabId] = chrome.tabs.connect(tabId, {name: 'axeContent'});
        ports[tabId].onMessage.addListener(function (msg) {
            // send response back to devtools
            port.postMessage(msg);
        });
        ports[tabId].onDisconnect.addListener(function () {
            // When the user navigates away from the page, remove the
            // closed port and tell devtools to trash its port too
            ports.splice(tabId, 1);
            port.disconnect();
        });
    }
    // send request to content
    ports[tabId].postMessage({ command: 'runAxeRule', ruleId: ruleId });
}

function injectContentScript(tabId, port) {
    chrome.tabs.executeScript(
        tabId, {
            file: 'generated/content.js',
            allFrames: true
        }, function(arg) {
            port.postMessage({
                command: 'injectScript',
                err: chrome.runtime.lastError
            });
        });
}

// Asynchronous calls from devtools
chrome.runtime.onConnect.addListener(function (port) {
    // handle connection from devtools
    if (port.name !== 'axs.devtools') {
        return;
    }
    port.onMessage.addListener(function(msg) {
        switch(msg.command) {
        case 'runAxeRule':
            console.log('running aXe rule: ', msg.ruleId);
            runAxeRule(msg.ruleId, msg.tabId, port);
            return;
        case 'injectScript':
            console.log('injecting script');
            injectContentScript(msg.tabId, port);
            return;
        }
    });
});

// Synchronous calls from devtools
chrome.extension.onRequest.addListener(
    function(request, sender, callback) {
        switch(request.command) {
        case 'getAllPrefs':
            chrome.storage.sync.get(null, callback);
            return;
        case 'setPrefs':
            console.log('setPrefs', request);
            chrome.storage.sync.set(request.prefs)
            return;
        }
});
