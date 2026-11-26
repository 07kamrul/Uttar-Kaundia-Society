// Loaded by the Angular unit-test builder (angular.json → test.options.runnerConfig).
// Several specs replace 'leaflet' with a stub via vi.mock; without per-file
// isolation that stub leaks into later spec files in the same worker and breaks
// specs that need the real library (e.g. bds-hit-test.spec.ts).
// `forks` also avoids the "Worker exited unexpectedly" crash seen with threads.
export default {
  test: {
    pool: 'forks',
    isolate: true,
  },
};
