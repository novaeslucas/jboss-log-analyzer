// ======================================
// JBoss Log Analyzer — Core Engine
// ======================================

const App = (() => {
  // State
  let allEntries = [];
  let filteredEntries = [];
  let activeFilter = 'all';
  let searchQuery = '';
  let excludeQuery = '';
  let timeFrom = '';
  let timeTo = '';
  let chartLoaded = false;
  let chartActiveLevels = new Set(['INFO', 'WARN', 'ERROR', 'OTHER']);
  let detectedAnomalies = [];
  let anomalyPulseEnabled = { ERROR: false, INFO: false, WARN: false };

  // ANSI escape code pattern
  const ANSI_REGEX = /\x1b\[[0-9;]*m/g;

  // JBoss log line pattern:
  // HH:mm:ss,SSS LEVEL  [source] (thread) message
  const LOG_LINE_REGEX = /^(\d{2}:\d{2}:\d{2},\d{3})\s+(INFO|WARN|ERROR|DEBUG|TRACE|FATAL)\s+\[([^\]]+)\]\s+\(([^)]+)\)\s+(.+)$/;

  // ---- DOM References ----
  const dom = {};

  function cacheDom() {
    dom.uploadZone = document.getElementById('upload-zone');
    dom.fileInput = document.getElementById('file-input');
    dom.fileName = document.getElementById('file-name');
    dom.dashboard = document.getElementById('dashboard');
    dom.searchInput = document.getElementById('search-input');
    dom.excludeInput = document.getElementById('exclude-input');
    dom.timeFrom = document.getElementById('time-from');
    dom.timeTo = document.getElementById('time-to');
    dom.logCount = document.getElementById('log-count');
    dom.logBody = document.getElementById('log-body');
    dom.emptyState = document.getElementById('empty-state');
    dom.logTableWrap = document.getElementById('log-table-wrap');
    dom.statCards = document.querySelectorAll('.stat-card');
    dom.countAll = document.getElementById('count-all');
    dom.countInfo = document.getElementById('count-info');
    dom.countWarn = document.getElementById('count-warn');
    dom.countError = document.getElementById('count-error');
    dom.countOther = document.getElementById('count-other');
    dom.timelineCanvas = document.getElementById('timeline-canvas');
    dom.chartTooltip = document.getElementById('chart-tooltip');
    dom.chartContainer = document.getElementById('chart-container');
    dom.chartPlaceholder = document.getElementById('chart-placeholder');
    dom.chartLoading = document.getElementById('chart-loading');
    dom.chartCanvasWrap = document.getElementById('chart-canvas-wrap');
    dom.chartLegend = document.getElementById('chart-legend');
    dom.loadChartBtn = document.getElementById('load-chart-btn');
    dom.heatmapContainer = document.getElementById('heatmap-container');
    dom.heatmapGrid = document.getElementById('heatmap-grid');
    dom.heatmapTooltip = document.getElementById('heatmap-tooltip');
    dom.heatmapInfoContainer = document.getElementById('heatmap-info-container');
    dom.heatmapInfoGrid = document.getElementById('heatmap-info-grid');
    dom.heatmapInfoTooltip = document.getElementById('heatmap-info-tooltip');
    dom.heatmapWarnContainer = document.getElementById('heatmap-warn-container');
    dom.heatmapWarnGrid = document.getElementById('heatmap-warn-grid');
    dom.heatmapWarnTooltip = document.getElementById('heatmap-warn-tooltip');
    dom.anomalyPanel = document.getElementById('anomaly-panel');
    dom.anomalyCount = document.getElementById('anomaly-count');
    dom.anomalyList = document.getElementById('anomaly-list');
  }

  // ---- Parser ----

  function cleanAnsi(text) {
    return text.replace(ANSI_REGEX, '').trim();
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function parseLogFile(rawText) {
    const lines = rawText.split(/\r?\n/);
    const entries = [];
    let currentEntry = null;

    lines.forEach((rawLine, index) => {
      const line = cleanAnsi(rawLine);
      if (!line) return;

      const match = line.match(LOG_LINE_REGEX);

      if (match) {
        // Save previous entry
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
        // Non-matching line — could be continuation or system output
        if (currentEntry) {
          // Append to previous entry's message
          currentEntry.message += '\n' + line;
        } else {
          // Standalone non-log line
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

    // Push last entry
    if (currentEntry) entries.push(currentEntry);

    return entries;
  }

  function normalizeLevel(level) {
    switch (level) {
      case 'WARN': return 'WARN';
      case 'ERROR':
      case 'FATAL': return 'ERROR';
      case 'DEBUG':
      case 'TRACE': return 'OTHER';
      default: return level;
    }
  }

  // ---- Filtering ----

  function applyFilters() {
    const fromSec = timeFrom ? timeInputToSeconds(timeFrom) : null;
    const toSec = timeTo ? timeInputToSeconds(timeTo) : null;

    filteredEntries = allEntries.filter(entry => {
      const matchesFilter = activeFilter === 'all' || entry.level === activeFilter.toUpperCase();
      const matchesSearch = !searchQuery ||
        entry.message.toLowerCase().includes(searchQuery) ||
        entry.source.toLowerCase().includes(searchQuery) ||
        entry.thread.toLowerCase().includes(searchQuery) ||
        entry.timestamp.includes(searchQuery) ||
        entry.raw.toLowerCase().includes(searchQuery);
      const notExcluded = !excludeQuery ||
        !entry.raw.toLowerCase().includes(excludeQuery);

      let matchesTime = true;
      if ((fromSec !== null || toSec !== null) && entry.timestamp) {
        const entrySec = timestampToSeconds(entry.timestamp);
        if (fromSec !== null && entrySec < fromSec) matchesTime = false;
        if (toSec !== null && entrySec > toSec) matchesTime = false;
      }

      return matchesFilter && matchesSearch && notExcluded && matchesTime;
    });

    renderTable();
    updateLogCount();
    if (chartLoaded) {
      renderTimeline();
    }
  }

  // Convert JBoss timestamp "HH:mm:ss,SSS" to total seconds
  function timestampToSeconds(ts) {
    const match = ts.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
    if (!match) return 0;
    return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]) + parseInt(match[4]) / 1000;
  }

  // Convert HTML time input "HH:MM" to total seconds
  function timeInputToSeconds(val) {
    const parts = val.split(':');
    return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60;
  }

  // ---- Rendering ----

  function updateStats() {
    const counts = { all: allEntries.length, info: 0, warn: 0, error: 0, other: 0 };

    allEntries.forEach(e => {
      switch (e.level) {
        case 'INFO': counts.info++; break;
        case 'WARN': counts.warn++; break;
        case 'ERROR': counts.error++; break;
        default: counts.other++; break;
      }
    });

    animateCounter(dom.countAll, counts.all);
    animateCounter(dom.countInfo, counts.info);
    animateCounter(dom.countWarn, counts.warn);
    animateCounter(dom.countError, counts.error);
    animateCounter(dom.countOther, counts.other);
  }

  function animateCounter(el, target) {
    const duration = 600;
    const start = parseInt(el.textContent) || 0;
    const diff = target - start;
    const startTime = performance.now();

    function step(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      el.textContent = Math.round(start + diff * eased);
      if (progress < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  }

  function renderTable() {
    if (filteredEntries.length === 0) {
      dom.logBody.innerHTML = '';
      dom.emptyState.classList.remove('hidden');
      dom.logTableWrap.classList.add('hidden');
      return;
    }

    dom.emptyState.classList.add('hidden');
    dom.logTableWrap.classList.remove('hidden');

    // Virtual rendering: show max 500 rows for performance
    const maxRows = 500;
    const entriesToRender = filteredEntries.slice(0, maxRows);

    const fragment = document.createDocumentFragment();

    entriesToRender.forEach((entry, idx) => {
      const tr = document.createElement('tr');
      tr.className = `level-${entry.level.toLowerCase()} log-row`;
      tr.dataset.index = idx;

      const levelClass = `badge-${entry.level.toLowerCase()}`;

      const preview = entry.message.length > 100
        ? entry.message.substring(0, 100) + '…'
        : entry.message;

      tr.innerHTML = `
        <td class="cell-line">${entry.lineNumber}</td>
        <td class="cell-time">${escapeHtml(entry.timestamp)}</td>
        <td><span class="level-badge ${levelClass}">${entry.level}</span></td>
        <td class="cell-source" title="${escapeHtml(entry.source)}">${escapeHtml(shortenSource(entry.source))}</td>
        <td class="cell-preview" title="Clique para expandir">${escapeHtml(preview)}</td>
        <td class="cell-expand"><span class="expand-icon">▶</span></td>
      `;

      tr.addEventListener('click', () => toggleDetail(tr, entry));

      fragment.appendChild(tr);
    });

    dom.logBody.innerHTML = '';
    dom.logBody.appendChild(fragment);
  }

  function toggleDetail(row, entry) {
    const existing = row.nextElementSibling;

    // If detail row already open, close it
    if (existing && existing.classList.contains('detail-row')) {
      existing.classList.remove('detail-row-open');
      row.classList.remove('row-expanded');
      // Remove after animation
      setTimeout(() => existing.remove(), 250);
      return;
    }

    // Close any other open detail rows
    dom.logBody.querySelectorAll('.detail-row').forEach(r => {
      r.previousElementSibling?.classList.remove('row-expanded');
      r.remove();
    });

    // Create detail row
    const detailTr = document.createElement('tr');
    detailTr.className = 'detail-row';

    const messageHtml = searchQuery
      ? highlightText(escapeHtml(entry.message), searchQuery)
      : escapeHtml(entry.message);

    detailTr.innerHTML = `
      <td colspan="6">
        <div class="detail-content">
          <div class="detail-header">Mensagem</div>
          <pre class="detail-message">${messageHtml}</pre>
        </div>
      </td>
    `;

    row.classList.add('row-expanded');
    row.after(detailTr);

    // Trigger open animation
    requestAnimationFrame(() => detailTr.classList.add('detail-row-open'));
  }

  function updateLogCount() {
    const total = filteredEntries.length;
    const showing = Math.min(total, 500);
    dom.logCount.textContent = total > 500
      ? `Mostrando ${showing} de ${total} entradas`
      : `${total} entradas`;
  }

  // ---- Helpers ----

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function highlightText(html, query) {
    if (!query) return html;
    const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
    return html.replace(regex, '<mark>$1</mark>');
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function shortenSource(source) {
    if (!source) return '';
    const parts = source.split('.');
    if (parts.length <= 2) return source;
    return '…' + parts.slice(-2).join('.');
  }

  // ---- Event Handlers ----

  function handleFileSelect(file) {
    if (!file) return;

    dom.fileName.textContent = file.name;
    dom.fileName.classList.remove('hidden');

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      allEntries = parseLogFile(text);
      activeFilter = 'error';
      searchQuery = '';
      dom.searchInput.value = '';

      // Reset chart state for new file
      chartLoaded = false;
      dom.chartPlaceholder.classList.remove('hidden');
      dom.chartCanvasWrap.classList.add('hidden');
      dom.chartLegend.classList.add('hidden');
      dom.chartLoading.classList.add('hidden');

      updateStats();
      updateActiveCard('error');
      applyFilters();

      // Anomaly detection
      detectedAnomalies = detectAnomalies();
      renderAnomalyPanel(detectedAnomalies);
      renderAllHeatmaps();

      // Show dashboard
      dom.dashboard.classList.remove('hidden');
      dom.dashboard.classList.add('animate-in');
      dom.heatmapContainer.classList.remove('hidden');
      dom.heatmapInfoContainer.classList.remove('hidden');
      dom.heatmapWarnContainer.classList.remove('hidden');
    };

    reader.readAsText(file, 'UTF-8');
  }

  function updateActiveCard(filter) {
    dom.statCards.forEach(card => {
      card.classList.toggle('active', card.dataset.filter === filter);
    });
  }

  function bindEvents() {
    // Upload zone click
    dom.uploadZone.addEventListener('click', () => dom.fileInput.click());

    // File input change
    dom.fileInput.addEventListener('change', (e) => {
      handleFileSelect(e.target.files[0]);
    });

    // Drag & drop
    dom.uploadZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dom.uploadZone.classList.add('dragging');
    });

    dom.uploadZone.addEventListener('dragleave', () => {
      dom.uploadZone.classList.remove('dragging');
    });

    dom.uploadZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dom.uploadZone.classList.remove('dragging');
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    });

    // Stat card filters
    dom.statCards.forEach(card => {
      card.addEventListener('click', () => {
        activeFilter = card.dataset.filter;
        updateActiveCard(activeFilter);
        applyFilters();
      });
    });

    // Search
    let searchTimeout;
    dom.searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        searchQuery = e.target.value.toLowerCase().trim();
        applyFilters();
      }, 250);
    });

    // Exclude keyword
    let excludeTimeout;
    dom.excludeInput.addEventListener('input', (e) => {
      clearTimeout(excludeTimeout);
      excludeTimeout = setTimeout(() => {
        excludeQuery = e.target.value.toLowerCase().trim();
        applyFilters();
      }, 250);
    });

    // Time range
    dom.timeFrom.addEventListener('change', (e) => {
      timeFrom = e.target.value;
      applyFilters();
    });
    dom.timeTo.addEventListener('change', (e) => {
      timeTo = e.target.value;
      applyFilters();
    });

    // Load chart on demand
    dom.loadChartBtn.addEventListener('click', loadChartOnDemand);

    // Chart legend filter
    dom.chartLegend.querySelectorAll('.legend-item').forEach(item => {
      item.addEventListener('click', () => {
        const level = item.dataset.level;
        if (chartActiveLevels.has(level)) {
          if (chartActiveLevels.size > 1) {
            chartActiveLevels.delete(level);
            item.classList.remove('active');
          }
        } else {
          chartActiveLevels.add(level);
          item.classList.add('active');
        }
        if (chartLoaded) renderTimeline();
      });
    });

    // Anomaly panel collapse/expand
    document.getElementById('anomaly-toggle').addEventListener('click', () => {
      dom.anomalyPanel.classList.toggle('collapsed');
    });

    // Heatmap anomaly pulse toggle buttons
    document.querySelectorAll('.anomaly-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const level = btn.dataset.level;
        anomalyPulseEnabled[level] = !anomalyPulseEnabled[level];
        btn.classList.toggle('active', anomalyPulseEnabled[level]);
        renderAllHeatmaps();
      });
    });
  }

  // ---- On-Demand Chart Loading ----

  function loadChartOnDemand() {
    // Show loading, hide placeholder
    dom.chartPlaceholder.classList.add('hidden');
    dom.chartLoading.classList.remove('hidden');

    // Use setTimeout to allow the browser to paint the spinner before heavy rendering
    setTimeout(() => {
      chartLoaded = true;

      // Show canvas and legend BEFORE rendering so canvas has non-zero dimensions
      dom.chartLoading.classList.add('hidden');
      dom.chartCanvasWrap.classList.remove('hidden');
      dom.chartLegend.classList.remove('hidden');

      renderTimeline();
    }, 50);
  }

  // ---- Init ----

  function init() {
    cacheDom();
    bindEvents();
  }

  // Boot
  document.addEventListener('DOMContentLoaded', init);

  // ---- Timeline Chart ----

  const CHART_COLORS = {
    INFO:  { fill: 'rgba(56, 189, 248, 0.7)',  stroke: '#38bdf8' },
    WARN:  { fill: 'rgba(251, 191, 36, 0.7)',  stroke: '#fbbf24' },
    ERROR: { fill: 'rgba(248, 113, 113, 0.8)', stroke: '#f87171' },
    OTHER: { fill: 'rgba(148, 163, 184, 0.5)', stroke: '#94a3b8' }
  };

  function renderTimeline() {
    const canvas = dom.timelineCanvas;
    if (!canvas) return;

    // Use all entries (unfiltered) to always show full timeline
    const entries = allEntries.filter(e => e.timestamp);
    if (entries.length === 0) return;

    // Group by minute bucket
    const buckets = new Map();
    entries.forEach(e => {
      const key = e.timestamp.substring(0, 5); // "HH:mm"
      if (!buckets.has(key)) buckets.set(key, { INFO: 0, WARN: 0, ERROR: 0, OTHER: 0 });
      const bucket = buckets.get(key);
      if (bucket[e.level] !== undefined) bucket[e.level]++;
      else bucket.OTHER++;
    });

    // Sort buckets by time
    const sortedKeys = [...buckets.keys()].sort();
    const data = sortedKeys.map(k => ({ time: k, ...buckets.get(k) }));

    // Canvas setup with device pixel ratio for crisp rendering
    const dpr = window.devicePixelRatio || 1;
    const wrap = canvas.parentElement;
    const width = wrap.clientWidth;
    const height = 220;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    // Chart dimensions
    const padding = { top: 15, right: 20, bottom: 35, left: 45 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    // Max value for Y axis (only active levels)
    const activeLevels = [...chartActiveLevels];
    const maxTotal = Math.max(...data.map(d => activeLevels.reduce((sum, l) => sum + d[l], 0)), 1);
    const yStep = niceStep(maxTotal);
    const yMax = Math.ceil(maxTotal / yStep) * yStep;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Y-axis gridlines
    ctx.strokeStyle = 'rgba(42, 46, 66, 0.6)';
    ctx.lineWidth = 1;
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillStyle = '#5c6078';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let v = 0; v <= yMax; v += yStep) {
      const y = padding.top + chartH - (v / yMax) * chartH;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
      ctx.fillText(v, padding.left - 8, y);
    }

    // Bars
    const barCount = data.length;
    const gap = Math.max(2, Math.min(6, chartW / barCount * 0.2));
    const barW = Math.max(3, (chartW - gap * barCount) / barCount);
    const levels = ['OTHER', 'INFO', 'WARN', 'ERROR'].filter(l => chartActiveLevels.has(l));

    // Store bar positions for tooltip
    const barRects = [];

    data.forEach((d, i) => {
      const x = padding.left + i * (barW + gap);
      let yOffset = 0;

      const total = activeLevels.reduce((sum, l) => sum + d[l], 0);
      const barRect = { x, w: barW, time: d.time, data: d, total };
      barRects.push(barRect);

      levels.forEach(level => {
        const val = d[level];
        if (val === 0) return;

        const barH = (val / yMax) * chartH;
        const y = padding.top + chartH - yOffset - barH;

        // Rounded rect for the top segment
        ctx.fillStyle = CHART_COLORS[level].fill;
        ctx.beginPath();
        const r = Math.min(3, barW / 4);
        roundRect(ctx, x, y, barW, barH, r);
        ctx.fill();

        yOffset += barH;
      });

      // X-axis labels (show every N labels to avoid overlap)
      const labelInterval = Math.max(1, Math.floor(barCount / 15));
      if (i % labelInterval === 0) {
        ctx.fillStyle = '#5c6078';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillText(d.time, x + barW / 2, padding.top + chartH + 6);
      }
    });

    // Tooltip on hover
    canvas.onmousemove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const hit = barRects.find(b => mx >= b.x && mx <= b.x + b.w && my >= padding.top && my <= padding.top + chartH);

      if (hit) {
        dom.chartTooltip.classList.remove('hidden');
        dom.chartTooltip.innerHTML = `
          <strong>${hit.time}</strong><br>
          <span style="color:${CHART_COLORS.INFO.stroke}">INFO: ${hit.data.INFO}</span><br>
          <span style="color:${CHART_COLORS.WARN.stroke}">WARN: ${hit.data.WARN}</span><br>
          <span style="color:${CHART_COLORS.ERROR.stroke}">ERROR: ${hit.data.ERROR}</span><br>
          <span style="color:${CHART_COLORS.OTHER.stroke}">OTHER: ${hit.data.OTHER}</span><br>
          <strong>Total: ${hit.total}</strong>
        `;
        const tooltipX = Math.min(e.clientX - rect.left + 12, width - 140);
        dom.chartTooltip.style.left = tooltipX + 'px';
        dom.chartTooltip.style.top = (my - 10) + 'px';
      } else {
        dom.chartTooltip.classList.add('hidden');
      }
    };

    canvas.onmouseleave = () => {
      dom.chartTooltip.classList.add('hidden');
    };
  }

  function roundRect(ctx, x, y, w, h, r) {
    if (h < 1) return;
    r = Math.min(r, h / 2, w / 2);
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function niceStep(max) {
    if (max <= 5) return 1;
    if (max <= 15) return 3;
    if (max <= 30) return 5;
    if (max <= 60) return 10;
    if (max <= 150) return 25;
    if (max <= 300) return 50;
    return Math.ceil(max / 6 / 10) * 10;
  }

  // ---- Heatmaps (GitHub-style) ----

  const HEATMAP_CONFIGS = [
    { level: 'ERROR', cssPrefix: 'heat',      color: '#f87171', container: 'heatmapContainer',     grid: 'heatmapGrid',     tooltip: 'heatmapTooltip' },
    { level: 'INFO',  cssPrefix: 'heat-info',  color: '#38bdf8', container: 'heatmapInfoContainer', grid: 'heatmapInfoGrid', tooltip: 'heatmapInfoTooltip' },
    { level: 'WARN',  cssPrefix: 'heat-warn',  color: '#fbbf24', container: 'heatmapWarnContainer', grid: 'heatmapWarnGrid', tooltip: 'heatmapWarnTooltip' },
  ];

  function renderAllHeatmaps() {
    // Build set of anomalous hours per level for pulse indicators
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
      renderHeatmap(cfg.level, cfg.cssPrefix, cfg.color, dom[cfg.container], dom[cfg.grid], dom[cfg.tooltip], pulseHours);
    });
  }

  function renderHeatmap(level, cssPrefix, color, containerEl, gridEl, tooltipEl, anomalyHours) {
    if (!gridEl) return;

    gridEl.innerHTML = '';

    const entries = allEntries.filter(e => e.timestamp);
    if (entries.length === 0) {
      containerEl.classList.add('hidden');
      return;
    }

    const firstHour = parseInt(entries[0].timestamp.substring(0, 2), 10);
    const lastHour = parseInt(entries[entries.length - 1].timestamp.substring(0, 2), 10);

    // Count entries of this level per hour
    const counts = new Map();
    entries.forEach(e => {
      if (e.level === level) {
        const hour = parseInt(e.timestamp.substring(0, 2), 10);
        counts.set(hour, (counts.get(hour) || 0) + 1);
      }
    });

    const hours = [];
    for (let h = firstHour; h <= lastHour; h++) {
      hours.push(h);
    }

    if (hours.length === 0) {
      containerEl.classList.add('hidden');
      return;
    }

    const maxCount = Math.max(...hours.map(h => counts.get(h) || 0), 1);

    function heatLevel(count) {
      if (count === 0) return 0;
      if (count <= maxCount * 0.25) return 1;
      if (count <= maxCount * 0.50) return 2;
      if (count <= maxCount * 0.75) return 3;
      return 4;
    }

    const fragment = document.createDocumentFragment();

    hours.forEach(hour => {
      const count = counts.get(hour) || 0;
      const lvl = heatLevel(count);
      const label = String(hour).padStart(2, '0') + ':00';

      const cell = document.createElement('div');
      const pulseClass = anomalyHours && anomalyHours.has(hour) ? ' anomaly-pulse' : '';
      cell.className = `heatmap-cell ${cssPrefix}-${lvl}${pulseClass}`;
      cell.title = `${label} \u2014 ${count} ${level}`;

      cell.addEventListener('mouseenter', () => {
        tooltipEl.classList.remove('hidden');
        tooltipEl.innerHTML = `
          <strong>${label}</strong><br>
          <span style="color:${color}">${level}: ${count}</span>
        `;
        const rect = containerEl.getBoundingClientRect();
        const cellRect = cell.getBoundingClientRect();
        tooltipEl.style.left = (cellRect.left - rect.left + cellRect.width / 2) + 'px';
        tooltipEl.style.top = (cellRect.top - rect.top - 48) + 'px';
      });

      cell.addEventListener('mouseleave', () => {
        tooltipEl.classList.add('hidden');
      });

      // Click to export JSON
      cell.addEventListener('click', () => {
        exportHeatmapJSON(level, hour);
      });

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

  // ---- Anomaly Detection Engine ----

  function detectAnomalies() {
    const alerts = [];
    const entries = allEntries.filter(e => e.timestamp);
    if (entries.length === 0) return alerts;

    const firstHour = parseInt(entries[0].timestamp.substring(0, 2), 10);
    const lastHour = parseInt(entries[entries.length - 1].timestamp.substring(0, 2), 10);

    const hours = [];
    for (let h = firstHour; h <= lastHour; h++) hours.push(h);
    if (hours.length < 2) return alerts;

    // Group counts by hour and level
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
            level,
            hour: h,
            count,
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
              level,
              hour: h,
              source,
              percentage: Math.round(pct),
              count,
              total: hourEntries.length,
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
            level,
            hour: h,
            minute: min,
            count,
            neighborAvg: neighborAvg.toFixed(1),
            ratio: (count / neighborAvg).toFixed(1),
            message: `Rajada de ${level} \u00e0s ${min} \u2014 ${count} entradas (${(count / neighborAvg).toFixed(0)}x vizinhos)`,
            detail: `Minuto: ${min} | M\u00e9dia vizinhos: ${neighborAvg.toFixed(1)} | Ratio: ${(count / neighborAvg).toFixed(1)}x`
          });
        }
      });
    });

    // --- 4. SILENCE Detection (hour with 0 total logs sandwiched by active hours) ---
    hours.forEach((h, i) => {
      const total = Object.values(hourlyCounts[h]).reduce((a, b) => a + b, 0);
      if (total === 0 && i > 0 && i < hours.length - 1) {
        const prevTotal = Object.values(hourlyCounts[hours[i - 1]]).reduce((a, b) => a + b, 0);
        const nextTotal = Object.values(hourlyCounts[hours[i + 1]]).reduce((a, b) => a + b, 0);
        if (prevTotal > 0 || nextTotal > 0) {
          alerts.push({
            type: 'SILENCE',
            severity: 'critical',
            level: 'ALL',
            hour: h,
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

  // ---- Anomaly Panel Rendering ----

  function renderAnomalyPanel(anomalies) {
    if (!dom.anomalyPanel) return;

    if (anomalies.length === 0) {
      dom.anomalyPanel.classList.add('hidden');
      return;
    }

    dom.anomalyPanel.classList.remove('hidden');
    dom.anomalyCount.textContent = anomalies.length;

    const fragment = document.createDocumentFragment();

    anomalies.forEach(a => {
      const card = document.createElement('div');
      card.className = `anomaly-card severity-${a.severity}`;

      const icon = a.severity === 'critical' ? '\ud83d\udd34' : '\u26a0\ufe0f';
      const typeDescriptions = {
        SPIKE: 'Pico anormal \u2014 a contagem desta hora \u00e9 significativamente maior que a m\u00e9dia (desvio padr\u00e3o Z-Score > 2)',
        CONCENTRATION: 'Concentra\u00e7\u00e3o \u2014 mais de 70% dos registros desta hora v\u00eam de uma \u00fanica source/m\u00f3dulo',
        BURST: 'Rajada \u2014 um minuto espec\u00edfico teve 5x ou mais registros que seus minutos vizinhos',
        SILENCE: 'Sil\u00eancio \u2014 nenhum log registrado nesta hora, entre horas ativas (poss\u00edvel crash ou reinicio)'
      };
      const typeTooltip = typeDescriptions[a.type] || a.type;
      const typeTag = `<span class="anomaly-tag tag-${a.type.toLowerCase()}" title="${typeTooltip}">${a.type}</span>`;
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

    dom.anomalyList.innerHTML = '';
    dom.anomalyList.appendChild(fragment);
  }

  // ---- Heatmap JSON Export ----

  function exportHeatmapJSON(level, hour) {
    const hourStr = String(hour).padStart(2, '0');
    const hourLabel = `${hourStr}:00`;
    const nextHourStr = String(hour + 1).padStart(2, '0');

    const hourEntries = allEntries.filter(e => {
      if (!e.timestamp) return false;
      const entryHour = e.timestamp.substring(0, 2);
      return e.level === level && entryHour === hourStr;
    });

    const entries = hourEntries.map(e => ({
      line: e.lineNumber,
      timestamp: e.timestamp,
      level: e.level,
      source: e.source,
      thread: e.thread,
      message: e.message
    }));

    const sourceCounts = {};
    const threadCounts = {};
    const minuteCounts = {};

    hourEntries.forEach(e => {
      if (e.source) sourceCounts[e.source] = (sourceCounts[e.source] || 0) + 1;
      if (e.thread) threadCounts[e.thread] = (threadCounts[e.thread] || 0) + 1;
      if (e.timestamp) {
        const minute = e.timestamp.substring(0, 5);
        minuteCounts[minute] = (minuteCounts[minute] || 0) + 1;
      }
    });

    const topSources = Object.entries(sourceCounts)
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([source, count]) => ({ source, count }));

    const topThreads = Object.entries(threadCounts)
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([thread, count]) => ({ thread, count }));

    const minuteDistribution = Object.entries(minuteCounts)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([minute, count]) => ({ minute, count }));

    const allLevelsInHour = { INFO: 0, WARN: 0, ERROR: 0, OTHER: 0 };
    allEntries.forEach(e => {
      if (e.timestamp && e.timestamp.substring(0, 2) === hourStr) {
        if (allLevelsInHour[e.level] !== undefined) allLevelsInHour[e.level]++;
        else allLevelsInHour.OTHER++;
      }
    });

    // Filter anomalies relevant to this hour+level
    const hourAnomalies = detectedAnomalies.filter(a =>
      a.hour === hour && (a.level === level || a.level === 'ALL')
    ).map(a => ({
      type: a.type,
      severity: a.severity,
      message: a.message,
      detail: a.detail || '',
      ...(a.zScore ? { zScore: a.zScore } : {}),
      ...(a.source ? { source: a.source, percentage: a.percentage } : {}),
      ...(a.minute ? { minute: a.minute, ratio: a.ratio } : {})
    }));

    const exportData = {
      metadata: {
        exportedAt: new Date().toISOString(),
        filterLevel: level,
        hourRange: `${hourLabel} \u2014 ${nextHourStr}:00`,
        description: `Log entries of type ${level} during hour ${hourLabel}, exported for AI analysis.`
      },
      statistics: {
        totalEntries: entries.length,
        uniqueSources: Object.keys(sourceCounts).length,
        uniqueThreads: Object.keys(threadCounts).length,
        topSources,
        topThreads,
        minuteDistribution,
        allLevelsInHour
      },
      anomalies: hourAnomalies,
      entries
    };

    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs_${level.toLowerCase()}_${hourStr}h.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return { init };
})();
