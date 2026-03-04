// ======================================
// Anomaly Detection & Panel Rendering
// ======================================

import { escapeHtml } from './utils.js';

export function detectAnomalies(allEntries) {
  const alerts = [];
  const entries = allEntries.filter(e => e.timestamp);
  if (entries.length === 0) return alerts;

  const firstHour = parseInt(entries[0].timestamp.substring(0, 2), 10);
  const lastHour  = parseInt(entries[entries.length - 1].timestamp.substring(0, 2), 10);

  const hours = [];
  for (let h = firstHour; h <= lastHour; h++) hours.push(h);
  if (hours.length < 2) return alerts;

  // Build hourly counts per level
  const hourlyCounts = {};
  hours.forEach(h => { hourlyCounts[h] = { INFO: 0, WARN: 0, ERROR: 0, OTHER: 0 }; });
  entries.forEach(e => {
    const h = parseInt(e.timestamp.substring(0, 2), 10);
    if (hourlyCounts[h]) {
      if (hourlyCounts[h][e.level] !== undefined) hourlyCounts[h][e.level]++;
      else hourlyCounts[h].OTHER++;
    }
  });

  // --- 1. SPIKE Detection (Z-Score per level) ---
  ['ERROR', 'WARN', 'INFO'].forEach(level => {
    const values = hours.map(h => hourlyCounts[h][level]);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    if (stdDev === 0) return;

    hours.forEach((h, i) => {
      const count = values[i];
      const zScore = (count - mean) / stdDev;
      if (zScore > 2 && count > 3) {
        alerts.push({
          type: 'SPIKE',
          severity: zScore > 3 ? 'critical' : 'warning',
          level, hour: h, count,
          expected: Math.round(mean),
          zScore: zScore.toFixed(2),
          message: `${level} spike \u00e0s ${String(h).padStart(2, '0')}:00 \u2014 ${count} ocorr\u00eancias (esperado ~${Math.round(mean)})`,
          detail: `Z-Score: ${zScore.toFixed(2)} | \u03c3: ${stdDev.toFixed(1)} | \u03bc: ${mean.toFixed(1)}`
        });
      }
    });
  });

  // --- 2. CONCENTRATION Detection (single source > 70%) ---
  hours.forEach(h => {
    ['ERROR', 'WARN'].forEach(level => {
      const hourEntries = entries.filter(e =>
        parseInt(e.timestamp.substring(0, 2), 10) === h && e.level === level
      );
      if (hourEntries.length < 5) return;

      const srcCounts = {};
      hourEntries.forEach(e => {
        if (e.source) srcCounts[e.source] = (srcCounts[e.source] || 0) + 1;
      });

      Object.entries(srcCounts).forEach(([source, count]) => {
        const pct = (count / hourEntries.length) * 100;
        if (pct >= 70) {
          alerts.push({
            type: 'CONCENTRATION',
            severity: pct >= 90 ? 'critical' : 'warning',
            level, hour: h, source,
            percentage: Math.round(pct),
            count, total: hourEntries.length,
            message: `${Math.round(pct)}% dos ${level} \u00e0s ${String(h).padStart(2, '0')}:00 s\u00e3o de ${source.split('.').pop()}`,
            detail: `Source: ${source} | ${count}/${hourEntries.length} entradas`
          });
        }
      });
    });
  });

  // --- 3. BURST Detection (minute with >5x avg of neighbors) ---
  ['ERROR', 'WARN'].forEach(level => {
    const minuteCounts = new Map();
    entries.filter(e => e.level === level).forEach(e => {
      const min = e.timestamp.substring(0, 5);
      minuteCounts.set(min, (minuteCounts.get(min) || 0) + 1);
    });

    const sortedMins = [...minuteCounts.keys()].sort();
    if (sortedMins.length < 3) return;

    sortedMins.forEach((min, i) => {
      const count = minuteCounts.get(min);
      const neighbors = [];
      for (let j = Math.max(0, i - 2); j <= Math.min(sortedMins.length - 1, i + 2); j++) {
        if (j !== i) neighbors.push(minuteCounts.get(sortedMins[j]));
      }
      const neighborAvg = neighbors.reduce((a, b) => a + b, 0) / neighbors.length;

      if (count > 5 && neighborAvg > 0 && count / neighborAvg >= 5) {
        const h = parseInt(min.substring(0, 2), 10);
        alerts.push({
          type: 'BURST',
          severity: count / neighborAvg >= 10 ? 'critical' : 'warning',
          level, hour: h, minute: min, count,
          neighborAvg: neighborAvg.toFixed(1),
          ratio: (count / neighborAvg).toFixed(1),
          message: `Rajada de ${level} \u00e0s ${min} \u2014 ${count} entradas (${(count / neighborAvg).toFixed(0)}x vizinhos)`,
          detail: `Minuto: ${min} | M\u00e9dia vizinhos: ${neighborAvg.toFixed(1)} | Ratio: ${(count / neighborAvg).toFixed(1)}x`
        });
      }
    });
  });

  // --- 4. SILENCE Detection (hour with 0 logs sandwiched by active hours) ---
  hours.forEach((h, i) => {
    const total = Object.values(hourlyCounts[h]).reduce((a, b) => a + b, 0);
    if (total === 0 && i > 0 && i < hours.length - 1) {
      const prevTotal = Object.values(hourlyCounts[hours[i - 1]]).reduce((a, b) => a + b, 0);
      const nextTotal = Object.values(hourlyCounts[hours[i + 1]]).reduce((a, b) => a + b, 0);
      if (prevTotal > 0 || nextTotal > 0) {
        alerts.push({
          type: 'SILENCE',
          severity: 'critical',
          level: 'ALL', hour: h,
          message: `Sil\u00eancio total \u00e0s ${String(h).padStart(2, '0')}:00 \u2014 poss\u00edvel crash ou rein\u00edcio`,
          detail: `Hora anterior: ${prevTotal} logs | Hora seguinte: ${nextTotal} logs`
        });
      }
    }
  });

  // Sort: critical first, then by hour
  alerts.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1;
    return (a.hour || 0) - (b.hour || 0);
  });

  return alerts;
}

