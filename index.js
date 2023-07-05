const { LMDBCache } = require("@parcel/cache");
const WorkerFarm = require("@parcel/workers").default;
const assert = require("node:assert");
const path = require("node:path");
const logger = require("@parcel/logger").default;
const { prettyDiagnostic, PromiseQueue } = require("@parcel/utils");
const { rimraf } = require("rimraf");

let retries = 0;
let successes = 0;

const RUNS = 100;
const MAX_TIME = 1000;
const CONCURRENCY = 1000;
const WORKERS = 20;
const BATCH_SIZE = 5000;

async function validate({ handle, cache, cacheRef }) {
    const { hash } = await handle({ cacheRef });
    console.log(`${performance.now()}: Getting data with key ${hash}`);
    let buffer;
    let retried = false;
    try {
        buffer = await cache.getBlob(hash);
    } catch (e) {
        await new Promise((resolve) => {
            setTimeout(() => {
                console.log(
                    `${performance.now()}: Retrying data with key ${hash}`
                );
                cache.getBlob(hash).then((v) => {
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

async function reproduction() {
    await rimraf("./cache");
    const cache = new LMDBCache("./cache");
    logger.onLog(async (event) => {
        if (event.level === "error") {
            console.log(await prettyDiagnostic(event.diagnostics[0]));
        } else {
            console.log(event.message);
        }
    });
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
    const createHandle = await farm.createHandle("create", false);
    const readHandle = await farm.createHandle("read", false);

    let failures = 0;
    while (true) {
        const queue = new PromiseQueue({
            maxConcurrent: CONCURRENCY,
        });

        for (let i = 0; i < BATCH_SIZE; i++) {
            queue.add(async () => {
                const { key } = await createHandle({ cacheRef });
                const result = await readHandle({ cacheRef, key });
                if (result) {
                    successes++;
                } else {
                    failures++;
                }
            });
        }

        await queue.run();
        if (performance.now() > MAX_TIME || failures > 0) {
            break;
        }
    }
    await farm.end();
    return failures;
}

async function main() {
    let successful = 0;
    let failed = 0;
    for (let i = 0; i < RUNS; i++) {
        console.log(
            `Run ${i + 1} of ${RUNS} (Success: ${successful} Failed: ${failed})`
        );
        const failures = await reproduction();
        if (failures === 0) {
            successful++;
        } else {
            failed++;
        }
    }

    console.log(`Successful: ${successful} Failed: ${failed}`);
}

main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});
