const Market = require('./Market').Market;

var credentials = require("./credentials.json");

let market = new Market(credentials.username, credentials.password);