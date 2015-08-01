// Copyright 2015 Google Inc.
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

/**
 * Override axe.utils.DqElement to use axs.content.convertNodeToResult
 */
axe.utils.DqElement = function (element, spec) {
    'use strict';
    spec = spec || {};

    /**
     * A unique, single-use ID for the element.
     * @type {String}
     * If the spec exists, we know that we are looking at an element that lives inside
     * a sub-frame. If not, we know we are looking at the lowest element in the chain.
     * When we are the lowest element, we want our selector to contain our URL
     */
    if (!spec || !spec.selector) {
        var url = element.ownerDocument.defaultView.location.href;
        var length = ((url.indexOf('#') === -1) ? url.length : url.indexOf('#'));
        url = url.substring(0, length);
        this.selector = [ url + '#' + axe.utils.getSelector(element)];
    } else {
        this.selector = spec.selector || [''];
    }

    /**
     * The generated HTML source code of the element is not needed in this instance.
     * @type {String}
     */
    this.source = '';

    /**
     * The element which this object is based off or the containing frame, used for sorting.
     * Excluded in toJSON method.
     * @type {HTMLElement}
     */
    this.element = element;
};


if (window.top === window) {
    chrome.runtime.onConnect.addListener(function (port) {
        if (port.name !== 'axeContent') {
            return;
        }
        port.onMessage.addListener(function(msg) {
          switch(msg.command) {
            case "runAxeRule":
              axe.a11yCheck(document, {runOnly:{type:"rule", values:[msg.ruleId]}}, function (results) {
                port.postMessage({results: results, ruleId: msg.ruleId});
              });
          }
        });
    });
}
