const db = require("lmdb");
const WorkerFarm = require("@parcel/workers").default;
const assert = require("node:assert");
const path = require("node:path");
const logger = require("@parcel/logger").default;
const { prettyDiagnostic, PromiseQueue } = require("@parcel/utils");
const { rimraf } = require("rimraf");

let retries = 0;
let successes = 0;

const MAX_TIME = 1000;
const CONCURRENCY = 200;
const BATCH_SIZE = 20000;
const WORKERS = 4;

async function validate({ handle, cache, cacheRef }) {
    const { hash } = await handle();
    console.log(`${performance.now()}: Getting data with key ${hash}`);
    let buffer;
    let retried = false;
    // await new Promise(resolve => setTimeout(resolve, 0));
    buffer = cache.get(hash);
    if (buffer == null) {
        try {
            await new Promise((resolve, reject) => {
                // setTimeout(() => {
                    console.log(
                        `${performance.now()}: Retrying data with key ${hash}`
                    );
                    buffer = cache.get(hash);
                    if (buffer == null) {
                        reject(
                            new Error(`Still failed to get ${hash} after retry`)
                        );
                        return;
                    }
                        retries += 1;
                        retried = true;
                        resolve();
            });
        } catch (e) {
            console.log(e.message);
        }
    }
    assert(buffer.length === 10000);
    successes += 1;
    // if (retried) {
    //     throw new Error(`Worked only after a retry ${hash}`);
    // }
    return true;
}

async function main() {
    await rimraf("./cache");
    const cache = db.open("./cache", {
        compression: true,
        encoding: "binary",
        name: "parcel-cache",
    });
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

    const handle = await farm.createHandle("run", false);

    // Produce requests in batches until we crash.. :P
    while (true) {
        const queue = new PromiseQueue({
            maxConcurrent: CONCURRENCY,
        });

        for (let i = 0; i < BATCH_SIZE; i++) {
            queue.add(() => validate({ handle, cache }));
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
