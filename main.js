/* CMIP6 latitude-band explorer. All chart values use the same averaging window */
"use strict";

const SCENARIOS = {
  ssp126: "SSP1-2.6 · Low emissions",
  ssp245: "SSP2-4.5 · Intermediate emissions",
  ssp585: "SSP5-8.5 · High emissions",
};
const CITIES = [
  { name: "Murmansk, Russia", short: "Murmansk", lat: 68.97, lon: 33.07 },
  { name: "London, UK", short: "London", lat: 51.51, lon: -0.13 },
  { name: "New York, USA", short: "New York", lat: 40.71, lon: -74.01 },
  { name: "San Diego, USA", short: "San Diego", lat: 32.72, lon: -117.16 },
  { name: "Singapore", short: "Singapore", lat: 1.35, lon: 103.82 },
  { name: "Sydney, Australia", short: "Sydney", lat: -33.87, lon: 151.21 },
];
const FIRST_COLOR = "#286b80";
const SECOND_COLOR = "#ae472e";
const element = (id) => document.getElementById(id);
const signed = (value) =>
  `${value > -0.05 ? "+" : "-"}${Math.abs(value).toFixed(1)} °C`;
const bandLabel = (latitude) =>
  `${Math.abs(latitude) - 2.5}-${Math.abs(latitude) + 2.5}°${latitude >= 0 ? "N" : "S"}`;
const bandFor = (latitude) =>
  Math.max(-87.5, Math.min(87.5, Math.floor((latitude + 90) / 5) * 5 - 87.5));

async function start() {
  try {
    if (!window.d3 || !window.topojson)
      throw new Error("The chart libraries could not load from the CDN.");
    const [rows, topology] = await Promise.all([
      d3.csv("data/cmip6_zonal_warming_ensmean.csv", d3.autoType),
      d3.json("data/land-110m.json"),
    ]);
    initialize(rows, topojson.feature(topology, topology.objects.land));
  } catch (error) {
    element("error").hidden = false;
    element("error").textContent =
      `The explorer could not load. Open this page through a local HTTP server or GitHub Pages and check that its data folder and the CDN links are available. ${error.message}`;
    element("window-label").textContent = "Projections unavailable";
  }
}

