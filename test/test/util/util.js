/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

goog.provide('shaka.test.Util');


/**
 * Fakes an event loop. Each tick processes some number of instantaneous
 * operations and advances the simulated clock forward by 1 second. Calls
 * opt_onTick just before each tick if it's specified.
 *
 * @param {number} duration The number of seconds of simulated time.
 * @param {function(number)=} opt_onTick
 */
shaka.test.Util.fakeEventLoop = function(duration, opt_onTick) {
  expect(window.Promise).toBe(shaka.polyfill.Promise);

  // Run this synchronously:
  for (var time = 0; time < duration; ++time) {
    // We shouldn't need more than 6 rounds.
    for (var i = 0; i < 6; ++i) {
      jasmine.clock().tick(0);
      shaka.polyfill.Promise.flush();
    }

    if (opt_onTick)
      opt_onTick(time);
    jasmine.clock().tick(1000);
    shaka.polyfill.Promise.flush();
  }
};


/**
 * Capture a Promise's status and attach it to the Promise.
 * @param {!Promise} promise
 */
shaka.test.Util.capturePromiseStatus = function(promise) {
  promise.status = 'pending';
  promise.then(function() {
    promise.status = 'resolved';
  }, function() {
    promise.status = 'rejected';
  });
};


/**
 * Returns a Promise which is resolved after the given delay.
 *
 * @param {number} seconds The delay in seconds.
 * @param {function(function(), number)=} opt_setTimeout
 * @return {!Promise}
 */
shaka.test.Util.delay = function(seconds, opt_setTimeout) {
  return new Promise(function(resolve, reject) {
    var timeout = opt_setTimeout || setTimeout;
    timeout(function() {
      resolve();
      // Play nicely with shaka.polyfill.Promise by flushing automatically.
      if (window.Promise == shaka.polyfill.Promise) {
        shaka.polyfill.Promise.flush();
      }
    }, seconds * 1000.0);
  });
};


/**
 * @param {*} actual
 * @param {!Object} expected
 */
shaka.test.Util.expectToEqualError = function(actual, expected) {
  // NOTE: Safari will add extra properties to any thrown object, so we
  // wrap expectedError in jasmine.objectContaining to ignore them.
  // NOTE: We now add extra properties ourselves for the sake of formatting.
  // These, we delete from 'expected'.
  delete expected['stack'];
  delete expected['message'];
  expect(actual).toEqual(jasmine.objectContaining(expected));
};


/**
  * Registers a custom matcher for Element objects, called 'toEqualElement'.
  * @private
  */
shaka.test.Util.registerElementMatcher_ = function() {
  jasmine.addMatchers({
    toEqualElement: function(util, customEqualityTesters) {
      return {
        compare: shaka.test.Util.expectToEqualElementCompare_
      };
    }
  });
};


/**
 * @param {*} actual
 * @param {!Node} expected
 * @return {!Object} result
 * @private
 */
shaka.test.Util.expectToEqualElementCompare_ = function(actual, expected) {
  var diff = shaka.test.Util.expectToEqualElementRecursive_(actual, expected);
  var result = {};
  result.pass = diff == null;
  if (result.pass) {
    result.message = 'Expected ' + actual.innerHTML + ' not to match ';
    result.message += expected.innerHTML + '.';
  } else {
    result.message = 'Expected ' + actual.innerHTML + ' to match ';
    result.message += expected.innerHTML + '. ' + diff;
  }
  return result;
};


/**
 * @param {*} actual
 * @param {!Node} expected
 * @return {?string} failureReason
 * @private
 */
