# Contour hosted App smoke test

This isolated example provides a small source diff for verifying the hosted
Contour GitHub App. It is not connected to the application's runtime.

The demo publishes two order events to an in-memory queue, then a worker drains
the queue and invokes an asynchronous handler. Assertions verify event order,
the processed count, and the empty queue behavior.

Run from the repository root:

```sh
node examples/contour-smoke-test/demo.mjs
```

The draft PR containing this example should receive an automatic Contour
diagram comment. It is a deployment verification PR and does not need merging.
