const svg = d3.select("svg"),
      margin = {top: 50, right: 20, bottom: 60, left: 70},
      width = +svg.attr("width") - margin.left - margin.right,
      height = +svg.attr("height") - margin.top - margin.bottom;

const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

const x = d3.scaleLinear().range([0, width]);
const y = d3.scaleLinear().range([height, 0]);
const color = d3.scaleOrdinal(d3.schemeCategory10);

const xAxisG = g.append("g").attr("transform", `translate(0,${height})`);
const yAxisG = g.append("g");

g.append("text")
  .attr("class", "axis-label")
  .attr("x", width / 2).attr("y", height + 45)
  .attr("text-anchor", "middle")
  .text("Year");

g.append("text")
  .attr("class", "axis-label")
  .attr("x", -height / 2).attr("y", -50)
  .attr("transform", "rotate(-90)")
  .attr("text-anchor", "middle")
  .text("Emissions (Million metric tons CO2e)");

d3.csv("ghg_emissions.csv").then(data => {
  data.forEach(d => {
    d.Year = +d.Year;
    d.Emissions = +d.Emissions;
  });

  const countries = Array.from(new Set(data.map(d => d.Country))).sort();
  const industries = Array.from(new Set(data.map(d => d.Industry)));
  color.domain(industries);

  // Country list checkboxes
  const countryList = d3.select(".country-list");
  let selectedCountries = new Set(countries);

  function renderCountryList() {
    const items = countryList.selectAll("label")
        .data(countries, d => d);

    const itemsEnter = items.enter()
      .append("label");
      

    itemsEnter.append("input")
      .attr("type", "checkbox")
      .attr("checked", true)
      .on("change", function(event, d) {
        if (this.checked) {
          selectedCountries.add(d);
        } else {
          selectedCountries.delete(d);
        }
        update();
      });

    itemsEnter.append("span").text(d => d);

    items.exit().remove();
  }

  renderCountryList();

  // Industry legend
  const legend = d3.select(".legend");
  let visibleIndustries = new Set(industries);

  function renderLegend() {
    legend.selectAll("li")
      .data(industries)
      .join("li")
      .classed("selected", d => visibleIndustries.has(d))
      .html(d => `<span class="swatch" style="background-color:${color(d)}"></span> ${d}`)
      .on("click", (event, d) => {
        if (visibleIndustries.has(d)) {
          visibleIndustries.delete(d);
        } else {
          visibleIndustries.add(d);
        }
        renderLegend();
        update();
      });
  }

  renderLegend();

  function update() {
    const filtered = data.filter(d => selectedCountries.has(d.Country) && visibleIndustries.has(d.Industry));

    if (!filtered.length) {
      g.selectAll(".line").remove();
      return;
    }

    const nested = d3.groups(filtered, d => d.Country, d => d.Industry);

    const years = filtered.map(d => d.Year);
    const emissions = filtered.map(d => d.Emissions);

    x.domain(d3.extent(years));
    y.domain([0, d3.max(emissions) || 1]);

    xAxisG.transition().duration(500).call(d3.axisBottom(x).tickFormat(d3.format("d")));
    yAxisG.transition().duration(500).call(d3.axisLeft(y));

    const lineGenerator = d3.line()
      .x(d => x(d.Year))
      .y(d => y(d.Emissions))
      .defined(d => !isNaN(d.Emissions));

    const lines = g.selectAll(".line")
      .data(nested.flatMap(([country, industries]) =>
        industries.map(([industry, values]) => {
          values.sort((a, b) => a.Year - b.Year);
          return { country, industry, values };
        })
      ), d => d.country + "_" + d.industry);

    lines.exit().remove();

    const linesEnter = lines.enter().append("path")
      .attr("class", "line")
      .style("fill", "none")
      .style("stroke-width", 2.5);

    linesEnter.merge(lines)
      .transition()
      .attr("stroke", d => color(d.industry))
      .attr("d", d => lineGenerator(d.values));
  }

  update();
});
