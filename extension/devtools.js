// Copyright 2012 Google Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

var scriptsInjected = false;
var couldNotInjectScripts = false;
var contentScript = null;
var port;

/**
 * create a connection to the background page and listen for the
 * connection to close. This happens when the target browser loads
 * a new page. Which means we need to inject the scripts again and
 * reconnect.
 *
 * The port is used in a quasi-synchronous fashion. A listener will
 * be attached when the script is being injected and then removed.
 * This means that no other communication can happen until the
 * response comes back from the injection (however, no other request
 * makes sense until the script has been injected anyway)
 */
function setupPort() {
    port = chrome.runtime.connect({name: 'axs.devtools'});
    port.onDisconnect.addListener(function () {
        console.log('port disconnected');
        port = undefined;
        scriptsInjected = false;
        couldNotInjectScripts = false;
    });
}

var category = chrome.experimental.devtools.audits.addCategory(
    chrome.i18n.getMessage('auditTitle'));

function fetchContentScript() {
  var scriptFile = 'generated/content.js'
  try {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', chrome.extension.getURL(scriptFile), false);
    xhr.send();
    contentScript = xhr.responseText;
  } catch(ex) {
    console.error('Could not get script "' + scriptFile + '";  aborting.',
                  ex);
  }
}

function injectScripts(after) {
    var callback = function (result) {
        if (result.err) {
            console.warn('Could not inject content script; falling back to eval', result.err.message);
            couldNotInjectScripts = true;
            fetchContentScript();
        } else {
            scriptsInjected = true;
        }
        after();
        port.onMessage.removeListener(callback);
    };
    port.onMessage.addListener(callback);
    port.postMessage({
        command: 'injectScript',
        tabId: chrome.devtools.inspectedWindow.tabId
    });
}

/**
 * This listener is called when the user starts an audit. It
 * will open up a port to the background page and inject the
 * scripts into the target page before doing anything else if
 * this is needed (first time an analysis is done on the active
 * page)
 */

category.onAuditStarted.addListener(function (auditResults) {
    if (!port) {
        setupPort();
    }
    if (!scriptsInjected && !couldNotInjectScripts) {
        injectScripts(getAllPrefs.bind(null, auditResults));
    } else {
        getAllPrefs(auditResults);
    }
});


/**
 * Setup the sidebar panel and listen for its show event
 */

chrome.devtools.panels.elements.createSidebarPane(
    chrome.i18n.getMessage('sidebarTitle'),
    function(sidebar) {
        sidebar.setPage("sidebar.html");
        sidebar.onShown.addListener(function(window) {
            function setup() {
                window.sidebar = sidebar;
                window.sidebar.contentScriptInjected = scriptsInjected;
                if (!contentScriptInjected)
                    window.sidebar.allScripts = contentScript;
                window.onSelectionChanged();
            }
            if (!port) {
                setupPort();
            }
            if (!scriptsInjected) {
                injectScripts(setup);
            } else {
                setup();
            }
        });
    });

function getAllPrefs(auditResults) {
    chrome.extension.sendRequest({ command: 'getAllPrefs' },
        auditRunCallback.bind(null, auditResults));
}

function auditRunCallback(auditResults, prefs) {
    var toEval = (couldNotInjectScripts ? contentScript : '') + '\naxs.content.frameURIs';
    chrome.devtools.inspectedWindow.eval(
        toEval,
        { useContentScriptContext: !couldNotInjectScripts },
        onURLsRetrieved.bind(null, auditResults, prefs));
}

