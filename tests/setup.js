/**
 * Global test setup.
 * Every test runs in DEMO mode: the sandbox/CI network never reaches YouTube,
 * and we must never depend on the public internet to verify our own pipeline.
 */
process.env.NODE_ENV = 'test';
process.env.DEMO_MODE = 'on';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';
process.env.DEMO_SAMPLE_SECONDS = process.env.DEMO_SAMPLE_SECONDS || '5';
process.env.DEMO_SAMPLE_HEIGHT = process.env.DEMO_SAMPLE_HEIGHT || '720';
process.env.DEMO_SAMPLE_FPS = process.env.DEMO_SAMPLE_FPS || '15';
process.env.FFMPEG_PRESET = 'ultrafast';
process.env.RATE_LIMIT_MAX = process.env.RATE_LIMIT_MAX || '10000';
// The e2e suites create dozens of jobs from a single IP, so the "expensive
// endpoint" bucket is opened wide here; its behaviour is asserted explicitly in
// tests/api/api.test.js and tests/e2e/perf.test.js with dedicated small limits.
process.env.HEAVY_RATE_LIMIT_MAX = process.env.HEAVY_RATE_LIMIT_MAX || '10000';

// Keep test output readable.
const origWarn = console.warn;
console.warn = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('[test-noise]')) return;
  origWarn(...args);
};