export function renderAnomalyPanel(anomalies, panelEl, countEl, listEl) {
  if (!panelEl) return;

  if (anomalies.length === 0) {
    panelEl.classList.add('hidden');
    return;
  }

  panelEl.classList.remove('hidden');
  countEl.textContent = anomalies.length;

  const typeDescriptions = {
    SPIKE:         'Pico anormal \u2014 a contagem desta hora \u00e9 significativamente maior que a m\u00e9dia (desvio padr\u00e3o Z-Score > 2)',
    CONCENTRATION: 'Concentra\u00e7\u00e3o \u2014 mais de 70% dos registros desta hora v\u00eam de uma \u00fanica source/m\u00f3dulo',
    BURST:         'Rajada \u2014 um minuto espec\u00edfico teve 5x ou mais registros que seus minutos vizinhos',
    SILENCE:       'Sil\u00eancio \u2014 nenhum log registrado nesta hora, entre horas ativas (poss\u00edvel crash ou reinicio)'
  };

  const fragment = document.createDocumentFragment();

  anomalies.forEach(a => {
    const card = document.createElement('div');
    card.className = `anomaly-card severity-${a.severity}`;

    const icon        = a.severity === 'critical' ? '\ud83d\udd34' : '\u26a0\ufe0f';
    const typeTooltip = typeDescriptions[a.type] || a.type;
    const typeTag     = `<span class="anomaly-tag tag-${a.type.toLowerCase()}" title="${typeTooltip}">${a.type}</span>`;
    const severityTag = `<span class="anomaly-tag tag-${a.severity}">${a.severity}</span>`;

    card.innerHTML = `
      <div class="anomaly-severity">${icon}</div>
      <div class="anomaly-body">
        <div class="anomaly-message">${severityTag}${typeTag} ${escapeHtml(a.message)}</div>
        <div class="anomaly-detail">${escapeHtml(a.detail || '')}</div>
      </div>
    `;

    fragment.appendChild(card);
  });

  listEl.innerHTML = '';
  listEl.appendChild(fragment);
}
