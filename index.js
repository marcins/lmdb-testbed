const { LMDBCache } = require("@parcel/cache");
const WorkerFarm = require("@parcel/workers").default;
const assert = require("node:assert");
const logger = require("@parcel/logger").default;
const { prettyDiagnostic, PromiseQueue } = require("@parcel/utils");
const { rimraf } = require("rimraf");

let retries = 0;
let successes = 0;

const MAX_TIME = 10000;
const CONCURRENCY = 500;
const BATCH_SIZE = 20000;
const WORKERS = 8;

async function validate({ handle, cache, cacheRef }) {
    const { hash } = await handle({ cacheRef });
    console.log(`${performance.now()}: Getting data with key ${hash}`);
    let buffer;
    let retried = false;
    try {
        buffer = await cache.getBlob(hash);
    } catch (e) {
        await new Promise(resolve => {
            setTimeout(() => {
                console.log(`${performance.now()}: Retrying data with key ${hash}`);
                cache.getBlob(hash).then(v => {
                    buffer = v;
                    retried = true;
                    retries++;
                    resolve();
                });
            }, 0);
        });
        
    }
    assert(buffer.length === 10000);
    successes++;
    // if (retried) {
    //     throw new Error(`Worked only after a retry ${hash}`);
    // }
    return true;
}

async function main() {
    await rimraf("./cache");
    const cache = new LMDBCache("./cache");
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

    const { ref: cacheRef } = await farm.createSharedReference(cache);
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
    assert.equal(retries, 0, 'Expected to complete without needing retries');
}

main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});
