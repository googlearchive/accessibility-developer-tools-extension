Copyright 2013 Google Inc. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

[http://www.apache.org/licenses/LICENSE-2.0](http://www.apache.org/licenses/LICENSE-2.0)

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

# Accessibility Developer Tools (extension)

You can install the Accessibility Developer Tools extension from the [Chrome Web Store page](https://chrome.google.com/webstore/detail/accessibility-developer-t/fpkknkljclfencbdbgkenhalefipecmb?utm_source=chrome-ntp-icon).

# Checkout, build and run

## Checkout

```
git clone --recursive https://github.com/GoogleChrome/accessibility-developer-tools-extension.git
```

## Build
Download the [http://dl.google.com/closure-compiler/compiler-latest.zip](Closure compiler jar) and put it in ~/src/closure/compiler.jar.

```
cd accessibility-developer-tools-extension
make
```

This will run Closure compiler on all the JS sources and place generated outputs in `extension`.

## Run

First, you need to enable the "experimental extension APIs" flag on chrome://flags. This will require restarting Chrome to take effect.

The [http://developer.chrome.com/extensions/getstarted.html#unpacked](Chrome extension developer documentation) has the instructions for loading an unpacked extension; `extension` is the the directory containing the manifest, so this should be the directory you load.

Note: if you already have the web store version of Accessibility Developer Tools, you might want to modify the manifest (`extension/manifest.json`) to display a different name for your local copy. This does not require re-building the project.

