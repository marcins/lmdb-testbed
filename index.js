const { LMDBCache } = require("@parcel/cache");
const WorkerFarm = require("@parcel/workers").default;
const assert = require("node:assert");
const path = require("node:path");
const logger = require("@parcel/logger").default;
const { prettyDiagnostic, PromiseQueue } = require("@parcel/utils");
const { rimraf } = require("rimraf");

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
                    resolve();
                });
            }, 1000);
        });
        
    }
    assert(buffer.length === 10000);
    if (retried) {
        throw new Error(`Worked only after a retry ${hash}`);
    }
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
        maxConcurrentWorkers: 4,
        maxConcurrentCallsPerWorker: 200,
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
            maxConcurrent: 200,
        });

        for (let i = 0; i < 20000; i++) {
            queue.add(() => validate({ handle, cache, cacheRef }));
        }

        await queue.run();
        console.log("Batch done...");
        if (performance.now() > 10000) {
            break;
        }
    }
    console.log("Shutting down farm...");
    await farm.end();
    console.log("Done!");
}

main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});
