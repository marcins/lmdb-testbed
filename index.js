const db = require("lmdb");
const WorkerFarm = require("@parcel/workers").default;
const assert = require("node:assert");
const path = require("node:path");
const logger = require("@parcel/logger").default;
const { prettyDiagnostic, PromiseQueue } = require("@parcel/utils");
const { rimraf } = require("rimraf");
const { LMDBCache } = require("@parcel/cache");

let retries = 0;
let successes = 0;

const MAX_TIME = 10000;
const CONCURRENCY = 200;
const BATCH_SIZE = 20000;
const WORKERS = 4;

const CACHE_IMPL = "lmdb";

async function validate({ handle, cache, cacheRef }) {
    const { hash } = await handle({ cacheRef });
    // console.log(`${performance.now()}: Getting data with key ${hash}`);
    let buffer;
    let retried = false;
    // await new Promise(resolve => setTimeout(resolve, 0));
    try {
        if (CACHE_IMPL === "parcel") {
            buffer = await cache.getBlob(hash);
        } else {
            buffer = cache.get(hash);
        }    
        if (buffer == null) {
            throw new Error(`Key ${key} not found in cache`);
        }
    } catch (e) {
        await new Promise(resolve => {
            setTimeout(() => {
                console.log(`${performance.now()}: Retrying data with key ${hash}`);
                if (CACHE_IMPL === 'parcel') {
                    cache.getBlob(hash).then(v => {
                        buffer = v;
                        retried = true;
                        retries++;
                        resolve();
                    });
                } else {
                    buffer = cache.get(hash);
                    if (buffer != null) {
                        retried = true;
                        retries++;
                        resolve();
                    } else {
                        reject('Still failed');
                    }
                }
            }, 0);
        });
    }

    assert(buffer.length === 10000);
    successes += 1;
    if (successes % 1000 === 0) {
        console.log(`Successes: ${successes} Retries: ${retries}`);
    }
    // if (retried) {
    //     throw new Error(`Worked only after a retry ${hash}`);
    // }
    return true;
}

async function main() {
    await rimraf("./cache");
    let cache;
    if (CACHE_IMPL === "parcel") {
        cache = new LMDBCache("./cache");
    }  else {
        cache = db.open("./cache", {
            compression: true,
            encoding: "binary",
            name: "parcel-cache",
        });    
    }
    logger.onLog(async (event) => {
        if (event.level === "error") {
            console.log(await prettyDiagnostic(event.diagnostics[0]));
        } else {
            console.log(event.message);
        }
    });
    console.log(`${performance.now()}: workerfarm init`);
    const farm = new WorkerFarm({
        backend: "threads",
        maxConcurrentWorkers: WORKERS,
        maxConcurrentCallsPerWorker: CONCURRENCY,
        workerPath: require.resolve("./worker"),
        forcedKillTime: 500,
        useLocalWorker: false,
        warmWorkers: false,
        shouldPatchConsole: false,
    });

    let cacheRef;
    if (CACHE_IMPL === "parcel") {
        cacheRef = (await farm.createSharedReference(cache)).ref;
    }

    const handle = await farm.createHandle("run", false);

    // Produce requests in batches until we crash.. :P
    while (true) {
        const queue = new PromiseQueue({
            maxConcurrent: CONCURRENCY,
        });

        for (let i = 0; i < BATCH_SIZE; i++) {
            queue.add(() => validate({ handle, cache, cacheRef }));
        }

        await queue.run();
        console.log("Batch done...");
        if (performance.now() > MAX_TIME) {
            break;
        }
    }
    console.log("Shutting down farm...");
    await farm.end();
    console.log(`Done! Total reads: ${successes} Retries? ${retries}`);
}

main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});
