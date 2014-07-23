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

goog.provide('axs.content');
goog.require('axs.utils');

if (!axs.content.auditResultNodes) {
    /**
     * @type {Object.<string, Node>}
     */
    axs.content.auditResultNodes = {};
}

if (!axs.content.sidebarNodes) {
    /**
     * @type {Object.<string, Node>}
     */
    axs.content.sidebarNodes = {};
}

if (!axs.content.lastNodeId) {
    /** @type {number} */
    axs.content.lastNodeId = 0;
}

/**
 * @param {Node} node
 * @return {string} the ID of the node for lookup
 */
axs.content.convertNodeToResult = function(node) {
    var nodeId = '' + axs.content.lastNodeId++;
    axs.content.auditResultNodes[nodeId] = node;
    return nodeId;
};

/**
 * @param {string} nodeId
 * @return {?Node}
 */
axs.content.getResultNode = function(nodeId) {
    var resultNode = axs.content.auditResultNodes[nodeId];
    delete axs.content.auditResultNodes[nodeId];
    return resultNode;
};

/**
 * @param {Node} node
 * @return {string} the ID of the node for lookup
 */
axs.content.convertNodeToSidebar = function(node) {
    var nodeId = '' + axs.content.lastNodeId++;
    axs.content.sidebarNodes[nodeId] = node;
    return nodeId;
};

/**
 * @param {string} nodeId
 * @return {Node} node
 */
axs.content.getSidebarNode = function(nodeId) {
    var node = axs.content.sidebarNodes[nodeId];
    delete axs.content.sidebarNodes[nodeId];
    return node;
};

axs.content.removeFragment = function(url) {
    var a = /** @type HTMLAnchorElement */ (document.createElement('a'));
    a.href = url;
    return a.protocol + "//" + a.host + a.pathname + a.search
}

if (!axs.content.frameURIs) {
    axs.content.frameURIs = {};
    axs.content.frameURIs[axs.content.removeFragment(document.documentURI)] = true;
}

window.addEventListener('message',  function(e) {
    if (typeof e.data != 'object')
        return;
    if ('request' in e.data) {
        switch (e.data['request']) {
        case 'getUri':
            e.source.postMessage(
                { 'request': 'postUri',
                  'uri': axs.content.removeFragment(document.documentURI) },
                '*')
            break;
        case 'postUri':
            if (window.parent != window) {
                window.parent.postMessage(e.data, '*')
            } else {
                var uri = e.data['uri'];
                axs.content.frameURIs[uri] = true;
            }
            break;
        case 'deleteUri':
            if (window.parent != window) {
                window.parent.postMessage(e.data, '*')
            } else {
                var uri = e.data['uri'];
                delete axs.content.frameURIs[uri];
            }
        }
    }
}, false);

window.addEventListener('beforeunload', function(e) {
  if (window.parent == window)
      return;

  window.parent.postMessage({'request': 'deleteUri' ,
                             'uri': axs.content.removeFragment(document.documentURI)},
                            '*');

}, false);

(function() {
var iframes = window.frames;
for (var i = 0; i < iframes.length; i++) {
    var iframe = iframes[i];
    var docOrigin = axs.content.removeFragment(document.documentURI);
    try {
        iframe.postMessage({'request': 'getUri'}, '*');
    } catch (e) {
        console.warn('got exception when trying to postMessage from ' +
                     docOrigin + ' to frame', iframe, e);
    }
}
})();
