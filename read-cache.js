const { LMDBCache } = require('@parcel/cache');

const cache = new LMDBCache("./cache");
const key = process.argv[2];
cache.getBlob(key).then(v => {
    console.log(`Got buffer of length ${v.length} from the cache`);
});