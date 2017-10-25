(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){

},{}],2:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

function EventEmitter() {
  this._events = this._events || {};
  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!isNumber(n) || n < 0 || isNaN(n))
    throw TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.emit = function(type) {
  var er, handler, len, args, i, listeners;

  if (!this._events)
    this._events = {};

  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events.error ||
        (isObject(this._events.error) && !this._events.error.length)) {
      er = arguments[1];
      if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      } else {
        // At least give some kind of context to the user
        var err = new Error('Uncaught, unspecified "error" event. (' + er + ')');
        err.context = er;
        throw err;
      }
    }
  }

  handler = this._events[type];

  if (isUndefined(handler))
    return false;

  if (isFunction(handler)) {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        args = Array.prototype.slice.call(arguments, 1);
        handler.apply(this, args);
    }
  } else if (isObject(handler)) {
    args = Array.prototype.slice.call(arguments, 1);
    listeners = handler.slice();
    len = listeners.length;
    for (i = 0; i < len; i++)
      listeners[i].apply(this, args);
  }

  return true;
};

EventEmitter.prototype.addListener = function(type, listener) {
  var m;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events)
    this._events = {};

  // To avoid recursion in the case that type === "newListener"! Before
  // adding it to the listeners, first emit "newListener".
  if (this._events.newListener)
    this.emit('newListener', type,
              isFunction(listener.listener) ?
              listener.listener : listener);

  if (!this._events[type])
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  else if (isObject(this._events[type]))
    // If we've already got an array, just append.
    this._events[type].push(listener);
  else
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];

  // Check for listener leak
  if (isObject(this._events[type]) && !this._events[type].warned) {
    if (!isUndefined(this._maxListeners)) {
      m = this._maxListeners;
    } else {
      m = EventEmitter.defaultMaxListeners;
    }

    if (m && m > 0 && this._events[type].length > m) {
      this._events[type].warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
      if (typeof console.trace === 'function') {
        // not supported in IE 10
        console.trace();
      }
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  var fired = false;

  function g() {
    this.removeListener(type, g);

    if (!fired) {
      fired = true;
      listener.apply(this, arguments);
    }
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function(type, listener) {
  var list, position, length, i;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events || !this._events[type])
    return this;

  list = this._events[type];
  length = list.length;
  position = -1;

  if (list === listener ||
      (isFunction(list.listener) && list.listener === listener)) {
    delete this._events[type];
    if (this._events.removeListener)
      this.emit('removeListener', type, listener);

  } else if (isObject(list)) {
    for (i = length; i-- > 0;) {
      if (list[i] === listener ||
          (list[i].listener && list[i].listener === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this._events[type];
    } else {
      list.splice(position, 1);
    }

    if (this._events.removeListener)
      this.emit('removeListener', type, listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  var key, listeners;

  if (!this._events)
    return this;

  // not listening for removeListener, no need to emit
  if (!this._events.removeListener) {
    if (arguments.length === 0)
      this._events = {};
    else if (this._events[type])
      delete this._events[type];
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    for (key in this._events) {
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = {};
    return this;
  }

  listeners = this._events[type];

  if (isFunction(listeners)) {
    this.removeListener(type, listeners);
  } else if (listeners) {
    // LIFO order
    while (listeners.length)
      this.removeListener(type, listeners[listeners.length - 1]);
  }
  delete this._events[type];

  return this;
};

EventEmitter.prototype.listeners = function(type) {
  var ret;
  if (!this._events || !this._events[type])
    ret = [];
  else if (isFunction(this._events[type]))
    ret = [this._events[type]];
  else
    ret = this._events[type].slice();
  return ret;
};

EventEmitter.prototype.listenerCount = function(type) {
  if (this._events) {
    var evlistener = this._events[type];

    if (isFunction(evlistener))
      return 1;
    else if (evlistener)
      return evlistener.length;
  }
  return 0;
};

EventEmitter.listenerCount = function(emitter, type) {
  return emitter.listenerCount(type);
};

function isFunction(arg) {
  return typeof arg === 'function';
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isUndefined(arg) {
  return arg === void 0;
}

},{}],3:[function(require,module,exports){
function Market(user, key) {
  const WebSocketClient = require('websocket').w3cwebsocket;
  const EventEmitter = require('events');

  let eventEmitter = new EventEmitter;
  let lastMessageSequence = undefined;
  let orders = undefined;
  let descriptiveStatistics = undefined;

  eventEmitter.on('marketOrderUpdate', (message) => {
    console.log('marketOrderUpdate', message);
  });

  eventEmitter.on('tradeUpdate', (message) => {
    console.log('tradeUpdate', message);
  });

  function round(value, decimals) {
    return Number(Math.round(value + 'e' + decimals) + 'e-' + decimals);
  }

  function makeDifferenceMessage(oldNewArray) {
    const oldValue = oldNewArray[0];
    const newValue = oldNewArray[1];

    const difference = newValue - oldValue;
    const percentage = round((difference / oldValue) * 1e2, 2);

    let output = (difference > 0) ? 'Up ' : 'Down ';
    output += difference + ' (' + percentage + '%) ';
    output += 'from ' + oldValue + ' to ' + newValue;
    return output;
  }

  eventEmitter.on('midMarketPriceChange', (event) => {
    console.log('midMarketPriceChange', makeDifferenceMessage([event.previousPrice, event.price]));
  });

  eventEmitter.on('spreadChange', (event) => {
    console.log('spreadChange', makeDifferenceMessage([event.previousSpread, event.spread]));
  });

  function openConnection() {
  }

  openConnection();

  const creds = {
    "api_key_id": user,
    "api_key_secret": key,
  };

  function connection() {
    console.log('connecting');
    const ws = new WebSocketClient('wss://ws.luno.com/api/1/stream/XBTZAR');

    ws.onopen = function open() {
      console.log('connected');
      ws.send(JSON.stringify(creds));
    };

    ws.onmessage = (initialMessage) => {
      const message = JSON.parse(initialMessage.data);

      lastMessageSequence = parseInt(message.sequence, 10);
      processAndSaveInitialOrderState(message);

      ws.onmessage = (updateMessage) => {
        if (updateMessage.data.length <= 2) {
          eventEmitter.emit('Empty message');
          return;
        }
        const parsedMessage = JSON.parse(updateMessage.data);
        if (sequenceCheck(parsedMessage.sequence)) {
          processMessage(parsedMessage);
        } else {
          ws.close();
        }
      };
      eventEmitter.emit('marketOrderUpdate', 'Initialized', message.timestamp);
    };

    ws.onclose = () => {
      console.log('disconnected');
      eventEmitter.emit('disconnected');
    };
  }

  connection();

  eventEmitter.on('disconnected', connection);

  function convertStringToCents(stringAmount) {
    return Math.round(1e2 * stringAmount);
  }

  function convertStringToSatoshis(stringAmount) {
    return Math.round(1e8 * stringAmount);
  }

  function convertSpecificIntoGeneralOrder(order, type) {
    return {
      order_id: order.id,
      type,
      price: order.price,
      volume: convertStringToSatoshis(order.volume),
    };
  }

  function convertAskIntoGeneralOrder(ask) {
    return convertSpecificIntoGeneralOrder(ask, 'ASK');
  }

  function convertBidIntoGeneralOrder(bid) {
    return convertSpecificIntoGeneralOrder(bid, 'BID');
  }

  function processAndSaveInitialOrderState(message) {
    const asks = message.asks.map(convertAskIntoGeneralOrder);
    const bids = message.bids.map(convertBidIntoGeneralOrder);
    orders = asks.concat(bids);
  }

  function sequenceCheck(sequence) {
    sequence = parseInt(sequence);
    if ((sequence - lastMessageSequence) === 1) {
      lastMessageSequence = sequence;
      return true;
    } else {
      return false;
    }
  }

  function processMessage(message) {
    let tradeUpdates = message.trade_updates;
    if (tradeUpdates !== null) {
      tradeUpdates.timestamp = message.timestamp;
      processTradeUpdates(tradeUpdates);
    }

    let createUpdate = message.create_update;
    if (createUpdate !== null) {
      createUpdate.timestamp = message.timestamp;
      processCreateUpdate(createUpdate);
    }

    let deleteUpdate = message.delete_update;
    if (deleteUpdate !== null) {
      deleteUpdate.timestamp = message.timestamp;
      processDeleteUpdate(deleteUpdate);
    }
  }

  function deleteOrderByIndex(index) {
    return orders.splice(index, 1);
  }

  eventEmitter.on('tradeExecuted', (tradeUpdate) => {
    let message = 'Traded: ';
    if (tradeUpdate.isFilled === true) {
      message = 'Filled: ';
    }
    eventEmitter.emit('marketOrderUpdate', message + tradeUpdate.base, tradeUpdate.timestamp);
  });

  function processTradeUpdates(tradeUpdates) {
    if (tradeUpdates !== null) {
      tradeUpdates.forEach((tradeUpdate) => {
        tradeUpdate.timestamp = tradeUpdates.timestamp;
        const orderIndex = getOrderIndexById(tradeUpdate.order_id);
        orders[orderIndex].volume -= convertStringToSatoshis(tradeUpdate.base);
        if (orders[orderIndex].volume == 0) {
          deleteOrderByIndex(orderIndex);
          tradeUpdate.isFilled = true;
        }
        eventEmitter.emit('tradeExecuted', tradeUpdate);
      });
    }
  }

  function processCreateUpdate(createUpdate) {
    if (createUpdate !== null) {
      createUpdate.volume = convertStringToSatoshis(createUpdate.volume);
      orders.push(createUpdate);
      eventEmitter.emit('marketOrderCreate', createUpdate);
    }
  }

  eventEmitter.on('marketOrderCreate', (createUpdate) => {
    eventEmitter.emit('marketOrderUpdate', 'Created order: ' + createUpdate.order_id, createUpdate.timestamp);
  });

  function getOrderIndexById(id) {
    return orders.findIndex(order => (order.order_id === id));
  }

  function deleteOrderById(id) {
    const orderIndex = getOrderIndexById(id);
    if (orderIndex > -1) {
      return deleteOrderByIndex(orderIndex);
    }
    return false;
  }

  function processDeleteUpdate(deleteUpdate) {
    if (deleteUpdate !== null) {
      deleteOrderById(deleteUpdate.order_id);
      eventEmitter.emit('marketOrderDeleted', deleteUpdate);
    }
  }

  eventEmitter.on('marketOrderDeleted', (deleteUpdate) => {
    eventEmitter.emit('marketOrderUpdate', 'Deleted order: ' + deleteUpdate.order_id, deleteUpdate.timestamp);
  });

  function aggregateOrders(accumulator, order, orderIndex) {
    const orderPrice = convertStringToCents(order.price);
    if (order.type === 'ASK') {
      accumulator.askCount++;
      accumulator.askVolume += order.volume;
      if (accumulator.minAsk > orderPrice || typeof accumulator.minAsk === 'undefined') {
        accumulator.minAsk = orderPrice;
      }
    } else if (order.type === 'BID') {
      accumulator.bidCount++;
      accumulator.bidVolume += order.volume;
      if (accumulator.maxBid < orderPrice || typeof accumulator.maxBid === 'undefined') {
        accumulator.maxBid = orderPrice;
      }
    }
    return accumulator;
  }

  function calculateDescriptiveStatistics(message, timestamp) {
    const updatedDescriptiveStatistics = orders.reduce(aggregateOrders, { askCount: 0, askVolume: 0, bidCount: 0, bidVolume: 0 });
    updatedDescriptiveStatistics.midMarketPrice = (updatedDescriptiveStatistics.minAsk + updatedDescriptiveStatistics.maxBid) / 2;
    updatedDescriptiveStatistics.spread = updatedDescriptiveStatistics.minAsk - updatedDescriptiveStatistics.maxBid;
    if (typeof descriptiveStatistics !== 'undefined') {
      if (updatedDescriptiveStatistics.midMarketPrice !== descriptiveStatistics.midMarketPrice) {
        eventEmitter.emit('midMarketPriceChange', { previousPrice: descriptiveStatistics.midMarketPrice, price: updatedDescriptiveStatistics.midMarketPrice, timestamp});
      }
      if (updatedDescriptiveStatistics.spread !== descriptiveStatistics.spread) {
        eventEmitter.emit('spreadChange', { previousSpread: descriptiveStatistics.spread, spread: updatedDescriptiveStatistics.spread, timestamp});
      }
    }
    descriptiveStatistics = updatedDescriptiveStatistics;
  }

  eventEmitter.on('marketOrderUpdate', calculateDescriptiveStatistics);

  eventEmitter.on('midMarketPriceChange', (event) => {
    let fs = require('fs');
    fs.appendFile('price.txt', event.timestamp + ', ' + (event.price / 1e2).toFixed(2) + '\n', (err) => {
      if (err) throw err;
    });
  });

  eventEmitter.on('tradeExecuted', (event) => {
    let fs = require('fs');
    fs.appendFile('trades.txt', event.timestamp + ', ' + event.base + ', ' + event.counter + '\n', (err) => {
      if (err) throw err;
    });
  });

  this.getTicker = (callback) => {
    return null;
  }

  this.getFee = (callback) => {
    return null;
  }

  this.getPortfolio = (callback) => {
    return null;
  }

  this.buy = (amount, price, callback) => {
    return null;
  }

  this.sell = (amount, price, callback) => {
    return null;
  }

  this.checkOrder = (order, callback) => {
    return null;
  }

  this.cancelOrder = (order) => {
    return null;
  }

  this.getTrades = (since, callback, descending) => {
    return null;
  }
}

module.exports = {
  Market,
};

},{"events":2,"fs":1,"websocket":6}],4:[function(require,module,exports){
module.exports={
  "username": "nhrbxt3vt43t3",
  "password": "nF137foc5MDQpe8AAc_KzcBLORNPsZNC9N8eZ8Ncxvk"
}
},{}],5:[function(require,module,exports){
const Market = require('./Market').Market;

var credentials = require("./credentials.json");

let market = new Market(credentials.username, credentials.password);
},{"./Market":3,"./credentials.json":4}],6:[function(require,module,exports){
var _global = (function() { return this; })();
var NativeWebSocket = _global.WebSocket || _global.MozWebSocket;
var websocket_version = require('./version');


/**
 * Expose a W3C WebSocket class with just one or two arguments.
 */
function W3CWebSocket(uri, protocols) {
	var native_instance;

	if (protocols) {
		native_instance = new NativeWebSocket(uri, protocols);
	}
	else {
		native_instance = new NativeWebSocket(uri);
	}

	/**
	 * 'native_instance' is an instance of nativeWebSocket (the browser's WebSocket
	 * class). Since it is an Object it will be returned as it is when creating an
	 * instance of W3CWebSocket via 'new W3CWebSocket()'.
	 *
	 * ECMAScript 5: http://bclary.com/2004/11/07/#a-13.2.2
	 */
	return native_instance;
}
if (NativeWebSocket) {
	['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(function(prop) {
		Object.defineProperty(W3CWebSocket, prop, {
			get: function() { return NativeWebSocket[prop]; }
		});
	});
}

/**
 * Module exports.
 */
module.exports = {
    'w3cwebsocket' : NativeWebSocket ? W3CWebSocket : null,
    'version'      : websocket_version
};

},{"./version":7}],7:[function(require,module,exports){
module.exports = require('../package.json').version;

},{"../package.json":8}],8:[function(require,module,exports){
module.exports={
  "_args": [
    [
      {
        "raw": "websocket",
        "scope": null,
        "escapedName": "websocket",
        "name": "websocket",
        "rawSpec": "",
        "spec": "latest",
        "type": "tag"
      },
      "C:\\Users\\Vaughan Muller\\Documents\\Code\\npm\\luno-ws"
    ]
  ],
  "_from": "websocket@latest",
  "_id": "websocket@1.0.25",
  "_inCache": true,
  "_location": "/websocket",
  "_nodeVersion": "8.7.0",
  "_npmOperationalInternal": {
    "host": "s3://npm-registry-packages",
    "tmp": "tmp/websocket-1.0.25.tgz_1508372613263_0.2284609314519912"
  },
  "_npmUser": {
    "name": "theturtle32",
    "email": "theturtle32@gmail.com"
  },
  "_npmVersion": "5.4.2",
  "_phantomChildren": {},
  "_requested": {
    "raw": "websocket",
    "scope": null,
    "escapedName": "websocket",
    "name": "websocket",
    "rawSpec": "",
    "spec": "latest",
    "type": "tag"
  },
  "_requiredBy": [
    "#USER"
  ],
  "_resolved": "https://registry.npmjs.org/websocket/-/websocket-1.0.25.tgz",
  "_shasum": "998ec790f0a3eacb8b08b50a4350026692a11958",
  "_shrinkwrap": null,
  "_spec": "websocket",
  "_where": "C:\\Users\\Vaughan Muller\\Documents\\Code\\npm\\luno-ws",
  "author": {
    "name": "Brian McKelvey",
    "email": "brian@worlize.com",
    "url": "https://www.worlize.com/"
  },
  "browser": "lib/browser.js",
  "bugs": {
    "url": "https://github.com/theturtle32/WebSocket-Node/issues"
  },
  "config": {
    "verbose": false
  },
  "contributors": [
    {
      "name": "Iñaki Baz Castillo",
      "email": "ibc@aliax.net",
      "url": "http://dev.sipdoc.net"
    }
  ],
  "dependencies": {
    "debug": "^2.2.0",
    "nan": "^2.3.3",
    "typedarray-to-buffer": "^3.1.2",
    "yaeti": "^0.0.6"
  },
  "description": "Websocket Client & Server Library implementing the WebSocket protocol as specified in RFC 6455.",
  "devDependencies": {
    "buffer-equal": "^1.0.0",
    "faucet": "^0.0.1",
    "gulp": "git+https://github.com/gulpjs/gulp.git#4.0",
    "gulp-jshint": "^2.0.4",
    "jshint": "^2.0.0",
    "jshint-stylish": "^2.2.1",
    "tape": "^4.0.1"
  },
  "directories": {
    "lib": "./lib"
  },
  "dist": {
    "integrity": "sha512-M58njvi6ZxVb5k7kpnHh2BvNKuBWiwIYvsToErBzWhvBZYwlEiLcyLrG41T1jRcrY9ettqPYEqduLI7ul54CVQ==",
    "shasum": "998ec790f0a3eacb8b08b50a4350026692a11958",
    "tarball": "https://registry.npmjs.org/websocket/-/websocket-1.0.25.tgz"
  },
  "engines": {
    "node": ">=0.10.0"
  },
  "gitHead": "d941f975e8ef6b55eafc0ef45996f4198013832c",
  "homepage": "https://github.com/theturtle32/WebSocket-Node",
  "keywords": [
    "websocket",
    "websockets",
    "socket",
    "networking",
    "comet",
    "push",
    "RFC-6455",
    "realtime",
    "server",
    "client"
  ],
  "license": "Apache-2.0",
  "main": "index",
  "maintainers": [
    {
      "name": "theturtle32",
      "email": "brian@worlize.com"
    }
  ],
  "name": "websocket",
  "optionalDependencies": {},
  "readme": "ERROR: No README data found!",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/theturtle32/WebSocket-Node.git"
  },
  "scripts": {
    "gulp": "gulp",
    "install": "(node-gyp rebuild 2> builderror.log) || (exit 0)",
    "test": "faucet test/unit"
  },
  "version": "1.0.25"
}

},{}]},{},[5]);
