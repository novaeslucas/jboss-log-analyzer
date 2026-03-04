// ======================================
// Heatmaps (GitHub-style) + JSON Export
// ======================================

const HEATMAP_CONFIGS = [
  { level: 'ERROR', cssPrefix: 'heat',      color: '#f87171', domKey: 'error' },
  { level: 'INFO',  cssPrefix: 'heat-info',  color: '#38bdf8', domKey: 'info'  },
  { level: 'WARN',  cssPrefix: 'heat-warn',  color: '#fbbf24', domKey: 'warn'  },
];

// domRefs shape: { error: { containerEl, gridEl, tooltipEl }, info: {...}, warn: {...} }
export function renderAllHeatmaps(allEntries, detectedAnomalies, anomalyPulseEnabled, domRefs) {
  const anomalyHoursByLevel = {};
  detectedAnomalies.forEach(a => {
    if (a.hour !== undefined) {
      if (!anomalyHoursByLevel[a.level]) anomalyHoursByLevel[a.level] = new Set();
      anomalyHoursByLevel[a.level].add(a.hour);
    }
  });

  HEATMAP_CONFIGS.forEach(cfg => {
    const pulseHours = anomalyPulseEnabled[cfg.level]
      ? (anomalyHoursByLevel[cfg.level] || new Set())
      : new Set();
    const refs = domRefs[cfg.domKey];
    renderHeatmap(cfg, allEntries, detectedAnomalies, refs.containerEl, refs.gridEl, refs.tooltipEl, pulseHours);
  });
}

function renderHeatmap(cfg, allEntries, detectedAnomalies, containerEl, gridEl, tooltipEl, anomalyHours) {
  if (!gridEl) return;
  gridEl.innerHTML = '';

  const entries = allEntries.filter(e => e.timestamp);
  if (entries.length === 0) { containerEl.classList.add('hidden'); return; }

  const firstHour = parseInt(entries[0].timestamp.substring(0, 2), 10);
  const lastHour  = parseInt(entries[entries.length - 1].timestamp.substring(0, 2), 10);

  const counts = new Map();
  entries.forEach(e => {
    if (e.level === cfg.level) {
      const hour = parseInt(e.timestamp.substring(0, 2), 10);
      counts.set(hour, (counts.get(hour) || 0) + 1);
    }
  });

  const hours = [];
  for (let h = firstHour; h <= lastHour; h++) hours.push(h);
  if (hours.length === 0) { containerEl.classList.add('hidden'); return; }

  const maxCount = Math.max(...hours.map(h => counts.get(h) || 0), 1);

  function heatLevel(count) {
    if (count === 0)                    return 0;
    if (count <= maxCount * 0.25) return 1;
    if (count <= maxCount * 0.50) return 2;
    if (count <= maxCount * 0.75) return 3;
    return 4;
  }

  const fragment = document.createDocumentFragment();

  hours.forEach(hour => {
    const count = counts.get(hour) || 0;
    const label = String(hour).padStart(2, '0') + ':00';

    const cell = document.createElement('div');
    const pulseClass = anomalyHours.has(hour) ? ' anomaly-pulse' : '';
    cell.className = `heatmap-cell ${cfg.cssPrefix}-${heatLevel(count)}${pulseClass}`;
    cell.title = `${label} \u2014 ${count} ${cfg.level}`;

    cell.addEventListener('mouseenter', () => {
      tooltipEl.classList.remove('hidden');
      tooltipEl.innerHTML = `
        <strong>${label}</strong><br>
        <span style="color:${cfg.color}">${cfg.level}: ${count}</span>
      `;
      const containerRect = containerEl.getBoundingClientRect();
      const cellRect = cell.getBoundingClientRect();
      tooltipEl.style.left = (cellRect.left - containerRect.left + cellRect.width / 2) + 'px';
      tooltipEl.style.top  = (cellRect.top  - containerRect.top  - 48) + 'px';
    });

    cell.addEventListener('mouseleave', () => tooltipEl.classList.add('hidden'));

    cell.addEventListener('click', () => exportHeatmapJSON(cfg.level, hour, allEntries, detectedAnomalies));

    fragment.appendChild(cell);
  });

  const labelRow = document.createElement('div');
  labelRow.className = 'heatmap-hour-label';
  hours.forEach(hour => {
    const span = document.createElement('span');
    span.textContent = String(hour).padStart(2, '0');
    labelRow.appendChild(span);
  });

  gridEl.appendChild(fragment);
  gridEl.appendChild(labelRow);
}

export function exportHeatmapJSON(level, hour, allEntries, detectedAnomalies) {
  const hourStr     = String(hour).padStart(2, '0');
  const hourLabel   = `${hourStr}:00`;
  const nextHourStr = String(hour + 1).padStart(2, '00');

  const hourEntries = allEntries.filter(e =>
    e.timestamp && e.level === level && e.timestamp.substring(0, 2) === hourStr
  );

  const sourceCounts = {};
  const threadCounts = {};
  const minuteCounts = {};

  hourEntries.forEach(e => {
    if (e.source)    sourceCounts[e.source] = (sourceCounts[e.source] || 0) + 1;
    if (e.thread)    threadCounts[e.thread] = (threadCounts[e.thread] || 0) + 1;
    if (e.timestamp) {
      const minute = e.timestamp.substring(0, 5);
      minuteCounts[minute] = (minuteCounts[minute] || 0) + 1;
    }
  });

  const allLevelsInHour = { INFO: 0, WARN: 0, ERROR: 0, OTHER: 0 };
  allEntries.forEach(e => {
    if (e.timestamp && e.timestamp.substring(0, 2) === hourStr) {
      if (allLevelsInHour[e.level] !== undefined) allLevelsInHour[e.level]++;
      else allLevelsInHour.OTHER++;
    }
  });

  const hourAnomalies = detectedAnomalies
    .filter(a => a.hour === hour && (a.level === level || a.level === 'ALL'))
    .map(a => ({
      type: a.type, severity: a.severity,
      message: a.message, detail: a.detail || '',
      ...(a.zScore     ? { zScore: a.zScore }                        : {}),
      ...(a.source     ? { source: a.source, percentage: a.percentage } : {}),
      ...(a.minute     ? { minute: a.minute, ratio: a.ratio }        : {})
    }));

  const exportData = {
    metadata: {
      exportedAt: new Date().toISOString(),
      filterLevel: level,
      hourRange: `${hourLabel} \u2014 ${nextHourStr}:00`,
      description: `Log entries of type ${level} during hour ${hourLabel}, exported for AI analysis.`
    },
    statistics: {
      totalEntries: hourEntries.length,
      uniqueSources: Object.keys(sourceCounts).length,
      uniqueThreads: Object.keys(threadCounts).length,
      topSources: Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([source, count]) => ({ source, count })),
      topThreads: Object.entries(threadCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([thread, count]) => ({ thread, count })),
      minuteDistribution: Object.entries(minuteCounts).sort((a, b) => a[0].localeCompare(b[0])).map(([minute, count]) => ({ minute, count })),
      allLevelsInHour
    },
    anomalies: hourAnomalies,
    entries: hourEntries.map(e => ({
      line: e.lineNumber, timestamp: e.timestamp,
      level: e.level, source: e.source,
      thread: e.thread, message: e.message
    }))
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `logs_${level.toLowerCase()}_${hourStr}h.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
