const { v4: uuidv4 } = require("uuid");

function generateTransactionReference() {
  return `TXN-${uuidv4()}`;
}

module.exports = generateTransactionReference;