shaka.test.Util.expectToEqualElementRecursive_ = function(actual, expected) {
  var prospectiveDiff = 'The difference was in ' +
      (actual.outerHTML || actual.textContent) + ' vs ' +
      (expected.outerHTML || expected.textContent) + ': ';

  var actualIsElement = actual.nodeType == Node.ELEMENT_NODE;
  var expectedIsElement = expected.nodeType == Node.ELEMENT_NODE;
  if (actualIsElement != expectedIsElement)
    return prospectiveDiff + 'One is element, one isn\'t.';

  if (!actualIsElement) {
    // Compare them as nodes.
    if (actual.textContent != expected.textContent)
      return prospectiveDiff + 'Nodes are different.';
  } else {
    // Compare them as elements.
    if (actual.tagName != expected.tagName)
      return prospectiveDiff + 'Different tagName.';

    if (actual.attributes.length != expected.attributes.length)
      return prospectiveDiff + 'Different attribute list length.';
    for (var i = 0; i < actual.attributes.length; i++) {
      var aAttrib = actual.attributes[i].nodeName;
      var aAttribVal = actual.getAttribute(aAttrib);
      var eAttrib = expected.attributes[i].nodeName;
      var eAttribVal = expected.getAttribute(eAttrib);
      if (aAttrib != eAttrib || aAttribVal != eAttribVal) {
        var diffNote =
            aAttrib + '=' + aAttribVal + ' vs ' + eAttrib + '=' + eAttribVal;
        return prospectiveDiff + 'Attribute #' + i +
            ' was different (' + diffNote + ').';
      }
    }

    if (actual.childNodes.length != expected.childNodes.length)
      return prospectiveDiff + 'Different child node list length.';
    for (var i = 0; i < actual.childNodes.length; i++) {
      var aNode = actual.childNodes[i];
      var eNode = expected.childNodes[i];
      var diff = shaka.test.Util.expectToEqualElementRecursive_(aNode, eNode);
      if (diff)
        return diff;
    }
  }

  return null;
};


/**
 * Custom comparer for segment references.
 * @param {*} first
 * @param {*} second
 * @return {boolean|undefined}
 */
shaka.test.Util.compareReferences = function(first, second) {
  var isSegment = first instanceof shaka.media.SegmentReference &&
      second instanceof shaka.media.SegmentReference;
  var isInit = first instanceof shaka.media.InitSegmentReference &&
      second instanceof shaka.media.InitSegmentReference;
  if (isSegment || isInit) {
    var a = first.getUris();
    var b = second.getUris();
    if (typeof a !== 'object' || typeof b !== 'object' ||
        typeof a.length != 'number' || typeof b.length !== 'number') {
      return false;
    }
    if (a.length != b.length ||
        !a.every(function(x, i) { return x == b[i]; })) {
      return false;
    }
  }
  if (isSegment) {
    return first.position == second.position &&
        first.startTime == second.startTime &&
        first.endTime == second.endTime &&
        first.startByte == second.startByte &&
        first.endByte == second.endByte;
  }
  if (isInit) {
    return first.startByte == second.startByte &&
        first.endByte == second.endByte;
  }
};


/**
 * Fetches the resource at the given URI.
 *
 * @param {string} uri
 * @return {!Promise.<!ArrayBuffer>}
 */
shaka.test.Util.fetch = function(uri) {
  return new Promise(function(resolve, reject) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', uri, true /* asynchronous */);
    xhr.responseType = 'arraybuffer';

    xhr.onload = function(event) {
      if (xhr.status >= 200 &&
          xhr.status <= 299 &&
          !!xhr.response) {
        resolve(/** @type {!ArrayBuffer} */(xhr.response));
      } else {
        reject(xhr.status);
      }
    };

    xhr.onerror = function(event) {
      reject('shaka.test.Util.fetch failed: ' + uri);
    };

    xhr.send(null /* body */);
  });
};


/**
 * Accepts a mock object (i.e. a simple JavaScript object composed of jasmine
 * spies) and makes it strict.  This means that every spy in the given object
 * will be made to throw an exception by default.
 * @param {!Object} obj
 */
shaka.test.Util.makeMockObjectStrict = function(obj) {
  for (var name in obj)
    obj[name].and.throwError(new Error(name));
};


beforeEach(function() {
  jasmine.addCustomEqualityTester(shaka.test.Util.compareReferences);
  shaka.test.Util.registerElementMatcher_();
});
