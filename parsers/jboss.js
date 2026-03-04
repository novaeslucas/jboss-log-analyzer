// ======================================
// JBoss EAP 6.4 — Log Parser
// ======================================
// Log line format: HH:mm:ss,SSS LEVEL  [source] (thread) message

import { cleanAnsi } from '../utils.js';

const LOG_LINE_REGEX = /^(\d{2}:\d{2}:\d{2},\d{3})\s+(INFO|WARN|ERROR|DEBUG|TRACE|FATAL)\s+\[([^\]]+)\]\s+\(([^)]+)\)\s+(.+)$/;

export function parseJBossLog(rawText) {
  const lines = rawText.split(/\r?\n/);
  const entries = [];
  let currentEntry = null;

  lines.forEach((rawLine, index) => {
    const line = cleanAnsi(rawLine);
    if (!line) return;

    const match = line.match(LOG_LINE_REGEX);

    if (match) {
      if (currentEntry) entries.push(currentEntry);
      currentEntry = {
        lineNumber: index + 1,
        timestamp: match[1],
        level: normalizeLevel(match[2]),
        source: match[3],
        thread: match[4],
        message: match[5],
        raw: line
      };
    } else {
      if (currentEntry) {
        currentEntry.message += '\n' + line;
      } else {
        entries.push({
          lineNumber: index + 1,
          timestamp: '',
          level: 'OTHER',
          source: '',
          thread: '',
          message: line,
          raw: line
        });
      }
    }
  });

  if (currentEntry) entries.push(currentEntry);
  return entries;
}

function normalizeLevel(level) {
  switch (level) {
    case 'WARN':  return 'WARN';
    case 'ERROR':
    case 'FATAL': return 'ERROR';
    case 'DEBUG':
    case 'TRACE': return 'OTHER';
    default:      return level;
  }
}
