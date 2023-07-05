# lmdb-testbed

Reproduction for https://github.com/parcel-bundler/parcel/issues/9121

To run:
> yarn
> yarn test

The expectation is that there will be 0 retries required (where a `db.get` has failed), however if the reproduction has "worked" then you will see there were some retries and the resulting assertion will fail.