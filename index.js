const LunoStream = require('./LunoStream').LunoStream;

var credentials = require("./credentials.json");

let lunoStream = new LunoStream(credentials.username, credentials.password, "XBTZAR");

lunoStream.on('connecting', () => console.log('Connecting'));
lunoStream.on('connected', () => console.log('Connected'));
lunoStream.on('keep-alive', () => console.log('Empty message'));
lunoStream.on('market-order-update', (message) => console.log('Market order updated', message));
lunoStream.on('market-order-create', () => console.log('Market order created'));
lunoStream.on('market-order-delete', () => console.log('Market order deleted'));
lunoStream.on('trade-executed', (message) => console.log('Trade executed', message));
lunoStream.on('price-change', (event) => console.log('Price change', makeDifferenceMessage([event.previousPrice, event.price])));
lunoStream.on('spread-change', (event) => console.log('Spread change', makeDifferenceMessage([event.previousSpread, event.spread])));
lunoStream.on('disconnected', () => console.log('Disconnected'));

lunoStream.on('price-change', (event) => {
  let fs = require('fs');
  if (isFunction(fs.appendFile)) {
    fs.appendFile('price.txt', event.timestamp + ', ' + (event.price / 1e2).toFixed(2) + '\n', (err) => {
      if (err) throw err;
    });
  }
});

lunoStream.on('trade-executed', (event) => {
  let fs = require('fs');
  if (isFunction(fs.appendFile)) {
    fs.appendFile('trades.txt', event.timestamp + ', ' + event.base + ', ' + event.counter + '\n', (err) => {
      if (err) throw err;
    });
  }
});

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

function round(value, decimals) {
  return Number(Math.round(value + 'e' + decimals) + 'e-' + decimals);
}

function isFunction(functionToCheck) {
  var getType = {};
  return functionToCheck && getType.toString.call(functionToCheck) === '[object Function]';
 }