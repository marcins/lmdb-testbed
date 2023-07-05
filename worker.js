const { Buffer } = require("node:buffer");
const { hashBuffer } = require("@parcel/hash");
const { performance } = require("node:perf_hooks");

// register with serializer
require("@parcel/cache");

const BLOB_SIZE = 10000;

async function create(workerApi, { cacheRef }) {
    const cache = workerApi.getSharedReference(cacheRef);
    // Generate a "large" blob
    const data = [];
    for (let i = 0; i < BLOB_SIZE; i++) {
        data.push(Math.floor(Math.random() * 255));
    }
    const blob = Buffer.from(data);
    const key = hashBuffer(blob);
    await cache.setBlob(key, blob);
    await new Promise(resolve => setTimeout(resolve, 0));
    return { key };
}

async function read(workerApi, { key, cacheRef }) {
    const cache = workerApi.getSharedReference(cacheRef);
    try {
        const blob = await cache.getBlob(key);
        return blob && blob.length === BLOB_SIZE;
    } catch (e) {
        return false;
    }
} 

module.exports = { create, read };