function onURLsRetrieved(auditResults, prefs, urls) {
    auditResults.numAuditRules = 0;
    auditResults.resultsPending = 0;
    auditResults.axeResultsPending = 0;
    auditResults.successfulResults = 0;
    auditResults.passedRules = {};
    auditResults.notApplicableRules = {};
    auditResults.failedRules = {};
    auditResults.failedAxeRules = {};
    auditResults.axeRules = {};
    auditResults.truncatedRules = {};
    auditResults.maxResults = 100;  // TODO(alice): pref for maxResults

    var auditOptions = { 'maxResults': auditResults.maxResults };
    var runInDevtoolsAuditOptions = { 'maxResults': auditResults,
                                      'contentScriptInjected': scriptsInjected };
    var auditRuleNames = axs.AuditRules.getRules(true);
    var auditRulePrefs = prefs.auditRules || {};
    auditRuleNames.forEach(function(auditRuleName) {
        // Run rules by default, fill in prefs for previously unseen rules
        if (!(auditRuleName in auditRulePrefs))
            auditRulePrefs[auditRuleName] = true;
        var auditRule = axs.ExtensionAuditRules.getRule(auditRuleName);
        if (!auditRule.disabled && auditRulePrefs[auditRuleName]) {
            var resultsCallback = handleResults.bind(null, auditResults, auditRule,
                                                         auditRule.severity, frameURL);
            if (auditRule.requiresConsoleAPI) {
                auditRule.runInDevtools(runInDevtoolsAuditOptions, resultsCallback);
                auditResults.resultsPending += 1;
            } else if (!couldNotInjectScripts) {
                var urlValues = Object.keys(urls);
                for (var i = 0; i < urlValues.length; i++) {
                    var frameURL = urlValues[i];

                    var stringToEval =
                        'var rule = axs.ExtensionAuditRules.getRule("' + auditRuleName + '");\n' +
                        'rule.run(' + JSON.stringify(auditOptions) + ');';

                    chrome.devtools.inspectedWindow.eval(
                        stringToEval,
                        { useContentScriptContext: true,
                          frameURL: frameURL },
                        resultsCallback);
                    auditResults.resultsPending += 1;
                }
            } else {
                var stringToEval =
                    'var rule = axs.ExtensionAuditRules.getRule("' + auditRuleName + '");\n' +
                    'rule.run(' + JSON.stringify(auditOptions) + ');';

                chrome.devtools.inspectedWindow.eval(
                    stringToEval,
                    { useContentScriptContext: false },
                    resultsCallback);

                auditResults.resultsPending += 1;
            }
            auditResults.numAuditRules += 1;
        }
    });
    chrome.extension.sendRequest({ command: 'setPrefs', prefs: { auditRules: auditRulePrefs } });
    if (prefs.useAxe && !couldNotInjectScripts) {
        var axeRuleNames = axe.getRules();
        axeRuleNames.forEach(function(axeRule) {
            var axeResultsCallback = handleAxeResults.bind(null, auditResults, axeRule);
            var callback = function (msg) {
                if (msg.ruleId === axeRule.ruleId) {
                    axeResultsCallback(msg.results);
                    port.onMessage.removeListener(callback);
                }
            }
            port.postMessage({ tabId: chrome.devtools.inspectedWindow.tabId,
                               command: 'runAxeRule',
                               ruleId: axeRule.ruleId });
            port.onMessage.addListener(callback);
            auditResults.axeResultsPending += 1;
            auditResults.axeRules[axeRule.ruleId] = axeRule;
        });
    }
}

function handleAxeResults(auditResults, axeRule, result, isException) {
    auditResults.axeResultsPending--;
    // Should only be one, but it comes wrapped in an object
    if (result.violations.length !== 0) {
        for (var violation of result.violations) {
            var resultNodes = [];
            if (!(violation.id in auditResults.failedAxeRules))
                auditResults.failedAxeRules[violation.id] = resultNodes;
            else
                resultNodes = auditResults.failedAxeRules[violation.id];
            var nodes = violation.nodes;
            for (var node of nodes) {
                var info = node.target[node.target.length - 1];
                var frameURL = info.substring(0, info.indexOf('#'));
                var nodeId = info.replace(frameURL + '#', '');
                resultNodes.push(
                    auditResults.createNode('axs.content.getResultElement("' + nodeId + '")',
                                            { useContentScriptContext: !couldNotInjectScripts,
                                              frameURL: frameURL }));
            }
        }
    }
    if (auditResults.resultsPending == 0 && auditResults.axeResultsPending == 0)
        finalizeAuditResults(auditResults);
}

function handleResults(auditResults, auditRule, severity, frameURL, results, isException) {
    auditResults.resultsPending--;
    if (isException) {
        console.warn(auditRule.name, 'had an error: ', results);
        finalizeAuditResultsIfNothingPending(auditResults);
        return;
    } else if (!results) {
        console.warn(auditRule.name, 'had no results')
        finalizeAuditResultsIfNothingPending(auditResults);
        return;
    }
    if (results.error) {
        console.warn(auditRule.name, 'had an error:', results.error);
        finalizeAuditResultsIfNothingPending(auditResults);
        return;
    }
    auditResults.successfulResults++;
    if (results.result == axs.constants.AuditResult.PASS) {
        auditResults.passedRules[auditRule.name] = true;
    } else if (results.result == axs.constants.AuditResult.NA ) {
        auditResults.notApplicableRules[auditRule.name] = true;
    } else {
        var resultNodes = [];
        if (!(auditRule.name in auditResults.failedRules))
            auditResults.failedRules[auditRule.name] = resultNodes;
        else
            resultNodes = auditResults.failedRules[auditRule.name];

        if (results.resultsTruncated)
            auditResults.truncatedRules[auditRule.name] = true;

        for (var i = 0; i < results.elements.length; ++i) {
            var result = results.elements[i];
            if (resultNodes.length < auditResults.maxResults) {
                resultNodes.push(
                    auditResults.createNode('axs.content.getResultNode("' + result + '")',
                                            { useContentScriptContext: !couldNotInjectScripts,
                                              frameURL: frameURL }));
            } else {
                auditResults.truncatedRules[auditRule.name] = true;
                break;
            }
        }
    }
    if (auditResults.resultsPending == 0 && auditResults.axeResultsPending == 0)
        finalizeAuditResults(auditResults);
}

