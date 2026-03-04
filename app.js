// ======================================
// JBoss Log Analyzer — Core Orchestrator
// ======================================

import { PARSERS }                          from './parsers/registry.js';
import { renderTimeline }                   from './chart.js';
import { renderAllHeatmaps }                from './heatmap.js';
import { detectAnomalies, renderAnomalyPanel } from './anomaly.js';
import { escapeHtml, highlightText, shortenSource } from './utils.js';

// ---- State ----

let allEntries        = [];
let filteredEntries   = [];
let activeParser      = 'jboss';
let activeFilter      = 'all';
let searchKeywords    = [];
let excludeKeywords   = [];
let timeFrom          = '';
let timeTo            = '';
let chartLoaded       = false;
let chartActiveLevels = new Set(['INFO', 'WARN', 'ERROR', 'OTHER']);
let detectedAnomalies = [];
let anomalyPulseEnabled = { ERROR: false, INFO: false, WARN: false };

// ---- DOM References ----

const dom = {};

function cacheDom() {
  dom.uploadZone    = document.getElementById('upload-zone');
  dom.fileInput     = document.getElementById('file-input');
  dom.fileName      = document.getElementById('file-name');
  dom.uploadHint    = document.getElementById('upload-hint');
  dom.dashboard     = document.getElementById('dashboard');
  dom.logTypeCards  = document.querySelectorAll('.log-type-card');

  dom.searchInput   = document.getElementById('search-input');
  dom.excludeInput  = document.getElementById('exclude-input');
  dom.searchTagWrap = document.getElementById('search-tag-wrap');
  dom.excludeTagWrap= document.getElementById('exclude-tag-wrap');
  dom.timeFrom      = document.getElementById('time-from');
  dom.timeTo        = document.getElementById('time-to');
  dom.clearFiltersBtn = document.getElementById('clear-filters-btn');
  dom.logCount        = document.getElementById('log-count');
  dom.logBody       = document.getElementById('log-body');
  dom.emptyState    = document.getElementById('empty-state');
  dom.logTableWrap  = document.getElementById('log-table-wrap');
  dom.statCards     = document.querySelectorAll('.stat-card');
  dom.countAll      = document.getElementById('count-all');
  dom.countInfo     = document.getElementById('count-info');
  dom.countWarn     = document.getElementById('count-warn');
  dom.countError    = document.getElementById('count-error');
  dom.countOther    = document.getElementById('count-other');

  dom.timelineCanvas  = document.getElementById('timeline-canvas');
  dom.chartTooltip    = document.getElementById('chart-tooltip');
  dom.chartPlaceholder= document.getElementById('chart-placeholder');
  dom.chartLoading    = document.getElementById('chart-loading');
  dom.chartCanvasWrap = document.getElementById('chart-canvas-wrap');
  dom.chartLegend     = document.getElementById('chart-legend');
  dom.loadChartBtn    = document.getElementById('load-chart-btn');

  dom.heatmapContainer     = document.getElementById('heatmap-container');
  dom.heatmapGrid          = document.getElementById('heatmap-grid');
  dom.heatmapTooltip       = document.getElementById('heatmap-tooltip');
  dom.heatmapInfoContainer = document.getElementById('heatmap-info-container');
  dom.heatmapInfoGrid      = document.getElementById('heatmap-info-grid');
  dom.heatmapInfoTooltip   = document.getElementById('heatmap-info-tooltip');
  dom.heatmapWarnContainer = document.getElementById('heatmap-warn-container');
  dom.heatmapWarnGrid      = document.getElementById('heatmap-warn-grid');
  dom.heatmapWarnTooltip   = document.getElementById('heatmap-warn-tooltip');

  dom.anomalyPanel = document.getElementById('anomaly-panel');
  dom.anomalyCount = document.getElementById('anomaly-count');
  dom.anomalyList  = document.getElementById('anomaly-list');
}

function getHeatmapDomRefs() {
  return {
    error: { containerEl: dom.heatmapContainer,     gridEl: dom.heatmapGrid,     tooltipEl: dom.heatmapTooltip },
    info:  { containerEl: dom.heatmapInfoContainer, gridEl: dom.heatmapInfoGrid, tooltipEl: dom.heatmapInfoTooltip },
    warn:  { containerEl: dom.heatmapWarnContainer, gridEl: dom.heatmapWarnGrid, tooltipEl: dom.heatmapWarnTooltip },
  };
}

// ---- Filtering ----

