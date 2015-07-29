ACCESSIBILITY_UTILS = ./lib/accessibility-developer-tools/src
AUDIT_RULES = $(shell find $(ACCESSIBILITY_UTILS)/audits -name "*.js" | sed -e "s/^/--js /g")
NUM_AUDIT_RULES = $(shell echo `find ./lib/accessibility-developer-tools/src/audits -name "*.js" | wc -l`)
NUM_AUDIT_RULE_SOURCES = `expr $(NUM_AUDIT_RULES) + 4`
EXTERNS = ./src/js/externs.js
LIB_EXTERNS = $(ACCESSIBILITY_UTILS)/js/externs/externs.js

GENERATED_JS_FILES_DIR = ./extension/generated
TEMPLATES_LIB_FILE = ./extension/Handlebar.js
TEST_DIR = ./test
TEST_DEPENDENCIES_FILE = generated_dependencies.js
TEST_DEPENDENCIES_REL_DIR = generated
OUTPUT_WRAPPER = 'if (!axs) var axs = {}; if (!goog) var goog = {}; %s'

CLOSURE_JAR = ~/src/closure/compiler.jar
EXTENSION_CLOSURE_COMMAND = java -jar $(CLOSURE_JAR) --language_in=ECMASCRIPT5 \
--formatting PRETTY_PRINT --summary_detail_level 3 --compilation_level SIMPLE_OPTIMIZATIONS \
--warning_level VERBOSE --externs $(EXTERNS) --externs $(LIB_EXTERNS) \
--module axs:3 \
  --js ./lib/accessibility-developer-tools/lib/closure-library/closure/goog/base.js \
  --js ./lib/accessibility-developer-tools/lib/closure-library/closure/goog/object/object.js \
  --js $(ACCESSIBILITY_UTILS)/js/axs.js \
--module constants:1:axs \
  --js $(ACCESSIBILITY_UTILS)/js/Constants.js \
  --module_wrapper constants:$(OUTPUT_WRAPPER) \
--module utils:4:constants \
  --js $(ACCESSIBILITY_UTILS)/js/Color.js \
  --js $(ACCESSIBILITY_UTILS)/js/DOMUtils.js \
  --js $(ACCESSIBILITY_UTILS)/js/AccessibilityUtils.js \
  --js $(ACCESSIBILITY_UTILS)/js/BrowserUtils.js \
  --js $(ACCESSIBILITY_UTILS)/js/DOMUtils.js \
  --module_wrapper utils:$(OUTPUT_WRAPPER) \
--module properties:1:utils,constants \
  --js $(ACCESSIBILITY_UTILS)/js/Properties.js \
  --module_wrapper properties:$(OUTPUT_WRAPPER) \
--module audits:$(NUM_AUDIT_RULE_SOURCES):constants,utils \
  --js $(ACCESSIBILITY_UTILS)/js/AuditResults.js \
  --js $(ACCESSIBILITY_UTILS)/js/Audit.js \
  --js $(ACCESSIBILITY_UTILS)/js/AuditRule.js \
  --js $(ACCESSIBILITY_UTILS)/js/AuditRules.js \
  $(AUDIT_RULES) \
  --module_wrapper audits:$(OUTPUT_WRAPPER) \
--module extension_properties:2:properties \
  --js ./src/extension/ContentScriptFramework.js \
  --js ./src/extension/ExtensionProperties.js \
  --module_wrapper extension_properties:$(OUTPUT_WRAPPER) \
--module extension_audits:2:audits,extension_properties \
  --js ./src/extension/ExtensionAuditRule.js \
  --js ./src/extension/ExtensionAuditRules.js \
  --module_wrapper extension_audits:$(OUTPUT_WRAPPER)

MODULES = axs constants utils content properties audits

.PHONY: clean js

js: clean
	@echo "\nStand back! I'm rebuilding!\n---------------------------"
	@/bin/echo -n "* Rebuilding generated JS modules: "
	@/bin/echo -n "$(EXTENSION_CLOSURE_COMMAND) --module_output_path_prefix $(GENERATED_JS_FILES_DIR)/"
	@/bin/echo
	@$(EXTENSION_CLOSURE_COMMAND) --module_output_path_prefix $(GENERATED_JS_FILES_DIR)/ && \
    echo "SUCCESS"
	@/bin/echo -n "* Copying axe lib to $(GENERATED_JS_FILES_DIR): "
	@/bin/cp ./lib/axe-core/dist/axe.js $(GENERATED_JS_FILES_DIR) && \
    echo "SUCCESS"
	@/bin/echo -n "* Copying Handlebar.js to $(TEMPLATES_LIB_FILE): "
	@/bin/cp ./lib/templates/js/HandlebarBrowser.js $(TEMPLATES_LIB_FILE) && \
    echo "SUCCESS"

clean:
	@rm -rf $(GENERATED_JS_FILES_DIR) $(TEMPLATES_LIB_FILE) $(TEST_DIR)/$(TEST_DEPENDENCIES_REL_DIR)