function addResult(auditResults, auditRuleName, resultNodes, truncated) {
    var auditRule = axs.ExtensionAuditRules.getRule(auditRuleName);
    var severity = chrome.i18n.getMessage('auditResult_' + auditRule.severity);
    ruleName = chrome.i18n.getMessage(auditRuleName + '_name');
    if (ruleName == '')
        ruleName = auditRule.heading;
    var resultString = '[' + severity + '] ' + ruleName + ' (' + resultNodes.length +
        (truncated ? '+' : '') + ')';
    if (truncated) {
        var truncatedMessage = chrome.i18n.getMessage('truncatedResults', [auditResults.maxResults]);
        resultNodes.unshift(truncatedMessage);
    }
    var url = chrome.i18n.getMessage(auditRuleName + '_url');
    if (url == '')
        url = auditRule.url;
    if (url && url != '') {
        var textNode1 = chrome.i18n.getMessage('auditUrl_before');
        var urlNode = auditResults.createURL(url, auditRule.code);
        var textNode2 = chrome.i18n.getMessage('auditUrl_after');
        if (truncated)
            resultNodes.unshift(' ');
        resultNodes.unshift(textNode2);
        resultNodes.unshift(urlNode);
        resultNodes.unshift(textNode1);
    }
    auditResults.addResult(resultString,
                           '',
                           auditResults.Severity[auditRule.severity],
                           auditResults.createResult(resultNodes));
}

function addAxeResult(auditResults, axeRuleId, resultNodes) {
    var axeRule = auditResults.axeRules[axeRuleId];
    var isBestPractice = axeRule.tags.indexOf('best-practice') >= 0;
    var severity = isBestPractice ? auditResults.Severity.Info : auditResults.Severity.Severe;
    var severityString = isBestPractice ? 'aXe Best Practice' : 'aXe Violation';
    var resultString = '[' + severityString + '] ' + axeRule.help + ' (' + resultNodes.length + ')';
    var url = axeRule.helpUrl;
    if (url && url != '') {
        var textNode1 = chrome.i18n.getMessage('auditUrl_before');
        var urlNode = auditResults.createURL(url, axeRuleId);
        var textNode2 = chrome.i18n.getMessage('auditUrl_after');
        resultNodes.unshift(textNode2);
        resultNodes.unshift(urlNode);
        resultNodes.unshift(textNode1);
    }
    auditResults.addResult(resultString, '', severity, auditResults.createResult(resultNodes));
}

function finalizeAuditResultsIfNothingPending(auditResults) {
    if (auditResults.resultsPending == 0 &&
        auditResults.axeResultsPending == 0 &&
        auditResults.successfulResults < auditResults.numAuditRules)
        finalizeAuditResults(auditResults);
}

function finalizeAuditResults(auditResults) {
    for (var ruleName in auditResults.failedRules) {
        var resultNodes = auditResults.failedRules[ruleName];
        var truncated = !!auditResults.truncatedRules[ruleName];
        addResult(auditResults, ruleName, resultNodes, truncated);
    }

    var failedRules = Object.keys(auditResults.failedRules);
    for (var i = 0; i < failedRules.length; i++) {
        var auditRuleName = failedRules[i];
        delete auditResults.passedRules[auditRuleName];
        delete auditResults.notApplicableRules[auditRuleName];
    }

    for (var axeRuleId in auditResults.failedAxeRules) {
        var axeResultNodes = auditResults.failedAxeRules[axeRuleId];
        addAxeResult(auditResults, axeRuleId, axeResultNodes);
    }

    var passedRules = Object.keys(auditResults.passedRules);
    if (passedRules.length > 0) {
        var passedDetails = auditResults.createResult(chrome.i18n.getMessage('passingTestsTitle'));
        for (var i = 0; i < passedRules.length; i++) {
            var auditRuleName = passedRules[i];
            delete auditResults.notApplicableRules[auditRuleName];
            var ruleHeading = chrome.i18n.getMessage(auditRuleName + '_name');
            if (!ruleHeading || ruleHeading == '') {
                var auditRule = axs.ExtensionAuditRules.getRule(auditRuleName);
                ruleHeading = auditRule.heading;
            }
            passedDetails.addChild(ruleHeading);
        }
        auditResults.addResult(chrome.i18n.getMessage('passingTestsSubtitle', [passedRules.length]),
                               '',
                               auditResults.Severity.Info,
                               passedDetails);
    }
    var notApplicableRules = Object.keys(auditResults.notApplicableRules);
    if (notApplicableRules.length > 0) {
        var notApplicableDetails = auditResults.createResult(chrome.i18n.getMessage('notApplicableTestsTitle'));
        for (var i = 0; i < notApplicableRules.length; i++) {
            var auditRuleName = notApplicableRules[i];
            var ruleHeading = chrome.i18n.getMessage(auditRuleName + '_name');
            if (!ruleHeading || ruleHeading == '') {
                var auditRule = axs.ExtensionAuditRules.getRule(auditRuleName);
                ruleHeading = auditRule.heading;
            }
            notApplicableDetails.addChild(ruleHeading);
        }
        auditResults.addResult(chrome.i18n.getMessage('notApplicableTestsSubtitle', [notApplicableRules.length]),
                               '',
                               auditResults.Severity.Info,
                               notApplicableDetails);
    }
    auditResults.done();
}
