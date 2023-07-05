
const { Buffer } = require("node:buffer");
const { hashBuffer } = require("@parcel/hash");
const { performance } = require("node:perf_hooks");

console.log(`${performance.now()}: worker init`);

// register with serializer
require('@parcel/cache');

const BLOB_SIZE = 10000;

async function run(workerApi, { cacheRef }) {
  const cache = workerApi.getSharedReference(cacheRef);
  // Generate a "large" blob
  const data = [];
  for (let i = 0; i < 10000; i++) {
    data.push(Math.floor(Math.random() * 255));
  }
  const blob = Buffer.from(data);
  const hash = hashBuffer(blob);
  console.log(`${performance.now()}: Setting data with key ${hash}`);
  await cache.setBlob(hash, blob);
  console.log(`${performance.now()}: Committed data with key ${hash}`);
  return { hash };
}

module.exports = { run };