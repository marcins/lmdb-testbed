const { Buffer } = require("node:buffer");
const { createHash } = require("node:crypto");
const { performance } = require("node:perf_hooks");
const db = require("lmdb");

console.log(`${performance.now()}: worker init`);

const BLOB_SIZE = 10000;

async function run() {
    const cache = db.open("./cache", {
        compression: true,
        encoding: "binary",
        name: "parcel-cache",
    });
    // Generate a "large" blob
    const data = [];
    for (let i = 0; i < 10000; i++) {
        data.push(Math.floor(Math.random() * 255));
    }
    const blob = Buffer.from(data);
    const hash = createHash("md5");
    hash.update(blob);
    const key = hash.digest("hex");
    console.log(`${performance.now()}: Setting data with key ${key}`);
    let result = await cache.put(key, blob);
    if (!result) {
      throw new Error(`Write to cache failed for ${key}`);
    }
    console.log(`${performance.now()}: Committed data with key ${key}`);
    return { hash: key };
}

module.exports = { run };
