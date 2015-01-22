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

goog.require('axs.AuditRule');

goog.provide('axs.ExtensionAuditRule');


/**
 * @extends {axs.AuditRule}
 * @constructor
 * @param {axs.AuditRule} auditRule
 */
axs.ExtensionAuditRule = function(auditRule) {
    goog.object.extend(auditRule, this);
    return auditRule;
};

/**
 * Add the given element to the given array. This is to abstract calls to
 * convertNodeToResult() away from the main code.
 * @param {Array.<Element>} elements
 * @param {Element} element
 */
axs.ExtensionAuditRule.prototype.addElement = function(elements, element) {
    elements.push(axs.content.convertNodeToResult(element));
};

/**
 * @param {Object} options
 *     Optional named parameters:
 *     ignoreSelectors: Selectors for parts of the page to ignore for this rule.
 *     scope: The scope in which the element selector should run.
 *         Defaults to `document`.
 *     maxResults: The maximum number of results to collect. If more than this
 *         number of results is found, 'resultsTruncated' is set to true in the
 *         returned object. If this is null or undefined, all results will be
 *         returned.
 * @param {function()} resultsCallback Will be called with results in the form
 *     {?Object.<string, (axs.constants.AuditResult|?Array.<Element>|boolean)>}
 */
axs.ExtensionAuditRule.prototype.runInDevtools = function(options, resultsCallback) {
    var extensionId = chrome.runtime.id;
    var uniqueEventName = extensionId + '-' + this.name;
    options = options || {};
    var maxResults = 'maxResults' in options ? options.maxResults : null;
    function addEventListener(uniqueEventName, test, addElement, maxResults) {
        function testElement(event) {
            if (maxResults && window.relevantNodes &&
                window.relevantNodes.length >= maxResults) {
                window.resultsTruncated = true;
                return;
            }
            var element = event.target;
            window.relevantNodes.push(element);
            if (test(element))
                addElement(window.failingNodes, element);
        }
        window.relevantNodes = [];
        window.failingNodes = [];
        document.addEventListener(uniqueEventName, testElement, false);
    }
    var toEval = '(' + addEventListener + ')("'+
        uniqueEventName + '", ' + this.test_ +
        ', ' + this.addElement  + ', ' + maxResults + ')'
    var contentScriptInjected = options['contentScriptInjected'];
    chrome.devtools.inspectedWindow.eval(
        toEval, { useContentScriptContext: contentScriptInjected });

    function sendRelevantNodesToContentScript(matcher, eventName) {
        var relevantElements = [];
        axs.AuditRule.collectMatchingElements(document, matcher, relevantElements);
        for (var i = 0; i < relevantElements.length; i++) {
            var node = relevantElements[i];
            var event = document.createEvent('Event');
            event.initEvent(eventName, true, false);
            node.dispatchEvent(event);
        }
    }
    var stringToEval = '(function() { var axs = {};\n' +
        'axs.utils = {};\n' +
        // TODO all of axs.utils? Have selected methods in AuditRule?
        'axs.utils.parentElement = ' + axs.utils.parentElement + ';\n' +
        'axs.utils.isElementHidden = ' + axs.utils.isElementHidden + ';\n' +
        'axs.utils.isElementOrAncestorHidden = ' + axs.utils.isElementOrAncestorHidden + ';\n' +
        'axs.utils.isElementImplicitlyFocusable = ' + axs.utils.isElementImplicitlyFocusable + ';\n' +
        'axs.AuditRule = {};\n' +
        'axs.AuditRule.collectMatchingElements = ' + axs.AuditRule.collectMatchingElements + ';\n' +
        'var relevantElementMatcher = ' + this.relevantElementMatcher_ + ';\n' +
        'var sendRelevantNodesToContentScript = ' + sendRelevantNodesToContentScript + ';\n' +
        'sendRelevantNodesToContentScript(relevantElementMatcher, "' +
        uniqueEventName + '"); })()';
    chrome.devtools.inspectedWindow.eval(stringToEval);

    function retrieveResults() {
        var result = axs.constants.AuditResult.NA;
        if (window.relevantNodes.length)
            result = window.failingNodes.length ? axs.constants.AuditResult.FAIL : axs.constants.AuditResult.PASS;
        window.relevantNodes.length = 0;

        var failingNodes = window.failingNodes.slice(0);
        window.failingNodes.length = 0;

        var results = { result: result, elements: failingNodes };
        if (window.truncatedResults)
            results.truncatedResults = true;
        delete window.truncatedResults;

        return results;
    }
    toEval = '(' + retrieveResults + ')()';
    chrome.devtools.inspectedWindow.eval(
        toEval, { useContentScriptContext: contentScriptInjected }, resultsCallback);
};
