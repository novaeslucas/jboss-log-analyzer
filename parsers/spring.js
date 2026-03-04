// ======================================
// Spring Boot / Tomcat — Log Parser
// ======================================
// Suporta dois formatos no mesmo arquivo:
//
//   1. Tomcat/Catalina:
//      DD-Mon-YYYY HH:mm:ss.SSS LEVEL [thread] source.method message
//      Ex: 27-Feb-2026 13:16:56.964 INFO [main] org.apache.catalina.startup.VersionLoggerListener.log Server version...
//
//   2. Spring Boot (Logback):
//      YYYY-MM-DDThh:mm:ss.SSS±TZ  LEVEL PID --- [thread] source    : message
//      Ex: 2026-02-27T13:17:16.243-03:00  INFO 1 --- [main] t.diarias.api.util.ServletInitializer : Starting...

import { cleanAnsi } from '../utils.js';

// Tomcat/Catalina format
const TOMCAT_REGEX = /^(\d{2}-\w{3}-\d{4} \d{2}:\d{2}:\d{2}\.\d{3})\s+(INFO|WARN|SEVERE|ERROR|DEBUG|TRACE|CONFIG|FINE)\s+\[([^\]]+)\]\s+(\S+)\s+(.+)$/;

// Spring Boot (Logback/Log4j2) format
const SPRING_REGEX = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2})\s+(INFO|WARN|ERROR|DEBUG|TRACE)\s+\d+\s+---\s+\[([^\]]+)\]\s+(\S+)\s+:\s+(.*)$/;

export function parseSpringLog(rawText) {
  const lines = rawText.split(/\r?\n/);
  const entries = [];
  let currentEntry = null;

  lines.forEach((rawLine, index) => {
    const line = cleanAnsi(rawLine);
    if (!line) return;

    // Try Spring Boot (Logback) format first
    let match = line.match(SPRING_REGEX);
    if (match) {
      if (currentEntry) entries.push(currentEntry);
      currentEntry = {
        lineNumber: index + 1,
        timestamp: extractTimeFromIso(match[1]),
        level:     normalizeLevel(match[2]),
        thread:    match[3].trim(),
        source:    match[4].trim(),
        message:   match[5],
        raw:       line
      };
      return;
    }

    // Try Tomcat/Catalina format
    match = line.match(TOMCAT_REGEX);
    if (match) {
      if (currentEntry) entries.push(currentEntry);
      currentEntry = {
        lineNumber: index + 1,
        timestamp: extractTimeFromTomcat(match[1]),
        level:     normalizeLevel(match[2]),
        thread:    match[3].trim(),
        source:    match[4].trim(),
        message:   match[5],
        raw:       line
      };
      return;
    }

    // Continuation line (stack trace, multiline message, Spring Boot banner)
    if (currentEntry) {
      currentEntry.message += '\n' + line;
    } else {
      entries.push({
        lineNumber: index + 1,
        timestamp:  '',
        level:      'OTHER',
        source:     '',
        thread:     '',
        message:    line,
        raw:        line
      });
    }
  });

  if (currentEntry) entries.push(currentEntry);
  return entries;
}

// YYYY-MM-DDThh:mm:ss.SSS±TZ  →  HH:mm:ss,SSS
function extractTimeFromIso(timestamp) {
  const m = timestamp.match(/T(\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
  return m ? `${m[1]}:${m[2]}:${m[3]},${m[4]}` : timestamp;
}

// DD-Mon-YYYY HH:mm:ss.SSS  →  HH:mm:ss,SSS
function extractTimeFromTomcat(timestamp) {
  const m = timestamp.match(/(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/);
  return m ? `${m[1]}:${m[2]}:${m[3]},${m[4]}` : timestamp;
}

function normalizeLevel(level) {
  switch (level) {
    case 'WARN':                    return 'WARN';
    case 'ERROR':
    case 'SEVERE':
    case 'FATAL':                   return 'ERROR';
    case 'DEBUG':
    case 'TRACE':
    case 'CONFIG':
    case 'FINE':                    return 'OTHER';
    default:                        return level;
  }
}
