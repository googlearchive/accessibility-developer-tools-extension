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

if (chrome.devtools.inspectedWindow.tabId) {
    chrome.extension.sendRequest({ tabId: chrome.devtools.inspectedWindow.tabId,
                                   command: 'injectContentScripts' }, init);
}

function init(result) {
    if (result && 'error' in result) {
        console.warn('Could not initialise extension:' + result.error);
        return;
    }

    var numAuditRules = Object.keys(axs.AuditRule.specs).length;
    var category = chrome.experimental.devtools.audits.addCategory(
        chrome.i18n.getMessage('auditTitle'));

    category.onAuditStarted.addListener(getAuditPrefs);

    chrome.devtools.panels.elements.createSidebarPane(
        chrome.i18n.getMessage('sidebarTitle'),
        function(sidebar) {
            sidebar.setPage("sidebar.html");
            sidebar.onShown.addListener(function(window) {
                window.sidebar = sidebar;
            })
        });
}

function getAuditPrefs(auditResults) {
    chrome.extension.sendRequest({ tabId: chrome.devtools.inspectedWindow.tabId,
                                   command: 'getAuditPrefs' },
                                 auditRunCallback.bind(null, auditResults));
}

function auditRunCallback(auditResults, items) {
    if ('auditRules' in items)
        var prefs = items['auditRules'];
    else
        var prefs = {};
    chrome.devtools.inspectedWindow.eval(
        'axs.content.frameURIs',
        { useContentScriptContext: true },
        onURLsRetrieved.bind(null, auditResults, prefs));
}

function onURLsRetrieved(auditResults, prefs, urls) {
    auditResults.numAuditRules = 0;
    auditResults.resultsPending = 0;
    auditResults.successfulResults = 0;
    auditResults.callbacksPending = 0;
    auditResults.passedRules = {};
    auditResults.notApplicableRules = {};
    auditResults.failedRules = {};
    var maxResults = 100;  // TODO(alice): pref for maxResults
    for (var auditRuleName in axs.AuditRule.specs) {
        // Run rules by default, fill in prefs for previously unseen rules
        if (!(auditRuleName in prefs))
            prefs[auditRuleName] = true;
        var auditRule = axs.ExtensionAuditRules.getRule(auditRuleName);
        if (!auditRule.disabled && prefs[auditRuleName]) {
            var urlValues = Object.keys(urls);
            for (var i = 0; i < urlValues.length; i++) {
                var frameURL = urlValues[i];
                var resultsCallback = handleResults.bind(null, auditResults, auditRule,
                                                         auditRule.severity, frameURL,
                                                         maxResults);
                var auditOptions = { 'maxResults': maxResults };
                if (auditRule.requiresConsoleAPI) {
                    auditRule.runInDevtools(auditOptions, resultsCallback);
                } else {
                    var stringToEval =
                        'var rule = axs.ExtensionAuditRules.getRule("' + auditRuleName + '");\n' +
                        'rule.run(' + JSON.stringify(auditOptions) + ');';
                    chrome.devtools.inspectedWindow.eval(
                        stringToEval,
                        { useContentScriptContext: true,
                          frameURL: frameURL },
                        resultsCallback);
                }
                auditResults.resultsPending += 1;
            }
            auditResults.numAuditRules += 1;
        }
    }
    // Write filled in prefs back to storage
    chrome.storage.sync.set({'auditRules': prefs});
}

function handleResults(auditResults, auditRule, severity, frameURL, maxResults, results, isException) {
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
    var resultCallbacksPending = 0;
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
        for (var i = 0; i < results.elements.length; ++i) {
            var result = results.elements[i];
             if (auditResults.createNode) {
                if (resultNodes.length < maxResults) {
                    resultNodes.push(
                        auditResults.createNode('axs.content.getResultNode("' + result + '")',
                                                { useContentScriptContext: true,
                                                  frameURL: frameURL }));
                }
            } else {
                function addChild(auditResults, result) {
                    if (resultNodes.length < maxResults)
                        resultNodes.push(auditResults.createSnippet(result));
                    auditResults.callbacksPending--;
                    resultCallbacksPending--;
                }
                auditResults.callbacksPending++;
                resultCallbacksPending++;
                chrome.devtools.inspectedWindow.eval(
                    'axs.content.getResultNode("' + result + '").outerHTML',
                    { useContentScriptContext: true },
                    addChild.bind(null, auditResults));
            }
        }
    }
    if (auditResults.resultsPending == 0 && !auditResults.callbacksPending && !resultCallbacksPending)
        finalizeAuditResults(auditResults);
}

function addResult(auditResults, auditRuleName, resultNodes) {
    var auditRule = axs.ExtensionAuditRules.getRule(auditRuleName);
    var severity = chrome.i18n.getMessage('auditResult_' + auditRule.severity);
    ruleName = chrome.i18n.getMessage(auditRuleName + '_name');
    if (ruleName == '')
        ruleName = auditRule.heading;
    var resultString = '[' + severity + '] ' + ruleName + ' (' + resultNodes.length + ')';
    var url = chrome.i18n.getMessage(auditRuleName + '_url');
    if (url == '')
        url = auditRule.url;
    if (url && url != '') {
        var textNode1 = chrome.i18n.getMessage('auditUrl_before');
        var urlNode = auditResults.createURL(url, auditRule.code);
        var textNode2 = chrome.i18n.getMessage('auditUrl_after');
        resultNodes.unshift(textNode2);
        resultNodes.unshift(urlNode);
        resultNodes.unshift(textNode1);
    }
    auditResults.addResult(resultString,
                           '',
                           auditResults.Severity[auditRule.severity],
                           auditResults.createResult(resultNodes));
}

function finalizeAuditResultsIfNothingPending(auditResults) {
    if (auditResults.resultsPending == 0 &&
        auditResults.successfulResults < auditResults.numAuditRules &&
        !auditResults.callbacksPending)
        finalizeAuditResults(auditResults);
}

function finalizeAuditResults(auditResults) {
    for (var ruleName in auditResults.failedRules) {
        var resultNodes = auditResults.failedRules[ruleName];
        addResult(auditResults, ruleName, resultNodes);
    }

    var failedRules = Object.keys(auditResults.failedRules);
    for (var i = 0; i < failedRules.length; i++) {
        var auditRuleName = failedRules[i];
        delete auditResults.passedRules[auditRuleName];
        delete auditResults.notApplicableRules[auditRuleName];
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