function applyFilters() {
  const fromSec = timeFrom ? timeInputToSeconds(timeFrom) : null;
  const toSec   = timeTo   ? timeInputToSeconds(timeTo)   : null;

  filteredEntries = allEntries.filter(entry => {
    const matchesFilter = activeFilter === 'all' || entry.level === activeFilter.toUpperCase();

    const rawLower = entry.raw.toLowerCase();
    const matchesSearch = searchKeywords.length === 0 ||
      searchKeywords.some(kw =>
        entry.message.toLowerCase().includes(kw) ||
        entry.source.toLowerCase().includes(kw)  ||
        entry.thread.toLowerCase().includes(kw)  ||
        entry.timestamp.includes(kw)             ||
        rawLower.includes(kw)
      );

    const notExcluded = excludeKeywords.length === 0 ||
      !excludeKeywords.some(kw => rawLower.includes(kw));

    let matchesTime = true;
    if ((fromSec !== null || toSec !== null) && entry.timestamp) {
      const entrySec = timestampToSeconds(entry.timestamp);
      if (fromSec !== null && entrySec < fromSec) matchesTime = false;
      if (toSec   !== null && entrySec > toSec)   matchesTime = false;
    }

    return matchesFilter && matchesSearch && notExcluded && matchesTime;
  });

  renderTable();
  updateLogCount();
  updateClearFiltersBtn();
  if (chartLoaded) renderTimeline(allEntries, chartActiveLevels, dom.timelineCanvas, dom.chartTooltip);
}

function hasActiveFilters() {
  return searchKeywords.length > 0 ||
    excludeKeywords.length > 0 ||
    timeFrom !== '' ||
    timeTo !== '' ||
    activeFilter !== 'all';
}

function updateClearFiltersBtn() {
  dom.clearFiltersBtn.classList.toggle('hidden', !hasActiveFilters());
}

function clearFilters() {
  searchKeywords  = [];
  excludeKeywords = [];
  timeFrom = '';
  timeTo   = '';
  activeFilter = 'all';

  dom.searchInput.value  = '';
  dom.excludeInput.value = '';
  dom.timeFrom.value     = '';
  dom.timeTo.value       = '';

  renderTagChips(searchKeywords,  dom.searchTagWrap,  dom.searchInput,  false);
  renderTagChips(excludeKeywords, dom.excludeTagWrap, dom.excludeInput, true);
  updateActiveCard('all');
  applyFilters();
}

function timestampToSeconds(ts) {
  const match = ts.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
  if (!match) return 0;
  return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]) + parseInt(match[4]) / 1000;
}

function timeInputToSeconds(val) {
  const parts = val.split(':');
  return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60;
}

// ---- Rendering ----

function updateStats() {
  const counts = { all: allEntries.length, info: 0, warn: 0, error: 0, other: 0 };
  allEntries.forEach(e => {
    switch (e.level) {
      case 'INFO':  counts.info++;  break;
      case 'WARN':  counts.warn++;  break;
      case 'ERROR': counts.error++; break;
      default:      counts.other++; break;
    }
  });
  animateCounter(dom.countAll,   counts.all);
  animateCounter(dom.countInfo,  counts.info);
  animateCounter(dom.countWarn,  counts.warn);
  animateCounter(dom.countError, counts.error);
  animateCounter(dom.countOther, counts.other);
}

