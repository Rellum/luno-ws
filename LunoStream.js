var EventEmitter = require('events');
var util = require('util');

function LunoStream(user, key, keypair) {
  EventEmitter.call(this);

  const lunoStream = this;

  const WebSocketClient = require('websocket').w3cwebsocket;

  let lastMessageSequence = undefined;
  let orders = undefined;
  let descriptiveStatistics = undefined;

  const creds = {
    "api_key_id": user,
    "api_key_secret": key,
  };

  function connection() {
    lunoStream.emit('connecting');
    const ws = new WebSocketClient('wss://ws.luno.com/api/1/stream/' + keypair);

    ws.onopen = function open() {
      lunoStream.emit('connected');
      ws.send(JSON.stringify(creds));
    };

    ws.onmessage = (initialMessage) => {
      const message = JSON.parse(initialMessage.data);

      lastMessageSequence = parseInt(message.sequence, 10);
      processAndSaveInitialOrderState(message);

      ws.onmessage = (updateMessage) => {
        if (updateMessage.data.length <= 2) {
          lunoStream.emit('keep-alive');
          return;
        }
        const parsedMessage = JSON.parse(updateMessage.data);
        if (sequenceCheck(parsedMessage.sequence)) {
          processMessage(parsedMessage);
        } else {
          ws.close();
        }
      };
      lunoStream.emit('market-order-update', 'Initialized', message.timestamp);
    };

    ws.onclose = () => {
      lunoStream.emit('disconnected');
    };
  }

  connection();

  lunoStream.on('disconnected', connection);

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

  this.on('trade-executed', (tradeUpdate) => {
    let message = 'Traded: ';
    if (tradeUpdate.isFilled === true) {
      message = 'Filled: ';
    }
    lunoStream.emit('market-order-update', message + tradeUpdate.base, tradeUpdate.timestamp);
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
        lunoStream.emit('trade-executed', tradeUpdate);
      });
    }
  }

  function processCreateUpdate(createUpdate) {
    if (createUpdate !== null) {
      createUpdate.volume = convertStringToSatoshis(createUpdate.volume);
      orders.push(createUpdate);
      lunoStream.emit('market-order-create', createUpdate);
    }
  }

  this.on('market-order-create', (createUpdate) => {
    lunoStream.emit('market-order-update', 'Created order: ' + createUpdate.order_id, createUpdate.timestamp);
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
      lunoStream.emit('market-order-delete', deleteUpdate);
    }
  }

  lunoStream.on('market-order-delete', (deleteUpdate) => {
    lunoStream.emit('market-order-update', 'Deleted order: ' + deleteUpdate.order_id, deleteUpdate.timestamp);
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
        lunoStream.emit('price-change', { previousPrice: descriptiveStatistics.midMarketPrice, price: updatedDescriptiveStatistics.midMarketPrice, timestamp});
      }
      if (updatedDescriptiveStatistics.spread !== descriptiveStatistics.spread) {
        lunoStream.emit('spread-change', { previousSpread: descriptiveStatistics.spread, spread: updatedDescriptiveStatistics.spread, timestamp});
      }
    }
    descriptiveStatistics = updatedDescriptiveStatistics;
  }

  lunoStream.on('market-order-update', calculateDescriptiveStatistics);
}

util.inherits(LunoStream, EventEmitter);

module.exports = {
  LunoStream,
};
