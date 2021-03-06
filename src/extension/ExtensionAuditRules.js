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
goog.require('axs.ExtensionAuditRule');

goog.provide('axs.ExtensionAuditRules');

/**
 * Gets the audit rule with the given name.
 * @param {string} name
 * @return {axs.ExtensionAuditRule}
 */
axs.ExtensionAuditRules.getRule = function(name) {
    if (!axs.ExtensionAuditRules.rules) {
        /** @type Object.<string, axs.ExtensionAuditRule> */
        axs.ExtensionAuditRules.rules = {};
        var auditRules = axs.AuditRules.getRules();
        for (var i = 0; i < auditRules.length; i++) {
            var auditRule = new axs.ExtensionAuditRule(auditRules[i]);
            axs.ExtensionAuditRules.rules[auditRule.name] = auditRule;
        }
    }

    return axs.ExtensionAuditRules.rules[name];
};
