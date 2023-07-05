const { Buffer } = require("node:buffer");
// const { createHash } = require("node:crypto");
const { hashBuffer } = require('@parcel/hash');
const { performance } = require("node:perf_hooks");
const db = require("lmdb");
const { LMDBCache } = require("@parcel/cache");

console.log(`${performance.now()}: worker init`);

const CACHE_IMPL = "parcel";

const BLOB_SIZE = 10000;

let cache;
if (CACHE_IMPL === 'parcel') {
//
} else {
    cache = db.open("./cache", {
        compression: true,
        encoding: "binary",
        name: "parcel-cache",
    });
}

async function run(workerApi, { cacheRef }) {
    if (CACHE_IMPL === 'parcel') {
        cache = workerApi.getSharedReference(cacheRef);
    }
    // Generate a "large" blob
    const data = [];
    for (let i = 0; i < BLOB_SIZE; i++) {
        data.push(Math.floor(Math.random() * 255));
    }
    const blob = Buffer.from(data);
    const key = hashBuffer(blob);
    // console.log(`${performance.now()}: Setting data with key ${key}`);
    if (CACHE_IMPL === "parcel") {
        await cache.setBlob(key, blob);
    } else {
        await cache.put(key, blob);
    }
    // console.log(`${performance.now()}: Committed data with key ${key}`);
    return { hash: key };
}

module.exports = { run };
