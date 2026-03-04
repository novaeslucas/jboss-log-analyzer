// ======================================
// Timeline Chart
// ======================================

const CHART_COLORS = {
  INFO:  { fill: 'rgba(56, 189, 248, 0.7)',  stroke: '#38bdf8' },
  WARN:  { fill: 'rgba(251, 191, 36, 0.7)',  stroke: '#fbbf24' },
  ERROR: { fill: 'rgba(248, 113, 113, 0.8)', stroke: '#f87171' },
  OTHER: { fill: 'rgba(148, 163, 184, 0.5)', stroke: '#94a3b8' }
};

export function renderTimeline(allEntries, activeLevels, canvasEl, tooltipEl) {
  if (!canvasEl) return;

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

  const sortedKeys = [...buckets.keys()].sort();
  const data = sortedKeys.map(k => ({ time: k, ...buckets.get(k) }));

  // Canvas setup with device pixel ratio for crisp rendering
  const dpr = window.devicePixelRatio || 1;
  const wrap = canvasEl.parentElement;
  const width = wrap.clientWidth;
  const height = 220;

  canvasEl.width = width * dpr;
  canvasEl.height = height * dpr;
  canvasEl.style.width = width + 'px';
  canvasEl.style.height = height + 'px';

  const ctx = canvasEl.getContext('2d');
  ctx.scale(dpr, dpr);

  const padding = { top: 15, right: 20, bottom: 35, left: 45 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const activeLevelsArr = [...activeLevels];
  const maxTotal = Math.max(...data.map(d => activeLevelsArr.reduce((sum, l) => sum + d[l], 0)), 1);
  const yStep = niceStep(maxTotal);
  const yMax = Math.ceil(maxTotal / yStep) * yStep;

  ctx.clearRect(0, 0, width, height);

  // Y-axis gridlines and labels
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
  const levels = ['OTHER', 'INFO', 'WARN', 'ERROR'].filter(l => activeLevels.has(l));

  const barRects = [];

  data.forEach((d, i) => {
    const x = padding.left + i * (barW + gap);
    let yOffset = 0;

    const total = activeLevelsArr.reduce((sum, l) => sum + d[l], 0);
    barRects.push({ x, w: barW, time: d.time, data: d, total });

    levels.forEach(level => {
      const val = d[level];
      if (val === 0) return;

      const barH = (val / yMax) * chartH;
      const y = padding.top + chartH - yOffset - barH;

      ctx.fillStyle = CHART_COLORS[level].fill;
      ctx.beginPath();
      roundRect(ctx, x, y, barW, barH, Math.min(3, barW / 4));
      ctx.fill();

      yOffset += barH;
    });

    // X-axis labels
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
  canvasEl.onmousemove = (e) => {
    const rect = canvasEl.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const hit = barRects.find(b => mx >= b.x && mx <= b.x + b.w && my >= padding.top && my <= padding.top + chartH);

    if (hit) {
      tooltipEl.classList.remove('hidden');
      tooltipEl.innerHTML = `
        <strong>${hit.time}</strong><br>
        <span style="color:${CHART_COLORS.INFO.stroke}">INFO: ${hit.data.INFO}</span><br>
        <span style="color:${CHART_COLORS.WARN.stroke}">WARN: ${hit.data.WARN}</span><br>
        <span style="color:${CHART_COLORS.ERROR.stroke}">ERROR: ${hit.data.ERROR}</span><br>
        <span style="color:${CHART_COLORS.OTHER.stroke}">OTHER: ${hit.data.OTHER}</span><br>
        <strong>Total: ${hit.total}</strong>
      `;
      tooltipEl.style.left = Math.min(mx + 12, width - 140) + 'px';
      tooltipEl.style.top = (my - 10) + 'px';
    } else {
      tooltipEl.classList.add('hidden');
    }
  };

  canvasEl.onmouseleave = () => tooltipEl.classList.add('hidden');
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
  if (max <= 5)   return 1;
  if (max <= 15)  return 3;
  if (max <= 30)  return 5;
  if (max <= 60)  return 10;
  if (max <= 150) return 25;
  if (max <= 300) return 50;
  return Math.ceil(max / 6 / 10) * 10;
}