function animateCounter(el, target) {
  const duration = 600;
  const start    = parseInt(el.textContent) || 0;
  const diff     = target - start;
  const startTime = performance.now();
  function step(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased    = 1 - Math.pow(1 - progress, 3);
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

  const fragment = document.createDocumentFragment();

  filteredEntries.slice(0, 500).forEach((entry, idx) => {
    const tr = document.createElement('tr');
    tr.className    = `level-${entry.level.toLowerCase()} log-row`;
    tr.dataset.index = idx;

    const preview = entry.message.length > 100
      ? entry.message.substring(0, 100) + '\u2026'
      : entry.message;

    tr.innerHTML = `
      <td class="cell-line">${entry.lineNumber}</td>
      <td class="cell-time">${escapeHtml(entry.timestamp)}</td>
      <td><span class="level-badge badge-${entry.level.toLowerCase()}">${entry.level}</span></td>
      <td class="cell-source" title="${escapeHtml(entry.source)}">${escapeHtml(shortenSource(entry.source))}</td>
      <td class="cell-preview" title="Clique para expandir">${escapeHtml(preview)}</td>
      <td class="cell-expand"><span class="expand-icon">&#9658;</span></td>
    `;

    tr.addEventListener('click', () => toggleDetail(tr, entry));
    fragment.appendChild(tr);
  });

  dom.logBody.innerHTML = '';
  dom.logBody.appendChild(fragment);
}

function toggleDetail(row, entry) {
  const existing = row.nextElementSibling;

  if (existing && existing.classList.contains('detail-row')) {
    existing.classList.remove('detail-row-open');
    row.classList.remove('row-expanded');
    setTimeout(() => existing.remove(), 250);
    return;
  }

  dom.logBody.querySelectorAll('.detail-row').forEach(r => {
    r.previousElementSibling?.classList.remove('row-expanded');
    r.remove();
  });

  const detailTr = document.createElement('tr');
  detailTr.className = 'detail-row';

  const messageHtml = searchKeywords.length > 0
    ? highlightText(escapeHtml(entry.message), searchKeywords)
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
  requestAnimationFrame(() => detailTr.classList.add('detail-row-open'));
}

function updateLogCount() {
  const total   = filteredEntries.length;
  const showing = Math.min(total, 500);
  dom.logCount.textContent = total > 500
    ? `Mostrando ${showing} de ${total} entradas`
    : `${total} entradas`;
}

// ---- Tag Input ----

function renderTagChips(keywords, wrapEl, inputEl, isExclude) {
  wrapEl.querySelectorAll('.tag-chip').forEach(c => c.remove());

  keywords.forEach((kw, i) => {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.appendChild(document.createTextNode(kw));

    const btn = document.createElement('button');
    btn.className = 'tag-remove';
    btn.setAttribute('type', 'button');
    btn.textContent = '\u00d7';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      keywords.splice(i, 1);
      renderTagChips(keywords, wrapEl, inputEl, isExclude);
      applyFilters();
    });
    chip.appendChild(btn);
    wrapEl.insertBefore(chip, inputEl);
  });

  const defaultPlaceholder = isExclude
    ? 'Excluir palavra-chave... (Enter para adicionar)'
    : 'Pesquisar logs... (Enter para adicionar)';
  inputEl.placeholder = keywords.length > 0 ? 'Adicionar...' : defaultPlaceholder;
}

// ---- Event Handlers ----

function handleFileSelect(file) {
  if (!file) return;

  dom.fileName.textContent = file.name;
  dom.fileName.classList.remove('hidden');

  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;

    allEntries    = PARSERS[activeParser].parse(text);
    activeFilter  = 'error';
    searchKeywords  = [];
    excludeKeywords = [];
    dom.searchInput.value  = '';
    dom.excludeInput.value = '';
    renderTagChips(searchKeywords,  dom.searchTagWrap,  dom.searchInput,  false);
    renderTagChips(excludeKeywords, dom.excludeTagWrap, dom.excludeInput, true);

    // Reset chart
    chartLoaded = false;
    dom.chartPlaceholder.classList.remove('hidden');
    dom.chartCanvasWrap.classList.add('hidden');
    dom.chartLegend.classList.add('hidden');
    dom.chartLoading.classList.add('hidden');

    updateStats();
    updateActiveCard('error');
    applyFilters();

    detectedAnomalies = detectAnomalies(allEntries);
    renderAnomalyPanel(detectedAnomalies, dom.anomalyPanel, dom.anomalyCount, dom.anomalyList);
    renderAllHeatmaps(allEntries, detectedAnomalies, anomalyPulseEnabled, getHeatmapDomRefs());

    dom.dashboard.classList.remove('hidden');
    dom.dashboard.classList.add('animate-in');
    dom.heatmapContainer.classList.remove('hidden');
    dom.heatmapInfoContainer.classList.remove('hidden');
    dom.heatmapWarnContainer.classList.remove('hidden');
  };

  reader.readAsText(file, 'UTF-8');
}

function updateActiveCard(filter) {
  dom.statCards.forEach(card => card.classList.toggle('active', card.dataset.filter === filter));
}

function loadChartOnDemand() {
  dom.chartPlaceholder.classList.add('hidden');
  dom.chartLoading.classList.remove('hidden');

  setTimeout(() => {
    chartLoaded = true;
    dom.chartLoading.classList.add('hidden');
    dom.chartCanvasWrap.classList.remove('hidden');
    dom.chartLegend.classList.remove('hidden');
    renderTimeline(allEntries, chartActiveLevels, dom.timelineCanvas, dom.chartTooltip);
  }, 50);
}