function initialize(rows, land) {
  const latitudes = Array.from(new Set(rows.map((row) => row.lat))).sort(
    d3.ascending,
  );
  const years = d3.range(2015, 2101);
  const data = d3.rollup(
    rows,
    (values) => values[0].warming,
    (row) => row.scenario,
    (row) => row.lat,
    (row) => row.year,
  );
  if (
    rows.length !== 9288 ||
    rows.some((row) => !Number.isFinite(row.warming))
  ) {
    throw new Error(
      "The projection table is incomplete or contains invalid values.",
    );
  }
  // Shorten the centered window at the record's boundaries instead of repeating years
  const average = (scenario, latitude, year) =>
    d3.mean(
      d3.range(Math.max(2015, year - 2), Math.min(2100, year + 2) + 1),
      (currentYear) => data.get(scenario).get(latitude).get(currentYear),
    );
  const areaWeights = latitudes.map((latitude) =>
    Math.cos((latitude * Math.PI) / 180),
  );
  const globalAverage = (scenario, year) =>
    d3.sum(
      latitudes,
      (latitude, index) =>
        average(scenario, latitude, year) * areaWeights[index],
    ) / d3.sum(areaWeights);
  const lateAverage = (scenario, latitude) =>
    d3.mean(d3.range(2081, 2101), (year) =>
      data.get(scenario).get(latitude).get(year),
    );
  const extrema = Object.fromEntries(
    Object.keys(SCENARIOS).map((scenario) => {
      const ranked = latitudes.toSorted(
        (a, b) => lateAverage(scenario, a) - lateAverage(scenario, b),
      );
      return [scenario, { slow: ranked[0], fast: ranked[ranked.length - 1] }];
    }),
  );
  const color = d3
    .scaleLinear()
    .domain([-1, 0, 2, 5, 10, 18])
    .range(["#709bb7", "#f1f2f0", "#f3ce65", "#ed923b", "#c84b34", "#702c35"])
    .clamp(true);
  let year = 2090;
  let selectedLatitude = bandFor(CITIES[3].lat);
  let selectedCity = CITIES[3];
  let timer = null;

  for (const id of ["scenario-left", "scenario-right"]) {
    for (const [value, label] of Object.entries(SCENARIOS))
      element(id).add(new Option(label, value));
  }
  element("scenario-left").value = "ssp126";
  element("scenario-right").value = "ssp585";
  element("city").add(new Option("Choose a city…", ""));
  CITIES.forEach((city, index) =>
    element("city").add(new Option(city.name, String(index))),
  );
  element("city").value = "3";
  latitudes
    .toReversed()
    .forEach((latitude) =>
      element("latitude").add(
        new Option(bandLabel(latitude), String(latitude)),
      ),
    );

  function selectLocation(latitude, city = null) {
    selectedLatitude = latitude;
    selectedCity = city;
    element("city").value = city ? String(CITIES.indexOf(city)) : "";
    draw();
  }

  const globalSeries = Object.keys(SCENARIOS).map((scenario, index) => ({
    scenario,
    label: ["Low emissions", "Intermediate", "High emissions"][index],
    color: [FIRST_COLOR, "#b58327", SECOND_COLOR][index],
    points: years.map((currentYear) => ({
      year: currentYear,
      value: globalAverage(scenario, currentYear),
    })),
  }));

  function drawGlobalChart() {
    const svg = d3.select("#global-trend");
    const width = Math.max(300, Math.min(690, svg.node().clientWidth));
    const height = 370;
    const x = d3
      .scaleLinear()
      .domain([2015, 2100])
      .range([42, width - 100]);
    const y = d3
      .scaleLinear()
      .domain([0, 6])
      .range([height - 40, 30]);
    svg.attr("viewBox", `0 0 ${width} ${height}`);
    svg.selectAll("*").remove();
    svg
      .append("text")
      .attr("class", "chart-title")
      .attr("x", 42)
      .attr("y", 15)
      .text("Global warming (°C)");
    svg
      .append("g")
      .attr("class", "chart-grid")
      .attr("transform", "translate(42,0)")
      .call(
        d3
          .axisLeft(y)
          .tickValues([0, 2, 4, 6])
          .tickSize(-(width - 142))
          .tickPadding(10),
      );
    svg
      .append("g")
      .attr("class", "axis")
      .attr("transform", `translate(0,${height - 40})`)
      .call(
        d3
          .axisBottom(x)
          .tickValues(
            width < 450 ? [2015, 2050, 2100] : [2015, 2040, 2070, 2100],
          )
          .tickFormat(d3.format("d")),
      );
    const envelope = d3
      .area()
      .x((point) => x(point.year))
      .y0((point, index) => y(globalSeries[0].points[index].value))
      .y1((point) => y(point.value));
    svg
      .append("path")
      .datum(globalSeries[2].points)
      .attr("d", envelope)
      .attr("fill", "#c4947a")
      .attr("fill-opacity", 0.1);
    const line = d3
      .line()
      .x((point) => x(point.year))
      .y((point) => y(point.value));
    for (const series of globalSeries) {
      svg
        .append("path")
        .datum(series.points)
        .attr("d", line)
        .attr("fill", "none")
        .attr("stroke", series.color)
        .attr("stroke-width", 2.5);
      const last = series.points[series.points.length - 1];
      svg
        .append("circle")
        .attr("cx", x(last.year))
        .attr("cy", y(last.value))
        .attr("r", 3)
        .attr("fill", series.color);
      const label = svg
        .append("text")
        .attr("class", "global-label")
        .attr("x", x(2100) + 9)
        .attr("y", y(last.value) - 4)
        .attr("fill", series.color);
      label.append("tspan").text(series.label);
      label
        .append("tspan")
        .attr("x", x(2100) + 9)
        .attr("dy", 17)
        .text(signed(last.value));
    }
    svg.attr(
      "aria-label",
      `Global average warming from 2015 to 2100. Endpoint averages for 2098-2100 are ${globalSeries.map((series) => series.label + " " + signed(series.points[85].value)).join(", ")}.`,
    );
  }

  const tooltip = d3
    .select("body")
    .append("div")
    .attr("class", "map-tooltip")
    .attr("role", "status")
    .style("display", "none");

  function makeMap(id) {
    const svg = d3.select(`#${id}`);
    let currentScenario = null;
    const projection = d3.geoEqualEarth().fitExtent(
      [
        [10, 12],
        [550, 287],
      ],
      { type: "Sphere" },
    );
    const path = d3.geoPath(projection);
    const clipId = `${id}-clip`;
    svg
      .append("defs")
      .append("clipPath")
      .attr("id", clipId)
      .append("path")
      .datum({ type: "Sphere" })
      .attr("d", path);
    const globe = svg.append("g").attr("clip-path", `url(#${clipId})`);
    // Equal Earth's projected y depends only on latitude, so clipped strips follow parallels exactly
    const bands = globe
      .selectAll("rect.band")
      .data(latitudes)
      .join("rect")
      .attr("class", "band")
      .attr("x", 0)
      .attr("width", 560)
      .attr("y", (latitude) => projection([0, latitude + 2.5])[1])
      .attr(
        "height",
        (latitude) =>
          projection([0, latitude - 2.5])[1] -
          projection([0, latitude + 2.5])[1] +
          0.15,
      );
    globe
      .append("path")
      .datum(d3.geoGraticule().step([60, 30])())
      .attr("d", path)
      .attr("fill", "none")
      .attr("stroke", "#ffffff")
      .attr("stroke-opacity", 0.35)
      .attr("stroke-width", 0.5);
    globe
      .append("path")
      .datum(land)
      .attr("d", path)
      .attr("fill", "none")
      .attr("stroke", "#344c50")
      .attr("stroke-opacity", 0.65)
      .attr("stroke-width", 0.7);
    const selection = globe
      .append("rect")
      .attr("x", 0)
      .attr("width", 560)
      .attr("fill", "#ffffff")
      .attr("fill-opacity", 0.13)
      .attr("stroke", "#19313a")
      .attr("stroke-width", 1.5);
    globe
      .append("rect")
      .attr("class", "map-hit")
      .attr("width", 560)
      .attr("height", 300)
      .attr("fill", "transparent")
      .on("click", (event) => {
        const coordinates = projection.invert(d3.pointer(event, svg.node()));
        if (coordinates && Number.isFinite(coordinates[1]))
          selectLocation(bandFor(coordinates[1]));
      })
      .on("mousemove", (event) => {
        const coordinates = projection.invert(d3.pointer(event, svg.node()));
        if (!coordinates || !Number.isFinite(coordinates[1])) {
          tooltip.style("display", "none");
          return;
        }
        const latitude = bandFor(coordinates[1]);
        const value = average(currentScenario, latitude, year);
        const difference = value - globalAverage(currentScenario, year);
        tooltip
          .style("display", "block")
          .style("left", `${event.clientX + 14}px`)
          .style("top", `${event.clientY + 14}px`)
          .html(
            `<strong>${bandLabel(latitude)}</strong>${signed(value)} in ${year}<br><span>${Math.abs(difference).toFixed(1)} °C ${difference >= 0 ? "above" : "below"} global average</span>`,
          );
      })
      .on("mouseleave", () => tooltip.style("display", "none"));
    const cities = svg
      .append("g")
      .selectAll("g")
      .data(CITIES)
      .join("g")
      .attr(
        "transform",
        (city) => `translate(${projection([city.lon, city.lat]).join(",")})`,
      )
      .style("cursor", "pointer")
      .on("click", (event, city) => {
        event.stopPropagation();
        selectLocation(bandFor(city.lat), city);
      });
    cities.append("circle").attr("r", 9).attr("fill", "transparent");
    const dots = cities
      .append("circle")
      .attr("r", 3)
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.2);
    cities
      .append("text")
      .attr("class", "city-label")
      .attr("x", (city) => (city.lon > 140 ? -7 : 7))
      .attr("y", -6)
      .attr("text-anchor", (city) => (city.lon > 140 ? "end" : "start"))
      .text((city) => city.short);
    cities
      .append("title")
      .text(
        (city) =>
          `${city.name}, ${bandLabel(bandFor(city.lat))}. Click to select.`,
      );
    svg
      .append("path")
      .datum({ type: "Sphere" })
      .attr("d", path)
      .attr("fill", "none")
      .attr("stroke", "#9eada5")
      .attr("pointer-events", "none");
    return (scenario) => {
      currentScenario = scenario;
      bands.attr("fill", (latitude) =>
        color(average(scenario, latitude, year)),
      );
      const top = projection([0, selectedLatitude + 2.5])[1];
      selection
        .attr("y", top)
        .attr("height", projection([0, selectedLatitude - 2.5])[1] - top);
      dots
        .attr("fill", (city) => (city === selectedCity ? "#19313a" : "#fff"))
        .attr("stroke", (city) => (city === selectedCity ? "#fff" : "#19313a"))
        .attr("r", (city) => (city === selectedCity ? 4.5 : 3));
      svg.attr(
        "aria-label",
        `${SCENARIOS[scenario]}, ${year}. Selected band ${bandLabel(selectedLatitude)}, warming ${signed(average(scenario, selectedLatitude, year))}. Use the city or latitude selector to change selection.`,
      );
    };
  }

  const drawLeftMap = makeMap("map-left");
  const drawRightMap = makeMap("map-right");
  const legend = d3.select("#legend");
  const gradient = legend
    .append("defs")
    .append("linearGradient")
    .attr("id", "warming-gradient");
  d3.range(0, 1.001, 0.02).forEach((position) =>
    gradient
      .append("stop")
      .attr("offset", `${position * 100}%`)
      .attr("stop-color", color(-1 + position * 19)),
  );
  legend
    .append("rect")
    .attr("x", 10)
    .attr("width", 400)
    .attr("height", 10)
    .attr("fill", "url(#warming-gradient)");
  legend
    .append("g")
    .attr("class", "axis")
    .attr("transform", "translate(0,10)")
    .call(
      d3
        .axisBottom(d3.scaleLinear().domain([-1, 18]).range([10, 410]))
        .tickValues([-1, 0, 5, 10, 18])
        .tickSize(4),
    );

  function makeChart(id, height) {
    const svg = d3.select(`#${id}`);
    const margin = { left: 64, right: 30, top: 35, bottom: 45 };
    const x = d3
      .scaleLinear()
      .domain([2015, 2100])
      .range([margin.left, 1100 - margin.right]);
    const y = d3.scaleLinear().range([height - margin.bottom, margin.top]);
    svg
      .append("text")
      .attr("class", "chart-title")
      .attr("x", margin.left)
      .attr("y", 17)
      .text("Warming relative to 1995-2014 (°C)");
    const axis = svg
      .append("g")
      .attr("class", "axis")
      .attr("transform", `translate(0,${height - margin.bottom})`);
    const grid = svg
      .append("g")
      .attr("class", "chart-grid")
      .attr("transform", `translate(${margin.left},0)`);
    const referencePath = svg
      .append("path")
      .attr("fill", "none")
      .attr("stroke", "#8f8580")
      .attr("stroke-width", 1.8)
      .attr("stroke-dasharray", "2 3");
    const firstPath = svg
      .append("path")
      .attr("fill", "none")
      .attr("stroke", FIRST_COLOR)
      .attr("stroke-width", 2.7);
    const secondPath = svg
      .append("path")
      .attr("fill", "none")
      .attr("stroke", SECOND_COLOR)
      .attr("stroke-width", 2.7)
      .attr("stroke-dasharray", "7 3");
    const marker = svg
      .append("line")
      .attr("y1", margin.top)
      .attr("y2", height - margin.bottom)
      .attr("stroke", "#637574")
      .attr("stroke-dasharray", "3 4");
    const firstDot = svg
      .append("circle")
      .attr("r", 4)
      .attr("fill", FIRST_COLOR)
      .attr("stroke", "#faf7f2")
      .attr("stroke-width", 1.5);
    const secondDot = svg
      .append("circle")
      .attr("r", 4)
      .attr("fill", SECOND_COLOR)
      .attr("stroke", "#faf7f2")
      .attr("stroke-width", 1.5);
    const line = d3
      .line()
      .x((point) => x(point.year))
      .y((point) => y(point.value));
    return (first, second, reference = []) => {
      const width = Math.max(320, Math.min(1100, svg.node().clientWidth));
      svg.attr("viewBox", `0 0 ${width} ${height}`);
      x.range([margin.left, width - margin.right]);
      axis.call(
        d3
          .axisBottom(x)
          .tickValues(
            width < 600
              ? [2015, 2050, 2100]
              : [2015, 2030, 2050, 2070, 2090, 2100],
          )
          .tickFormat(d3.format("d")),
      );
      const allPoints = [...first, ...second, ...reference];
      const minimum = Math.min(0, d3.min(allPoints, (point) => point.value));
      const maximum = Math.max(2, d3.max(allPoints, (point) => point.value));
      y.domain([
        minimum < 0 ? Math.floor(minimum) : 0,
        Math.ceil(maximum * 1.12),
      ]).nice();
      grid.call(
        d3
          .axisLeft(y)
          .ticks(5)
          .tickSize(-(width - margin.left - margin.right))
          .tickPadding(10),
      );
      referencePath
        .datum(reference)
        .attr("d", reference.length ? line : null);
      firstPath.datum(first).attr("d", line);
      secondPath.datum(second).attr("d", line);
      marker.attr("x1", x(year)).attr("x2", x(year));
      firstDot.attr("cx", x(year)).attr("cy", y(first[year - 2015].value));
      secondDot.attr("cx", x(year)).attr("cy", y(second[year - 2015].value));
    };
  }

  const drawTrend = makeChart("trend", 350);
  const drawGap = makeChart("gap", 320);
  const series = (scenario, latitude) =>
    years.map((currentYear) => ({
      year: currentYear,
      value: average(scenario, latitude, currentYear),
    }));

  function draw() {
    const scenarios = [
      element("scenario-left").value,
      element("scenario-right").value,
    ];
    const values = scenarios.map((scenario) =>
      average(scenario, selectedLatitude, year),
    );
    element("north-insight").textContent =
      `Under ${SCENARIOS[scenarios[1]]}, the 85-90°N band warms by ${signed(average(scenarios[1], 87.5, year))} in ${Math.max(2015, year - 2)}-${Math.min(2100, year + 2)}. Compare its color with the rest of the map.`;
    element("south-insight").textContent =
      `In the same scenario and time window, the 55-60°S band warms by ${signed(average(scenarios[1], -57.5, year))}. The global average combines these different experiences.`;
    element("year-label").value = year;
    element("year-slider").value = year;
    element("window-label").textContent =
      `${Math.max(2015, year - 2)}-${Math.min(2100, year + 2)} average`;
    element("latitude").value = selectedLatitude;
    element("location-name").textContent = selectedCity
      ? selectedCity.name
      : bandLabel(selectedLatitude);
    scenarios.forEach((scenario, index) => {
      const side = index === 0 ? "left" : "right";
      const global = globalAverage(scenario, year);
      const difference = values[index] - global;
      element(`global-${side}`).textContent = signed(global);
      element(`selected-label-${side}`).textContent = SCENARIOS[scenario];
      element(`selected-${side}`).textContent = signed(values[index]);
      element(`relative-${side}`).textContent =
        Math.abs(difference) < 0.05
          ? "Within 0.1 °C of the global average"
          : `${Math.abs(difference).toFixed(1)} °C ${difference >= 0 ? "above" : "below"} the global average`;
    });
    const comparison =
      Math.abs(values[1] - values[0]) < 0.05
        ? "The two futures are within 0.1 °C of each other in this time window."
        : `The second future projects ${Math.abs(values[1] - values[0]).toFixed(1)} °C ${values[1] >= values[0] ? "more" : "less"} band-average warming than the first in this time window.`;
    element("selection-summary").textContent =
      `${selectedCity ? selectedCity.name + " lies in the " : "Selected "}${bandLabel(selectedLatitude)} band. ${comparison}`;
    element("trend-heading").textContent =
      `Follow ${selectedCity ? selectedCity.short + "'s latitude band" : "the " + bandLabel(selectedLatitude) + " band"} through the century`;
    d3.select("#trend-key")
      .selectAll("span")
      .data([...scenarios, "reference"])
      .join("span")
      .attr("class", (scenario, index) =>
        index === 2
          ? "line-swatch reference-line"
          : `line-swatch ${index === 0 ? "first-line" : "second-line"}`,
      )
      .text((scenario, index) =>
        index === 2
          ? `Global average · ${SCENARIOS[scenarios[1]].split(" · ")[0]}`
          : SCENARIOS[scenario],
      );
    drawLeftMap(scenarios[0]);
    drawRightMap(scenarios[1]);
    drawTrend(
      series(scenarios[0], selectedLatitude),
      series(scenarios[1], selectedLatitude),
      globalSeries.find((entry) => entry.scenario === scenarios[1]).points,
    );
    const { fast, slow } = extrema[scenarios[1]];
    element("gap-explanation").textContent =
      `Under ${SCENARIOS[scenarios[1]]}, the ${bandLabel(fast)} band has the most warming and the ${bandLabel(slow)} band has the least, ranked by their 2081-2100 averages. These two bands remain fixed as you move through time. Their difference in the current window is ${(average(scenarios[1], fast, year) - average(scenarios[1], slow, year)).toFixed(1)} °C.`;
    drawGap(series(scenarios[1], fast), series(scenarios[1], slow));
    d3.select("#trend").attr(
      "aria-label",
      `${bandLabel(selectedLatitude)} warming from 2015 to 2100. In the current window, ${SCENARIOS[scenarios[0]]}: ${signed(values[0])}; ${SCENARIOS[scenarios[1]]}: ${signed(values[1])}.`,
    );
  }

  function stopPlayback() {
    clearInterval(timer);
    timer = null;
    element("play").textContent = "Play";
    element("play").setAttribute("aria-pressed", "false");
  }
  element("play").setAttribute("aria-pressed", "false");
  element("play").addEventListener("click", () => {
    if (timer !== null) {
      stopPlayback();
      return;
    }
    if (year === 2100) year = 2015;
    element("play").textContent = "Pause";
    element("play").setAttribute("aria-pressed", "true");
    draw();
    timer = setInterval(() => {
      year += 1;
      draw();
      if (year >= 2100) stopPlayback();
    }, 250);
  });
  element("year-slider").addEventListener("input", (event) => {
    stopPlayback();
    year = Number(event.target.value);
    draw();
  });
  ["scenario-left", "scenario-right"].forEach((id) =>
    element(id).addEventListener("change", draw),
  );
  element("city").addEventListener("change", (event) => {
    if (event.target.value === "") return;
    const city = CITIES[Number(event.target.value)];
    selectLocation(bandFor(city.lat), city);
  });
  element("latitude").addEventListener("change", (event) =>
    selectLocation(Number(event.target.value)),
  );
  element("north-focus").addEventListener("click", () => selectLocation(87.5));
  element("south-focus").addEventListener("click", () => selectLocation(-57.5));
  element("fastest").addEventListener("click", () =>
    selectLocation(extrema[element("scenario-right").value].fast),
  );
  element("slowest").addEventListener("click", () =>
    selectLocation(extrema[element("scenario-right").value].slow),
  );
  element("tropics").addEventListener("click", () =>
    selectLocation(2.5, CITIES[4]),
  );
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopPlayback();
  });
  window.addEventListener("pagehide", stopPlayback);
  window.addEventListener("resize", () => {
    drawGlobalChart();
    draw();
  });
  element("gap-details").addEventListener("toggle", draw);
  drawGlobalChart();
  draw();
  document
    .querySelectorAll("button:disabled, select:disabled, input:disabled")
    .forEach((control) => {
      control.disabled = false;
    });
}

start();
