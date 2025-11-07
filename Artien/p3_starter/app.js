// v4: adds background hover-capture to reset highlight/tooltip when cursor leaves bars or chart
(async function() {
  const width = 980, height = 540, margin = {top: 30, right: 10, bottom: 80, left: 64};
  const YEAR_MIN = 1995, YEAR_MAX = 2018;

  const [disasters, co2] = await Promise.all([
    fetch('../p3_prep/disasters_prepped.json').then(r => r.json()),
    fetch('../p3_prep/co2_prepped.json').then(r => r.json())
  ]);

  const tooltip = d3.select('#tooltip');
  const container = d3.select('#chart');

  const svg = container.append('svg')
      .attr('width', width)
      .attr('height', height);

  const plot = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  // Background capture rect to clear focus when not hovering bars
  const hoverBG = plot.append('rect')
    .attr('class', 'hover-bg')
    .attr('x', 0).attr('y', 0)
    .attr('width', innerW).attr('height', innerH)
    .attr('fill', 'transparent')
    .lower(); // keep it under the bars

  const geos = Array.from(new Set(disasters.map(d => d.geo))).sort((a,b) => a === 'Global' ? -1 : (b === 'Global' ? 1 : d3.ascending(a,b)));
  const types = Array.from(new Set(disasters.map(d => d.type))).sort(d3.ascending);

  const colorByType = new Map([
    ['Wildfire', '#b30000'],
    ['Storm', '#7b3294'],
    ['Drought', '#f57c00'],
    ['Flood', '#2c7bb6'],
    ['Extreme temperature', '#660000'],
    ['Landslide', '#1b5e20']
  ]);
  const color = d3.scaleOrdinal().domain(types).range(types.map(t => colorByType.get(t) || '#888'));

  const geoSelect = d3.select('#geo-select');
  geoSelect.selectAll('option').data(geos).join('option').attr('value', d => d).text(d => d);
  let currentGeo = geoSelect.node().value || 'Global';
  let sortMode = 'year'; // default chronological

  const x = d3.scaleBand().paddingInner(0.12).paddingOuter(0.04).range([0, innerW]);
  const y = d3.scaleLinear().range([innerH, 0]);

  const xAxisG = plot.append('g').attr('transform', `translate(0,${innerH})`).attr('class', 'axis x-axis');
  const yAxisG = plot.append('g').attr('class', 'axis y-axis');

  plot.append('text').attr('class','y-label')
    .attr('x', -margin.left + 8)
    .attr('y', -10)
    .text('# of disasters');

  const legendWrap = d3.select('#legend-items');
  const hiddenTypes = new Set();

  function legendRender() {
    const items = legendWrap.selectAll('.legend-item').data(types, d => d);
    const enter = items.enter().append('label').attr('class','legend-item');

    enter.append('input')
      .attr('type', 'checkbox')
      .attr('checked', true)
      .on('change', (event, t) => {
        if (event.target.checked) hiddenTypes.delete(t); else hiddenTypes.add(t);
        update();
      });

    enter.append('div').attr('class','legend-swatch').style('background', t => color(t));
    enter.append('div').attr('class','legend-label')
      .text(d => d)
      .on('click', (event, t) => {
        const input = event.currentTarget.parentNode.querySelector('input[type="checkbox"]');
        input.checked = !input.checked;
        if (input.checked) hiddenTypes.delete(t); else hiddenTypes.add(t);
        update();
      });

    items.exit().remove();
  }
  legendRender();

  function getGeoData(geo) {
    const rows = disasters.filter(d => d.geo === geo && d.year >= YEAR_MIN && d.year <= YEAR_MAX);
    const years = Array.from(new Set(rows.map(d => d.year))).sort(d3.ascending);
    const byYear = d3.rollup(
      rows,
      arr => {
        const o = { year: arr[0].year };
        for (const t of types) o[t] = 0;
        for (const r of arr) o[r.type] += r.count;
        for (const t of hiddenTypes) o[t] = 0;
        o.total = d3.sum(types, t => o[t]);
        return o;
      },
      d => d.year
    );
    return years.map(y => byYear.get(y));
  }

  function getCo2Series(geo) {
    return co2
      .filter(r => r.geo === geo && r.year >= YEAR_MIN && r.year <= YEAR_MAX)
      .map(r => ({year:+r.year, val:+r.emissions_mt}))
      .sort((a,b) => d3.ascending(a.year, b.year));
  }

  function sparklineSVG(series, hoverYear) {
    const w = 180, h = 40, m = {t:6,r:4,b:6,l:4};
    if (!series.length) return '';
    const xS = d3.scaleLinear().domain(d3.extent(series, d => d.year)).range([m.l, w - m.r]);
    const yS = d3.scaleLinear().domain(d3.extent(series, d => d.val)).nice().range([h - m.b, m.t]);
    const line = d3.line().x(d => xS(d.year)).y(d => yS(d.val));
    const path = line(series);
    const hv = series.find(d => d.year === hoverYear);
    const circle = hv ? `<circle cx="${xS(hv.year)}" cy="${yS(hv.val)}" r="2.8" fill="#333"/>` : '';
    return `<svg class="sparkline" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <path d="${path}" fill="none" stroke="#6b7280" stroke-width="1.5"></path>
      ${circle}
    </svg>`;
  }

  function clearFocus() {
    plot.selectAll('.year-group').classed('dim', false);
    tooltip.style('opacity', 0);
  }

  function update() {
    const data = getGeoData(currentGeo);

    if (sortMode === 'asc') data.sort((a,b) => d3.ascending(a.total, b.total));
    else if (sortMode === 'desc') data.sort((a,b) => d3.descending(a.total, b.total));
    else data.sort((a,b) => d3.ascending(a.year, b.year));

    const years = data.map(d => d.year);
    x.domain(years);
    y.domain([0, d3.max(data, d => d.total) || 1]).nice();

    const stack = d3.stack().keys(types);
    const stacked = stack(data);

    const prevOrder = new Map(plot.selectAll('.year-group').data().map((d,i) => [d?.year, i]));

    const groups = plot.selectAll('.year-group').data(data, d => d.year);
    const groupsEnter = groups.enter().append('g')
      .attr('class', 'year-group')
      .attr('transform', d => `translate(${x(d.year)},0)`);

    groupsEnter.merge(groups)
      .transition()
      .duration(900)
      .delay(d => {
        const i0 = prevOrder.get(d.year) ?? 0;
        const i1 = years.indexOf(d.year);
        return Math.abs(i1 - i0) * 12;
      })
      .attr('transform', d => `translate(${x(d.year)},0)`);

    groups.exit().remove();

    const byType = new Map(stacked.map(s => [s.key, s]));

    groupsEnter.each(function(d) {
      const g = d3.select(this);
      g.selectAll('rect')
        .data(types.map(t => {
          const layer = byType.get(t);
          const idx = data.findIndex(r => r.year === d.year);
          return { key: t, year: d.year, seg: layer[idx] };
        }), r => r.key)
        .enter().append('rect')
        .attr('fill', r => color(r.key))
        .attr('x', 0)
        .attr('width', x.bandwidth())
        .attr('y', r => y(r.seg[1]))
        .attr('height', r => Math.max(0, y(r.seg[0]) - y(r.seg[1])));
    });

    plot.selectAll('.year-group').each(function(d) {
      const g = d3.select(this);
      const rects = g.selectAll('rect')
        .data(types.map(t => {
          const layer = byType.get(t);
          const idx = data.findIndex(r => r.year === d.year);
          return { key: t, year: d.year, seg: layer[idx] };
        }), r => r.key);

      rects.enter().append('rect')
        .attr('fill', r => color(r.key))
        .attr('x', 0)
        .attr('width', x.bandwidth())
        .attr('y', r => y(r.seg[1]))
        .attr('height', r => Math.max(0, y(r.seg[0]) - y(r.seg[1])))
        .merge(rects)
        .transition().duration(900)
        .attr('x', 0)
        .attr('width', x.bandwidth())
        .attr('y', r => y(r.seg[1]))
        .attr('height', r => Math.max(0, y(r.seg[0]) - y(r.seg[1])));

      rects.exit().remove();
    });

    // Hover highlight + tooltip
    const series = getCo2Series(currentGeo);
    const co2Map = new Map(series.map(d => [d.year, d.val]));

    plot.selectAll('.year-group')
      .on('mouseenter', function() {
        plot.selectAll('.year-group').classed('dim', true);
        d3.select(this).classed('dim', false);
      })
      .on('mousemove', function(event, d) {
        const cur = co2Map.get(d.year);
        const prev = co2Map.get(d.year - 1);
        const delta = (Number.isFinite(cur) && Number.isFinite(prev)) ? ((cur - prev) / prev) * 100 : null;
        const html = `<div><strong>${d.year} — ${currentGeo}</strong></div>
          <div>CO₂ (production): ${Number.isFinite(cur) ? cur.toFixed(1) + ' Mt' : 'N/A'}</div>
          <div>Total disasters: ${d.total}</div>
          ${Number.isFinite(delta) ? `<div class="delta">Δ vs prev: ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%</div>` : ''}
          <div class="sparkline-title">CO₂ (production) trend — ${currentGeo}</div>${sparklineSVG(series, d.year)}`;
        tooltip.html(html);
        const left = Math.max(8, Math.min(event.pageX + 14, window.innerWidth - 300));
        const top  = Math.max(8, Math.min(event.pageY + 14, window.innerHeight - 180));
        tooltip.style('left', left + 'px').style('top', top + 'px').style('opacity', 1);
      })
      .on('mouseleave', () => clearFocus());

    // Reset on background hover or when leaving the whole SVG
    hoverBG
      .on('mousemove', () => clearFocus())
      .on('mouseleave', () => clearFocus());

    svg.on('mouseleave', () => clearFocus());

    // Axes
    xAxisG.transition().duration(600).call(d3.axisBottom(x).tickValues(x.domain()));
    yAxisG.transition().duration(600).call(d3.axisLeft(y));

    d3.select('#sort-asc').classed('btn-on', sortMode === 'asc');
    d3.select('#sort-desc').classed('btn-on', sortMode === 'desc');
    d3.select('#sort-year').classed('btn-on', sortMode === 'year');
  }

  d3.select('#sort-asc').on('click', function() { sortMode = 'asc'; update(); });
  d3.select('#sort-desc').on('click', function() { sortMode = 'desc'; update(); });
  d3.select('#sort-year').on('click', function() { sortMode = 'year'; update(); });
  d3.select('#geo-select').on('change', function() { currentGeo = this.value; update(); });

  update();
})();