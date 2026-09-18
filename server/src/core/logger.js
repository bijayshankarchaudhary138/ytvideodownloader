/** Tiny structured logger — no dependencies, no noise in tests. */
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

let currentLevel = LEVELS[process.env.LOG_LEVEL || 'info'] ?? LEVELS.info;

export function setLogLevel(level) {
  currentLevel = LEVELS[level] ?? currentLevel;
}

const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

function write(level, scope, args) {
  if (LEVELS[level] > currentLevel) return;
  const line = `[${ts()}] ${level.toUpperCase().padEnd(5)} ${scope ? `(${scope}) ` : ''}`;
  const out = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  out(line, ...args);
}

export function createLogger(scope = '') {
  return {
    error: (...a) => write('error', scope, a),
    warn: (...a) => write('warn', scope, a),
    info: (...a) => write('info', scope, a),
    debug: (...a) => write('debug', scope, a),
    child: (sub) => createLogger(scope ? `${scope}:${sub}` : sub),
  };
}

export const logger = createLogger();
