(() => {
  "use strict";

  const DEFAULTS = {
    factor: 1.55,
    weeklyHours: 42,
    annualIncrease: 6,
    workDaysMonth: 21.67,
  };

  const WEEKS_PER_MONTH = 4.33;

  let settings = { ...DEFAULTS };
  let people = [];
  let personIdCounter = 0;

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const peopleList = $("#peopleList");
  const kpiGrid = $("#kpiGrid");
  const personRowTemplate = $("#personRowTemplate");

  const fmtMoney = (n) => {
    if (!isFinite(n)) n = 0;
    return "$" + Math.round(n).toLocaleString("es-CO");
  };

  const fmtHours = (n) => {
    if (!isFinite(n)) n = 0;
    return n.toLocaleString("es-CO", { maximumFractionDigits: 1 });
  };

  // ---------- People management ----------

  function addPerson(prefill) {
    personIdCounter += 1;
    const id = personIdCounter;
    const data = prefill || { name: `Persona ${people.length + 1}`, salary: 0, hours: 0, unit: "day" };
    people.push({ id, ...data });
    renderPeople();
    recalculate();
  }

  function removePerson(id) {
    people = people.filter((p) => p.id !== id);
    renderPeople();
    recalculate();
  }

  function renderPeople() {
    peopleList.innerHTML = "";
    if (people.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "Aún no has agregado personas a este proceso.";
      peopleList.appendChild(empty);
      return;
    }

    people.forEach((person) => {
      const node = personRowTemplate.content.firstElementChild.cloneNode(true);
      node.dataset.id = person.id;

      const nameInput = node.querySelector(".person-name");
      const salaryInput = node.querySelector(".person-salary");
      const hoursInput = node.querySelector(".person-hours");
      const unitSelect = node.querySelector(".person-hours-unit");
      const removeBtn = node.querySelector(".remove-person");

      nameInput.value = person.name;
      salaryInput.value = person.salary;
      hoursInput.value = person.hours;
      unitSelect.value = person.unit;

      nameInput.addEventListener("input", () => {
        person.name = nameInput.value;
      });
      salaryInput.addEventListener("input", () => {
        person.salary = parseFloat(salaryInput.value) || 0;
        recalculate();
      });
      hoursInput.addEventListener("input", () => {
        person.hours = parseFloat(hoursInput.value) || 0;
        recalculate();
      });
      unitSelect.addEventListener("change", () => {
        person.unit = unitSelect.value;
        recalculate();
      });
      removeBtn.addEventListener("click", () => removePerson(person.id));

      peopleList.appendChild(node);
    });
  }

  // ---------- Core calculations ----------

  function computePerson(person) {
    const monthlyCompanyCost = person.salary * settings.factor;
    const monthlyLegalHours = settings.weeklyHours * WEEKS_PER_MONTH;
    const hourlyValue = monthlyLegalHours > 0 ? monthlyCompanyCost / monthlyLegalHours : 0;

    let monthlyProcessHours = 0;
    if (person.unit === "day") {
      monthlyProcessHours = person.hours * settings.workDaysMonth;
    } else {
      monthlyProcessHours = person.hours * WEEKS_PER_MONTH;
    }

    const monthlyProcessCost = hourlyValue * monthlyProcessHours;
    const timeInvestedPct = monthlyLegalHours > 0 ? (monthlyProcessHours / monthlyLegalHours) * 100 : 0;

    return { monthlyCompanyCost, hourlyValue, monthlyProcessHours, monthlyProcessCost, timeInvestedPct };
  }

  function computeTotals() {
    let totalMonthlyProcessCost = 0;
    let totalMonthlyProcessHours = 0;

    const perPersonResults = people.map((person) => {
      const r = computePerson(person);
      totalMonthlyProcessCost += r.monthlyProcessCost;
      totalMonthlyProcessHours += r.monthlyProcessHours;
      return { person, ...r };
    });

    const years = parseInt($("#projectionYears").value, 10) || 1;
    const solutionMonthlyCost = parseFloat($("#solutionCost").value) || 0;
    const executionMonths = parseInt($("#executionMonths").value, 10) || 1;

    const annualIncreaseRate = settings.annualIncrease / 100;
    const monthlyGrowthRate = Math.pow(1 + annualIncreaseRate, 1 / 12) - 1;

    const totalMonths = years * 12;
    const monthlyProcessCostSeries = [];
    const monthlySolutionCostSeries = [];
    for (let m = 0; m < totalMonths; m++) {
      const processCostThisMonth = totalMonthlyProcessCost * Math.pow(1 + monthlyGrowthRate, m);
      monthlyProcessCostSeries.push(processCostThisMonth);
      // La solución solo genera costo durante sus meses de ejecución (inversión de implementación);
      // después de eso no se repite más.
      monthlySolutionCostSeries.push(m < executionMonths ? solutionMonthlyCost : 0);
    }

    const cumulativeProcessCostSeries = [];
    const cumulativeSolutionCostSeries = [];
    let runningProcess = 0;
    let runningSolution = 0;
    for (let m = 0; m < totalMonths; m++) {
      runningProcess += monthlyProcessCostSeries[m];
      runningSolution += monthlySolutionCostSeries[m];
      cumulativeProcessCostSeries.push(runningProcess);
      cumulativeSolutionCostSeries.push(runningSolution);
    }

    const totalAnnualProcessCostYear1 = cumulativeProcessCostSeries[Math.min(11, totalMonths - 1)] || 0;
    const totalAnnualHours = totalMonthlyProcessHours * 12;
    const totalSolutionInvestment = executionMonths * solutionMonthlyCost;

    // % total de tiempo laboral (de todas las personas) dedicado al proceso
    const monthlyLegalHours = settings.weeklyHours * WEEKS_PER_MONTH;
    const totalAvailableHours = monthlyLegalHours * people.length;
    const totalTimeInvestedPct = totalAvailableHours > 0 ? (totalMonthlyProcessHours / totalAvailableHours) * 100 : 0;

    // KPIs de la solución (calculados sobre el año 1, después de la gráfica comparativa)
    const annualSavingsWithSolution = totalAnnualProcessCostYear1 - totalSolutionInvestment;
    const annualSavingsPct = totalAnnualProcessCostYear1 > 0 ? (annualSavingsWithSolution / totalAnnualProcessCostYear1) * 100 : 0;
    const monthlySavingsPostImplementation = totalMonthlyProcessCost;

    // Payback: primer mes en que el gasto acumulado del proceso supera la inversión total de la solución
    let paybackMonths = null;
    if (solutionMonthlyCost > 0 && totalSolutionInvestment > 0) {
      const idx = cumulativeProcessCostSeries.findIndex((v) => v >= totalSolutionInvestment);
      if (idx === -1) {
        paybackMonths = null;
      } else {
        const prevCum = idx === 0 ? 0 : cumulativeProcessCostSeries[idx - 1];
        const monthCost = monthlyProcessCostSeries[idx];
        const fraction = monthCost > 0 ? (totalSolutionInvestment - prevCum) / monthCost : 0;
        paybackMonths = idx + fraction;
      }
    }

    return {
      perPersonResults,
      totalMonthlyProcessCost,
      totalMonthlyProcessHours,
      years,
      totalMonths,
      solutionMonthlyCost,
      executionMonths,
      monthlyProcessCostSeries,
      monthlySolutionCostSeries,
      cumulativeProcessCostSeries,
      cumulativeSolutionCostSeries,
      totalAnnualProcessCostYear1,
      totalAnnualHours,
      totalTimeInvestedPct,
      totalSolutionInvestment,
      annualSavingsWithSolution,
      annualSavingsPct,
      monthlySavingsPostImplementation,
      paybackMonths,
    };
  }

  // ---------- Rendering: per-person mini results ----------

  function renderPersonResults(perPersonResults) {
    perPersonResults.forEach(({ person, monthlyCompanyCost, monthlyProcessHours, timeInvestedPct }) => {
      const row = peopleList.querySelector(`.person-row[data-id="${person.id}"]`);
      if (!row) return;
      row.querySelector(".res-monthly-cost").textContent = fmtMoney(monthlyCompanyCost);
      row.querySelector(".res-monthly-hours").textContent = fmtHours(monthlyProcessHours);
      row.querySelector(".res-time-pct").textContent = fmtHours(timeInvestedPct) + "%";
    });
  }

  // ---------- KPI cards ----------

  function renderKPIs(totals) {
    const { totalAnnualProcessCostYear1, totalAnnualHours, totalMonthlyProcessCost, totalTimeInvestedPct } = totals;

    const cards = [
      {
        label: "Costo anual del proceso",
        value: fmtMoney(totalAnnualProcessCostYear1),
        cls: "neutral",
        sub: "Costo total año 1",
      },
      {
        label: "Horas invertidas al año",
        value: fmtHours(totalAnnualHours) + " h",
        cls: "neutral",
        sub: fmtHours(totalAnnualHours / 12) + " h/mes",
      },
      {
        label: "Costo mensual del proceso",
        value: fmtMoney(totalMonthlyProcessCost),
        cls: "neutral",
        sub: "Todas las personas incluidas",
      },
      {
        label: "Porcentaje total de tiempo dedicada al proceso",
        value: fmtHours(totalTimeInvestedPct) + "%",
        cls: "neutral",
        sub: "Sobre el tiempo laboral de todas las personas",
      },
    ];

    kpiGrid.innerHTML = "";
    cards.forEach((c) => {
      const el = document.createElement("div");
      el.className = "kpi-card";
      el.innerHTML = `
        <div class="kpi-label">${c.label}</div>
        <div class="kpi-value ${c.cls}">${c.value}</div>
        <div class="kpi-sub">${c.sub}</div>
      `;
      kpiGrid.appendChild(el);
    });
  }

  function renderSolutionKPIs(totals) {
    const solutionGrid = $("#kpiGridSolution");
    const {
      totalSolutionInvestment,
      annualSavingsWithSolution,
      annualSavingsPct,
      monthlySavingsPostImplementation,
      paybackMonths,
      solutionMonthlyCost,
      executionMonths,
    } = totals;

    const hasSolution = solutionMonthlyCost > 0;

    const cards = [
      {
        label: "Inversión total en la solución",
        value: fmtMoney(totalSolutionInvestment),
        cls: "neutral",
        sub: `${executionMonths} ${executionMonths === 1 ? "mes" : "meses"} de implementación`,
      },
      {
        label: "Ahorro anual con la solución",
        value: hasSolution ? fmtMoney(annualSavingsWithSolution) : "—",
        cls: annualSavingsWithSolution >= 0 ? "positive" : "negative",
        sub: hasSolution
          ? "Costo anual del proceso vs. inversión total en la solución"
          : "Ingresa el costo de la solución",
      },
      {
        label: "Porcentaje ahorro anual con la solución",
        value: hasSolution ? fmtHours(annualSavingsPct) + "%" : "—",
        cls: annualSavingsPct >= 0 ? "positive" : "negative",
        sub: hasSolution
          ? "Ahorro anual como % del costo anual del proceso"
          : "Ingresa el costo de la solución",
      },
      {
        label: "Ahorro mensual (post-implementación)",
        value: hasSolution ? fmtMoney(monthlySavingsPostImplementation) : "—",
        cls: "positive",
        sub: hasSolution
          ? "Se deja de pagar el costo del proceso una vez la solución está operando"
          : "Ingresa el costo de la solución",
      },
      {
        label: "Retorno de inversión (payback)",
        value: paybackMonths ? fmtHours(paybackMonths) + " meses" : "—",
        cls: "neutral",
        sub: paybackMonths
          ? "Mes en que el gasto del proceso supera la inversión en la solución"
          : "No aplica con los datos actuales",
      },
    ];

    solutionGrid.innerHTML = "";
    cards.forEach((c) => {
      const el = document.createElement("div");
      el.className = "kpi-card";
      el.innerHTML = `
        <div class="kpi-label">${c.label}</div>
        <div class="kpi-value ${c.cls}">${c.value}</div>
        <div class="kpi-sub">${c.sub}</div>
      `;
      solutionGrid.appendChild(el);
    });
  }

  // ---------- Charts (hand-drawn SVG, no dependencies) ----------

  const SVG_NS = "http://www.w3.org/2000/svg";

  function clearSvg(svg) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
  }

  function svgEl(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs || {}).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
  }

  function monthLabel(i) {
    // i is 0-based month index; label every 12 months as year marks, else "Mes N"
    const monthNumber = i + 1;
    if (monthNumber % 12 === 0) return "Año " + (monthNumber / 12);
    return "Mes " + monthNumber;
  }

  function drawAxes(svg, padL, padR, padT, padB, W, chartW, chartH, maxVal) {
    const gridCount = 4;
    for (let i = 0; i <= gridCount; i++) {
      const y = padT + (chartH * i) / gridCount;
      const val = maxVal - (maxVal * i) / gridCount;
      svg.appendChild(svgEl("line", {
        x1: padL, x2: W - padR, y1: y, y2: y,
        stroke: "#263257", "stroke-width": 1,
      }));
      const label = svgEl("text", {
        x: padL - 8, y: y + 4, "text-anchor": "end",
        fill: "#93a0c2", "font-size": 10,
      });
      label.textContent = shortMoney(val);
      svg.appendChild(label);
    }
  }

  function xTicksForMonths(totalMonths) {
    // always include month 1, then every year boundary
    const ticks = [0];
    for (let m = 12; m <= totalMonths; m += 12) ticks.push(m - 1);
    return ticks;
  }

  function renderProjectionChart(totals) {
    const svg = $("#chartProjection");
    clearSvg(svg);

    const W = 600, H = 300;
    const padL = 60, padR = 20, padT = 30, padB = 40;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;

    const data = totals.cumulativeProcessCostSeries;
    const n = data.length;
    const maxVal = Math.max(...data, 1) * 1.15;

    drawAxes(svg, padL, padR, padT, padB, W, chartW, chartH, maxVal);

    const points = data.map((val, i) => {
      const x = padL + (n === 1 ? chartW / 2 : (chartW * i) / (n - 1));
      const y = padT + chartH - (chartH * val) / maxVal;
      return [x, y];
    });

    // area path
    let areaPath = `M ${points[0][0]} ${padT + chartH} `;
    points.forEach(([x, y]) => (areaPath += `L ${x} ${y} `));
    areaPath += `L ${points[n - 1][0]} ${padT + chartH} Z`;
    svg.appendChild(svgEl("path", {
      d: areaPath, fill: "url(#gradArea)", opacity: 0.35,
    }));

    const defs = svgEl("defs", {});
    const grad = svgEl("linearGradient", { id: "gradArea", x1: 0, y1: 0, x2: 0, y2: 1 });
    grad.appendChild(svgEl("stop", { offset: "0%", "stop-color": "#6ee7b7" }));
    grad.appendChild(svgEl("stop", { offset: "100%", "stop-color": "#6ee7b7", "stop-opacity": 0 }));
    defs.appendChild(grad);
    svg.insertBefore(defs, svg.firstChild);

    // line path
    let linePath = `M ${points[0][0]} ${points[0][1]} `;
    points.forEach(([x, y]) => (linePath += `L ${x} ${y} `));
    svg.appendChild(svgEl("path", {
      d: linePath, fill: "none", stroke: "#6ee7b7", "stroke-width": 2.5,
      "stroke-linecap": "round", "stroke-linejoin": "round",
    }));

    // ticks: month 1 and each year boundary get a dot, label and value
    const tickIndices = xTicksForMonths(n);
    tickIndices.forEach((i) => {
      const [x, y] = points[i];
      svg.appendChild(svgEl("circle", { cx: x, cy: y, r: 4, fill: "#6ee7b7" }));

      const valLabel = svgEl("text", {
        x, y: y - 10, "text-anchor": "middle", fill: "#e8ecf7", "font-size": 11, "font-weight": 600,
      });
      valLabel.textContent = shortMoney(data[i]);
      svg.appendChild(valLabel);

      const xLabel = svgEl("text", {
        x, y: padT + chartH + 20, "text-anchor": "middle", fill: "#93a0c2", "font-size": 11,
      });
      xLabel.textContent = monthLabel(i);
      svg.appendChild(xLabel);
    });
  }

  function renderCompareChart(totals) {
    const svg = $("#chartCompare");
    clearSvg(svg);

    const W = 600, H = 300;
    const padL = 60, padR = 108, padT = 30, padB = 40;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;

    const processData = totals.cumulativeProcessCostSeries;
    const solutionData = totals.cumulativeSolutionCostSeries;
    const n = processData.length;
    const maxVal = Math.max(...processData, ...solutionData, 1) * 1.15;

    drawAxes(svg, padL, padR, padT, padB, W, chartW, chartH, maxVal);

    const xFor = (i) => padL + (n === 1 ? chartW / 2 : (chartW * i) / (n - 1));
    const yFor = (val) => padT + chartH - (chartH * val) / maxVal;

    const processPoints = processData.map((val, i) => [xFor(i), yFor(val)]);
    const solutionPoints = solutionData.map((val, i) => [xFor(i), yFor(val)]);

    const buildLinePath = (points) => {
      let d = `M ${points[0][0]} ${points[0][1]} `;
      points.forEach(([x, y]) => (d += `L ${x} ${y} `));
      return d;
    };

    svg.appendChild(svgEl("path", {
      d: buildLinePath(solutionPoints), fill: "none", stroke: "#60a5fa", "stroke-width": 2.5,
      "stroke-linecap": "round", "stroke-linejoin": "round",
    }));
    svg.appendChild(svgEl("path", {
      d: buildLinePath(processPoints), fill: "none", stroke: "#f87171", "stroke-width": 2.5,
      "stroke-linecap": "round", "stroke-linejoin": "round",
    }));

    const tickIndices = xTicksForMonths(n);
    tickIndices.forEach((i) => {
      svg.appendChild(svgEl("circle", { cx: processPoints[i][0], cy: processPoints[i][1], r: 4, fill: "#f87171" }));
      svg.appendChild(svgEl("circle", { cx: solutionPoints[i][0], cy: solutionPoints[i][1], r: 4, fill: "#60a5fa" }));

      const xLabel = svgEl("text", {
        x: xFor(i), y: padT + chartH + 20, "text-anchor": "middle", fill: "#93a0c2", "font-size": 11,
      });
      xLabel.textContent = monthLabel(i);
      svg.appendChild(xLabel);
    });

    // legend
    const legendY = 12;
    svg.appendChild(svgEl("rect", { x: padL, y: legendY, width: 10, height: 10, fill: "#f87171", rx: 2 }));
    const l1 = svgEl("text", { x: padL + 16, y: legendY + 9, fill: "#93a0c2", "font-size": 11 });
    l1.textContent = "Costo del proceso";
    svg.appendChild(l1);

    svg.appendChild(svgEl("rect", { x: padL + 140, y: legendY, width: 10, height: 10, fill: "#60a5fa", rx: 2 }));
    const l2 = svgEl("text", { x: padL + 156, y: legendY + 9, fill: "#93a0c2", "font-size": 11 });
    l2.textContent = "Costo de la solución";
    svg.appendChild(l2);

    // GAP al final de la proyección: línea punteada uniendo ambas curvas + ahorro en $ y %
    const lastIdx = n - 1;
    const xLast = xFor(lastIdx);
    const processYLast = processPoints[lastIdx][1];
    const solutionYLast = solutionPoints[lastIdx][1];
    const gapValue = processData[lastIdx] - solutionData[lastIdx];
    const gapPct = processData[lastIdx] > 0 ? (gapValue / processData[lastIdx]) * 100 : 0;

    if (Math.abs(processYLast - solutionYLast) > 1) {
      svg.appendChild(svgEl("line", {
        x1: xLast, x2: xLast, y1: processYLast, y2: solutionYLast,
        stroke: "#93a0c2", "stroke-width": 1.5, "stroke-dasharray": "4,4",
      }));
    }

    const gapMidY = Math.min(Math.max((processYLast + solutionYLast) / 2, padT + 22), padT + chartH - 8);
    const gapLabelX = xLast + 10;

    const gapTitle = svgEl("text", {
      x: gapLabelX, y: gapMidY - 6, fill: "#e8ecf7", "font-size": 11, "font-weight": 700,
    });
    gapTitle.textContent = "GAP: " + shortMoney(gapValue);
    svg.appendChild(gapTitle);

    const gapSub = svgEl("text", {
      x: gapLabelX, y: gapMidY + 9, fill: "#6ee7b7", "font-size": 10.5, "font-weight": 600,
    });
    gapSub.textContent = fmtHours(gapPct) + "% ahorro";
    svg.appendChild(gapSub);
  }

  function shortMoney(n) {
    if (!isFinite(n)) n = 0;
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return "$" + (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
    if (abs >= 1_000) return "$" + (n / 1_000).toFixed(0) + "K";
    return "$" + Math.round(n);
  }

  // ---------- Notes ----------

  function renderNotes(totals) {
    $("#noteIncrement").textContent =
      `Inversión acumulada mes a mes. Incremento anual presupuestado: ${settings.annualIncrease}%. Proyección a ${totals.years} ` +
      (totals.years === 1 ? "año" : "años") +
      `, factor prestacional ${settings.factor}x sobre ${settings.weeklyHours}h/semana legales.`;

    $("#noteCompare").textContent =
      totals.solutionMonthlyCost > 0
        ? `La solución acumula su costo solo durante los primeros ${totals.executionMonths} ${totals.executionMonths === 1 ? "mes" : "meses"} (implementación) y luego se mantiene plana en ${fmtMoney(totals.totalSolutionInvestment)}, mientras el costo del proceso sigue creciendo.`
        : "Ingresa el costo mensual de la solución arriba para ver el comparativo acumulado.";
  }

  // ---------- Main recalculation ----------

  function recalculate() {
    const totals = computeTotals();
    renderPersonResults(totals.perPersonResults);
    renderKPIs(totals);
    renderProjectionChart(totals);
    renderCompareChart(totals);
    renderSolutionKPIs(totals);
    renderNotes(totals);
  }

  // ---------- Settings modal ----------

  function openSettings() {
    $("#cfgFactor").value = settings.factor;
    $("#cfgWeeklyHours").value = settings.weeklyHours;
    $("#cfgAnnualIncrease").value = settings.annualIncrease;
    $("#cfgWorkDaysMonth").value = settings.workDaysMonth;
    $("#settingsModal").classList.remove("hidden");
  }

  function closeSettings() {
    $("#settingsModal").classList.add("hidden");
  }

  function applySettings() {
    settings.factor = parseFloat($("#cfgFactor").value) || DEFAULTS.factor;
    settings.weeklyHours = parseFloat($("#cfgWeeklyHours").value) || DEFAULTS.weeklyHours;
    settings.annualIncrease = parseFloat($("#cfgAnnualIncrease").value) || 0;
    settings.workDaysMonth = parseFloat($("#cfgWorkDaysMonth").value) || DEFAULTS.workDaysMonth;
    closeSettings();
    recalculate();
  }

  function resetDefaults() {
    settings = { ...DEFAULTS };
    openSettings();
  }

  // ---------- Reporte PDF ----------

  function generatePDF() {
    const processName = $("#processName").value || "Proceso sin nombre";
    const today = new Date().toLocaleDateString("es-CO", { year: "numeric", month: "long", day: "numeric" });
    $("#printMeta").textContent = `Proceso: ${processName} — Generado el ${today}`;
    window.print();
  }

  // ---------- Init ----------

  function init() {
    $("#btnAddPerson").addEventListener("click", () => addPerson());
    $("#btnSettings").addEventListener("click", openSettings);
    $("#btnCloseSettings").addEventListener("click", closeSettings);
    $("#btnApplySettings").addEventListener("click", applySettings);
    $("#btnResetDefaults").addEventListener("click", resetDefaults);
    $("#settingsModal").addEventListener("click", (e) => {
      if (e.target.id === "settingsModal") closeSettings();
    });

    $("#projectionYears").addEventListener("change", recalculate);
    $("#solutionCost").addEventListener("input", recalculate);
    $("#executionMonths").addEventListener("change", recalculate);
    $("#processName").addEventListener("input", () => {});
    $("#btnGeneratePDF").addEventListener("click", generatePDF);

    renderPeople();
    recalculate();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