function bindEvents() {
  // Log type selector
  dom.logTypeCards.forEach(card => {
    card.addEventListener('click', () => {
      if (card.disabled) return;
      const parser = card.dataset.parser;
      if (!PARSERS[parser]?.available) return;
      activeParser = parser;
      dom.logTypeCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      if (dom.uploadHint) dom.uploadHint.textContent = PARSERS[parser].hint;
    });
  });

  // Upload zone
  dom.uploadZone.addEventListener('click', () => dom.fileInput.click());
  dom.fileInput.addEventListener('change', (e) => handleFileSelect(e.target.files[0]));
  dom.uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); dom.uploadZone.classList.add('dragging'); });
  dom.uploadZone.addEventListener('dragleave', () => dom.uploadZone.classList.remove('dragging'));
  dom.uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dom.uploadZone.classList.remove('dragging');
    if (e.dataTransfer.files[0]) handleFileSelect(e.dataTransfer.files[0]);
  });

  // Stat card filters
  dom.statCards.forEach(card => {
    card.addEventListener('click', () => {
      activeFilter = card.dataset.filter;
      updateActiveCard(activeFilter);
      applyFilters();
    });
  });

  // Search tag input
  dom.searchInput.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ',') && dom.searchInput.value.trim()) {
      e.preventDefault();
      const val = dom.searchInput.value.replace(/,\s*$/, '').trim().toLowerCase();
      if (val && !searchKeywords.includes(val)) {
        searchKeywords.push(val);
        renderTagChips(searchKeywords, dom.searchTagWrap, dom.searchInput, false);
        applyFilters();
      }
      dom.searchInput.value = '';
    } else if (e.key === 'Backspace' && !dom.searchInput.value && searchKeywords.length > 0) {
      searchKeywords.pop();
      renderTagChips(searchKeywords, dom.searchTagWrap, dom.searchInput, false);
      applyFilters();
    }
  });
  dom.searchTagWrap.addEventListener('click', () => dom.searchInput.focus());

  // Exclude tag input
  dom.excludeInput.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ',') && dom.excludeInput.value.trim()) {
      e.preventDefault();
      const val = dom.excludeInput.value.replace(/,\s*$/, '').trim().toLowerCase();
      if (val && !excludeKeywords.includes(val)) {
        excludeKeywords.push(val);
        renderTagChips(excludeKeywords, dom.excludeTagWrap, dom.excludeInput, true);
        applyFilters();
      }
      dom.excludeInput.value = '';
    } else if (e.key === 'Backspace' && !dom.excludeInput.value && excludeKeywords.length > 0) {
      excludeKeywords.pop();
      renderTagChips(excludeKeywords, dom.excludeTagWrap, dom.excludeInput, true);
      applyFilters();
    }
  });
  dom.excludeTagWrap.addEventListener('click', () => dom.excludeInput.focus());

  // Time range
  dom.timeFrom.addEventListener('change', (e) => { timeFrom = e.target.value; applyFilters(); });
  dom.timeTo.addEventListener('change',   (e) => { timeTo   = e.target.value; applyFilters(); });

  // Clear filters
  dom.clearFiltersBtn.addEventListener('click', clearFilters);

  // Load chart on demand
  dom.loadChartBtn.addEventListener('click', loadChartOnDemand);

  // Chart legend filter
  dom.chartLegend.querySelectorAll('.legend-item').forEach(item => {
    item.addEventListener('click', () => {
      const level = item.dataset.level;
      if (chartActiveLevels.has(level)) {
        if (chartActiveLevels.size > 1) { chartActiveLevels.delete(level); item.classList.remove('active'); }
      } else {
        chartActiveLevels.add(level); item.classList.add('active');
      }
      if (chartLoaded) renderTimeline(allEntries, chartActiveLevels, dom.timelineCanvas, dom.chartTooltip);
    });
  });

  // Anomaly panel collapse/expand
  document.getElementById('anomaly-toggle').addEventListener('click', () => {
    dom.anomalyPanel.classList.toggle('collapsed');
  });

  // Heatmap anomaly pulse toggle
  document.querySelectorAll('.anomaly-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const level = btn.dataset.level;
      anomalyPulseEnabled[level] = !anomalyPulseEnabled[level];
      btn.classList.toggle('active', anomalyPulseEnabled[level]);
      renderAllHeatmaps(allEntries, detectedAnomalies, anomalyPulseEnabled, getHeatmapDomRefs());
    });
  });
}

// ---- Init ----

function init() {
  cacheDom();
  bindEvents();
}

document.addEventListener('DOMContentLoaded', init);
