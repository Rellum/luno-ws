function Market(user, key) {
  const WebSocket = require('ws');
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
    const ws = new WebSocket('wss://ws.luno.com/api/1/stream/XBTZAR');

    ws.on('open', function open() {
      console.log('connected');
      ws.send(JSON.stringify(creds));
    });

    ws.once('message', (initialMessage) => {
      const message = JSON.parse(initialMessage);

      lastMessageSequence = parseInt(message.sequence, 10);
      processAndSaveInitialOrderState(message);

      ws.on('message', (updateMessage) => {
        if (updateMessage.length <= 2) {
          eventEmitter.emit('Empty message');
          return;
        }
        const parsedMessage = JSON.parse(updateMessage);
        if (sequenceCheck(parsedMessage.sequence)) {
          processMessage(parsedMessage);
        } else {
          ws.close();
        }
      });
      eventEmitter.emit('marketOrderUpdate', 'Initialized', message.timestamp);
    });

    ws.on('close', () => {
      console.log('disconnected');
      eventEmitter.emit('disconnected');
    });
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
