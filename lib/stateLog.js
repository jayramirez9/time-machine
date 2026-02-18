/**
 * State Logger
 * Appends JSONL entries to daily log files for replay and diagnostics.
 */

import fs from 'fs';
import path from 'path';

/**
 * Create a state logger
 * @param {string} logDir - directory for log files (default: "logs")
 * @returns {{ append: Function, close: Function, currentPath: Function }}
 */
export function createStateLog(logDir = 'logs') {
  let currentDate = null;
  let fd = null;

  // Ensure log directory exists
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  function dateTag() {
    return new Date().toISOString().slice(0, 10);
  }

  function ensureFile() {
    const today = dateTag();
    if (today !== currentDate) {
      if (fd != null) {
        fs.closeSync(fd);
      }
      currentDate = today;
      const filePath = path.join(logDir, `worldstate-${today}.jsonl`);
      fd = fs.openSync(filePath, 'a');
    }
  }

  /**
   * Append a state entry to the current log file
   * @param {Object} state - published world state
   * @param {Array} [violations] - rate limiter violations (if any)
   */
  function append(state, violations) {
    ensureFile();

    const entry = {
      ts: new Date().toISOString(),
      simTime: state.engine?.simTime,
      states: state.states,
      controls: state.controls
    };

    if (state.routed) {
      entry.routed = state.routed;
    }

    if (violations && violations.length > 0) {
      entry.violations = violations;
    }

    const line = JSON.stringify(entry) + '\n';
    fs.writeSync(fd, line);
  }

  /**
   * Get the current log file path
   */
  function currentPath() {
    ensureFile();
    return path.join(logDir, `worldstate-${currentDate}.jsonl`);
  }

  /**
   * Close the file descriptor
   */
  function close() {
    if (fd != null) {
      fs.closeSync(fd);
      fd = null;
      currentDate = null;
    }
  }

  return { append, close, currentPath };
}
