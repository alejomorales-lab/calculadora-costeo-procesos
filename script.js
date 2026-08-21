(() => {
  "use strict";

  const DEFAULTS = {
    factor: 1.55,
    weeklyHours: 42,
    annualIncrease: 6,
    workDaysMonth: 21.67,
    solutionPct: 50,
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

  const formatThousands = (n) => {
    if (!isFinite(n)) return "";
    return Math.round(n).toLocaleString("es-CO");
  };

  const parseThousands = (str) => {
    const digits = (str || "").replace(/[^\d]/g, "");
    return digits ? parseInt(digits, 10) : 0;
  };

  const setupThousandsInput = (input, onChange) => {
    input.addEventListener("input", () => {
      const caretFromEnd = input.value.length - input.selectionStart;
      const value = parseThousands(input.value);
      input.value = value ? formatThousands(value) : "";
      const newPos = Math.max(0, input.value.length - caretFromEnd);
      input.setSelectionRange(newPos, newPos);
      onChange(value);
    });
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
      salaryInput.value = person.salary ? formatThousands(person.salary) : "";
      hoursInput.value = person.hours;
      unitSelect.value = person.unit;

      nameInput.addEventListener("focus", () => {
        if (/^Persona \d+$/.test(nameInput.value)) {
          nameInput.value = "";
        }
      });
      nameInput.addEventListener("input", () => {
        person.name = nameInput.value;
      });
      setupThousandsInput(salaryInput, (value) => {
        person.salary = value;
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
    const executionMonths = parseInt($("#executionMonths").value, 10) || 1;

    const annualIncreaseRate = settings.annualIncrease / 100;

    const totalMonths = years * 12;
    const monthlyProcessCostSeries = [];
    for (let m = 0; m < totalMonths; m++) {
      // Escalón anual: el costo se mantiene fijo durante los 12 meses del año y solo sube
      // al iniciar el siguiente año (no se reparte el incremento mes a mes).
      const yearIndex = Math.floor(m / 12);
      const processCostThisMonth = totalMonthlyProcessCost * Math.pow(1 + annualIncreaseRate, yearIndex);
      monthlyProcessCostSeries.push(processCostThisMonth);
    }

    const cumulativeProcessCostSeries = [];
    let runningProcess = 0;
    for (let m = 0; m < totalMonths; m++) {
      runningProcess += monthlyProcessCostSeries[m];
      cumulativeProcessCostSeries.push(runningProcess);
    }

    // Costo mensual de la solución: monto fijo, o % del costo mensual actual del proceso.
    const solutionCostModeEl = $("#solutionCostMode");
    const solutionCostMode = solutionCostModeEl ? solutionCostModeEl.value : "fixed";
    let solutionMonthlyCost;
    let solutionPct = null;
    if (solutionCostMode === "percentage") {
      solutionPct = parseFloat($("#solutionPct").value) || 0;
      solutionMonthlyCost = (solutionPct / 100) * totalMonthlyProcessCost;
    } else {
      solutionMonthlyCost = parseThousands($("#solutionCost").value);
    }

    const monthlySolutionCostSeries = [];
    for (let m = 0; m < totalMonths; m++) {
      // La solución solo genera costo durante sus meses de ejecución (inversión de implementación);
      // después de eso no se repite más.
      monthlySolutionCostSeries.push(m < executionMonths ? solutionMonthlyCost : 0);
    }

    const cumulativeSolutionCostSeries = [];
    let runningSolution = 0;
    for (let m = 0; m < totalMonths; m++) {
      runningSolution += monthlySolutionCostSeries[m];
      cumulativeSolutionCostSeries.push(runningSolution);
    }

    const totalAnnualProcessCostYear1 = cumulativeProcessCostSeries[Math.min(11, totalMonths - 1)] || 0;
    const totalAnnualHours = totalMonthlyProcessHours * 12;
    const totalSolutionInvestment = executionMonths * solutionMonthlyCost;

    // % total de tiempo laboral (de todas las personas) dedicado al proceso
    const monthlyLegalHours = settings.weeklyHours * WEEKS_PER_MONTH;
    const totalAvailableHours = monthlyLegalHours * people.length;
    const totalTimeInvestedPct = totalAvailableHours > 0 ? (totalMonthlyProcessHours / totalAvailableHours) * 100 : 0;

    // Gasto real en paralelo: durante la ejecución se sigue pagando el proceso Y la solución al mismo tiempo.
    // Después de la ejecución, el gasto real se detiene (la solución ya reemplazó al proceso).
    // Esta es la base de TODOS los cálculos de ahorro/payback del informe — nunca se compara
    // el proceso solo contra el costo de la solución sola, siempre contra el gasto real combinado.
    const realSpendSeries = [];
    for (let m = 0; m < totalMonths; m++) {
      realSpendSeries.push(m < executionMonths ? monthlyProcessCostSeries[m] + solutionMonthlyCost : 0);
    }
    const cumulativeRealSpendSeries = [];
    let runningReal = 0;
    for (let m = 0; m < totalMonths; m++) {
      runningReal += realSpendSeries[m];
      cumulativeRealSpendSeries.push(runningReal);
    }
    const lastExecIdx = Math.min(executionMonths, totalMonths) - 1;
    const totalRealInvestment = lastExecIdx >= 0 ? cumulativeRealSpendSeries[lastExecIdx] : 0;

    // KPIs de la solución (calculados sobre el año 1, después de la gráfica comparativa)
    const annualSavingsWithSolution = totalAnnualProcessCostYear1 - totalRealInvestment;
    const annualSavingsPct = totalAnnualProcessCostYear1 > 0 ? (annualSavingsWithSolution / totalAnnualProcessCostYear1) * 100 : 0;
    const monthlySavingsPostImplementation = totalMonthlyProcessCost;

    // Payback: primer mes en que el gasto acumulado del proceso (si nunca se hubiera adoptado la solución)
    // supera el gasto real total pagado (proceso + solución durante la implementación).
    let paybackMonths = null;
    if (solutionMonthlyCost > 0 && totalRealInvestment > 0) {
      const idx = cumulativeProcessCostSeries.findIndex((v) => v >= totalRealInvestment);
      if (idx === -1) {
        paybackMonths = null;
      } else {
        const prevCum = idx === 0 ? 0 : cumulativeProcessCostSeries[idx - 1];
        const monthCost = monthlyProcessCostSeries[idx];
        const fraction = monthCost > 0 ? (totalRealInvestment - prevCum) / monthCost : 0;
        paybackMonths = idx + fraction;
      }
    }
    const paybackMonthIndex = paybackMonths !== null ? Math.floor(paybackMonths) : null;

    return {
      perPersonResults,
      totalMonthlyProcessCost,
      totalMonthlyProcessHours,
      years,
      totalMonths,
      solutionMonthlyCost,
      solutionCostMode,
      solutionPct,
      executionMonths,
      monthlyProcessCostSeries,
      monthlySolutionCostSeries,
      cumulativeProcessCostSeries,
      cumulativeSolutionCostSeries,
      realSpendSeries,
      cumulativeRealSpendSeries,
      totalAnnualProcessCostYear1,
      totalAnnualHours,
      totalTimeInvestedPct,
      totalSolutionInvestment,
      totalRealInvestment,
      annualSavingsWithSolution,
      annualSavingsPct,
      monthlySavingsPostImplementation,
      paybackMonths,
      paybackMonthIndex,
    };
  }

  // ---------- Rendering: per-person mini results ----------

  function renderPersonResults(perPersonResults) {
    perPersonResults.forEach(({ person, monthlyProcessCost, monthlyProcessHours, timeInvestedPct }) => {
      const row = peopleList.querySelector(`.person-row[data-id="${person.id}"]`);
      if (!row) return;
      row.querySelector(".res-monthly-cost").textContent = fmtMoney(monthlyProcessCost);
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
      totalRealInvestment,
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
        label: "Costo total de la solución",
        value: fmtMoney(totalSolutionInvestment),
        cls: "neutral",
        sub: `${executionMonths} ${executionMonths === 1 ? "mes" : "meses"} de implementación`,
        highlight: true,
      },
      {
        label: "Costo total de implementación",
        value: fmtMoney(totalRealInvestment),
        cls: "neutral",
        sub: `${fmtMoney(totalSolutionInvestment)} de la solución + proceso pagado en paralelo durante ${executionMonths} ${executionMonths === 1 ? "mes" : "meses"}`,
      },
      {
        label: "Ahorro anual con la solución",
        value: hasSolution ? fmtMoney(annualSavingsWithSolution) : "—",
        cls: annualSavingsWithSolution >= 0 ? "positive" : "negative",
        sub: hasSolution
          ? "Costo anual del proceso vs. costo total de implementación"
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
          ? "Incluye el proceso pagado en paralelo durante la implementación (ver tabla abajo)"
          : "No aplica con los datos actuales",
      },
    ];

    solutionGrid.innerHTML = "";
    cards.forEach((c) => {
      const el = document.createElement("div");
      el.className = "kpi-card" + (c.highlight ? " kpi-card-highlight" : "");
      el.innerHTML = `
        <div class="kpi-label">${c.label}</div>
        <div class="kpi-value ${c.cls}">${c.value}</div>
        <div class="kpi-sub">${c.sub}</div>
      `;
      solutionGrid.appendChild(el);
    });
  }

  // ---------- Tabla de desglose mes a mes (payback) ----------

  function renderPaybackTable(totals) {
    const wrap = $("#paybackTableCard");
    const tbody = $("#paybackTableBody");
    const note = $("#paybackTableNote");
    if (!wrap || !tbody) return;

    const {
      solutionMonthlyCost,
      executionMonths,
      monthlyProcessCostSeries,
      monthlySolutionCostSeries,
      cumulativeProcessCostSeries,
      realSpendSeries,
      cumulativeRealSpendSeries,
      paybackMonthIndex,
      paybackMonths,
    } = totals;

    if (solutionMonthlyCost <= 0) {
      wrap.classList.add("hidden");
      return;
    }
    wrap.classList.remove("hidden");

    tbody.innerHTML = "";

    monthlyProcessCostSeries.forEach((processCost, i) => {
      const isExecution = i < executionMonths;
      const solutionCostThisMonth = isExecution ? solutionMonthlyCost : 0;
      const realCumulative = cumulativeRealSpendSeries[i];
      const baselineCumulative = cumulativeProcessCostSeries[i];
      const isPaybackRow = paybackMonthIndex !== null && i === paybackMonthIndex;

      const tr = document.createElement("tr");
      if (isPaybackRow) tr.className = "payback-row";

      tr.innerHTML = `
        <td>${monthLabel(i)}</td>
        <td>${fmtMoney(processCost)}</td>
        <td>${solutionCostThisMonth > 0 ? fmtMoney(solutionCostThisMonth) : "—"}</td>
        <td>${fmtMoney(realCumulative)}</td>
        <td>${fmtMoney(baselineCumulative)}</td>
        <td>${isPaybackRow ? "✓ Punto de equilibrio" : (isExecution ? "Implementación" : "")}</td>
      `;
      tbody.appendChild(tr);
    });

    note.textContent = paybackMonths
      ? `Durante la implementación (${executionMonths} ${executionMonths === 1 ? "mes" : "meses"}) se paga el proceso Y la solución al mismo tiempo. El "gasto real acumulado" se congela al terminar la implementación; el punto de equilibrio es el mes en que el "costo proceso acumulado (si no se interviene)" lo supera.`
      : `Con los datos actuales, el proceso nunca supera el gasto real invertido dentro del periodo proyectado. Prueba aumentando los años a proyectar.`;
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
    const solutionData = totals.cumulativeRealSpendSeries;
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
    l2.textContent = "Gasto real (implementación)";
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

  function renderPaybackChart(totals) {
    const svg = $("#chartPayback");
    if (!svg) return;
    clearSvg(svg);

    const card = $("#paybackChartCard");
    const note = $("#notePayback");
    const { solutionMonthlyCost, paybackMonths, executionMonths } = totals;

    if (solutionMonthlyCost <= 0) {
      if (card) card.classList.add("hidden");
      return;
    }
    if (card) card.classList.remove("hidden");
    if (paybackMonths === null) {
      if (note) note.textContent = "Con los datos actuales, el punto de equilibrio no se alcanza dentro del periodo proyectado. Prueba aumentando los años a proyectar.";
      return;
    }

    const W = 600, H = 300;
    const padL = 60, padR = 108, padT = 30, padB = 40;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;

    const processData = totals.cumulativeProcessCostSeries;
    const realData = totals.cumulativeRealSpendSeries;
    const n = processData.length;
    const maxVal = Math.max(...processData, ...realData, 1) * 1.15;

    drawAxes(svg, padL, padR, padT, padB, W, chartW, chartH, maxVal);

    const xFor = (i) => padL + (n === 1 ? chartW / 2 : (chartW * i) / (n - 1));
    const yFor = (val) => padT + chartH - (chartH * val) / maxVal;

    const processPoints = processData.map((val, i) => [xFor(i), yFor(val)]);
    const realPoints = realData.map((val, i) => [xFor(i), yFor(val)]);

    const buildLinePath = (points) => {
      let d = `M ${points[0][0]} ${points[0][1]} `;
      points.forEach(([x, y]) => (d += `L ${x} ${y} `));
      return d;
    };

    svg.appendChild(svgEl("path", {
      d: buildLinePath(realPoints), fill: "none", stroke: "#a78bfa", "stroke-width": 2.5,
      "stroke-linecap": "round", "stroke-linejoin": "round",
    }));
    svg.appendChild(svgEl("path", {
      d: buildLinePath(processPoints), fill: "none", stroke: "#f87171", "stroke-width": 2.5,
      "stroke-linecap": "round", "stroke-linejoin": "round",
    }));

    const tickIndices = xTicksForMonths(n);
    tickIndices.forEach((i) => {
      svg.appendChild(svgEl("circle", { cx: processPoints[i][0], cy: processPoints[i][1], r: 4, fill: "#f87171" }));
      svg.appendChild(svgEl("circle", { cx: realPoints[i][0], cy: realPoints[i][1], r: 4, fill: "#a78bfa" }));

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
    l1.textContent = "Costo proceso (sin intervención)";
    svg.appendChild(l1);

    svg.appendChild(svgEl("rect", { x: padL + 190, y: legendY, width: 10, height: 10, fill: "#a78bfa", rx: 2 }));
    const l2 = svgEl("text", { x: padL + 206, y: legendY + 9, fill: "#93a0c2", "font-size": 11 });
    l2.textContent = "Gasto real acumulado";
    svg.appendChild(l2);

    // punto de equilibrio: marcador destacado + cruces punteadas a los dos ejes
    const breakevenX = padL + (n === 1 ? chartW / 2 : (chartW * paybackMonths) / (n - 1));
    const breakevenY = yFor(totals.totalRealInvestment);

    svg.appendChild(svgEl("line", {
      x1: breakevenX, x2: breakevenX, y1: breakevenY, y2: padT + chartH,
      stroke: "#6ee7b7", "stroke-width": 1.5, "stroke-dasharray": "4,4",
    }));
    svg.appendChild(svgEl("line", {
      x1: padL, x2: breakevenX, y1: breakevenY, y2: breakevenY,
      stroke: "#6ee7b7", "stroke-width": 1.5, "stroke-dasharray": "4,4",
    }));
    svg.appendChild(svgEl("circle", {
      cx: breakevenX, cy: breakevenY, r: 6, fill: "#6ee7b7", stroke: "#0f172a", "stroke-width": 2,
    }));

    const labelAboveLine = breakevenY > padT + 40;
    const beLabel1 = svgEl("text", {
      x: breakevenX, y: labelAboveLine ? breakevenY - 16 : breakevenY + 22,
      "text-anchor": breakevenX > W - 130 ? "end" : "middle",
      fill: "#e8ecf7", "font-size": 11, "font-weight": 700,
    });
    beLabel1.textContent = "Punto de equilibrio";
    svg.appendChild(beLabel1);

    const beLabel2 = svgEl("text", {
      x: breakevenX, y: labelAboveLine ? breakevenY - 3 : breakevenY + 35,
      "text-anchor": breakevenX > W - 130 ? "end" : "middle",
      fill: "#6ee7b7", "font-size": 10.5, "font-weight": 600,
    });
    beLabel2.textContent = "Mes " + fmtHours(paybackMonths) + " · " + shortMoney(totals.totalRealInvestment);
    svg.appendChild(beLabel2);

    if (note) {
      note.textContent = `El punto de equilibrio se alcanza en el mes ${fmtHours(paybackMonths)}, cuando el costo acumulado del proceso (línea roja) supera el gasto real acumulado de $${Math.round(totals.totalRealInvestment).toLocaleString("es-CO")} pagado durante los ${executionMonths} ${executionMonths === 1 ? "mes" : "meses"} de implementación (línea morada).`;
    }
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
        ? `Durante los primeros ${totals.executionMonths} ${totals.executionMonths === 1 ? "mes" : "meses"} (implementación) se paga el proceso Y la solución al mismo tiempo; el gasto real acumula hasta ${fmtMoney(totals.totalRealInvestment)} y luego se mantiene plano, mientras el costo del proceso sigue creciendo.`
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
    renderPaybackTable(totals);
    renderPaybackChart(totals);
    renderSolutionPctEstimate(totals);
    renderNotes(totals);
  }

  // ---------- Settings modal ----------

  function openSettings() {
    $("#cfgFactor").value = settings.factor;
    $("#cfgWeeklyHours").value = settings.weeklyHours;
    $("#cfgAnnualIncrease").value = settings.annualIncrease;
    $("#cfgWorkDaysMonth").value = settings.workDaysMonth;
    $("#cfgSolutionPct").value = settings.solutionPct;
    $("#settingsModal").classList.remove("hidden");
  }

  function closeSettings() {
    $("#settingsModal").classList.add("hidden");
  }

  function applySettings() {
    const previousSolutionPct = settings.solutionPct;

    settings.factor = parseFloat($("#cfgFactor").value) || DEFAULTS.factor;
    settings.weeklyHours = parseFloat($("#cfgWeeklyHours").value) || DEFAULTS.weeklyHours;
    settings.annualIncrease = parseFloat($("#cfgAnnualIncrease").value) || 0;
    settings.workDaysMonth = parseFloat($("#cfgWorkDaysMonth").value) || DEFAULTS.workDaysMonth;
    settings.solutionPct = parseFloat($("#cfgSolutionPct").value) || DEFAULTS.solutionPct;

    const solutionPctInput = $("#solutionPct");
    if (parseFloat(solutionPctInput.value) === previousSolutionPct) {
      solutionPctInput.value = settings.solutionPct;
    }

    closeSettings();
    recalculate();
  }

  function resetDefaults() {
    settings = { ...DEFAULTS };
    openSettings();
  }

  // ---------- Modo de costo de la solución (monto fijo / % del proceso) ----------

  function setSolutionCostMode(mode) {
    $("#solutionCostMode").value = mode;
    $("#btnModeFixed").classList.toggle("active", mode === "fixed");
    $("#btnModePct").classList.toggle("active", mode === "percentage");
    $("#solutionCostFixedField").classList.toggle("hidden", mode !== "fixed");
    $("#solutionCostPctField").classList.toggle("hidden", mode !== "percentage");
    recalculate();
  }

  function renderSolutionPctEstimate(totals) {
    const el = $("#solutionPctEstimate");
    if (!el) return;
    if (totals.solutionCostMode !== "percentage") return;
    const totalOverExecution = totals.solutionMonthlyCost * totals.executionMonths;
    el.textContent =
      `${fmtMoney(totals.solutionMonthlyCost)}/mes (${totals.solutionPct}% de ${fmtMoney(totals.totalMonthlyProcessCost)}, costo mensual del proceso) ` +
      `× ${totals.executionMonths} ${totals.executionMonths === 1 ? "mes" : "meses"} de ejecución = ${fmtMoney(totalOverExecution)} total`;
  }

  // ---------- Reporte PDF ----------

  function generatePDF() {
    const processName = $("#processName").value || "Proceso sin nombre";
    const today = new Date().toLocaleDateString("es-CO", { year: "numeric", month: "long", day: "numeric" });

    $("#printProcessName").textContent = processName;
    $("#printMeta").textContent = `Generado el ${today}`;

    const totals = computeTotals();

    const peopleBody = $("#printPeopleBody");
    peopleBody.innerHTML = "";
    if (totals.perPersonResults.length === 0) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="5">Sin personas registradas</td>`;
      peopleBody.appendChild(tr);
    } else {
      totals.perPersonResults.forEach(({ person, monthlyCompanyCost, timeInvestedPct }) => {
        const dedication = `${person.hours} ${person.unit === "day" ? "h/día" : "h/semana"}`;
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${person.name || "Sin nombre"}</td>
          <td>${fmtMoney(person.salary)}</td>
          <td>${dedication}</td>
          <td>${fmtHours(timeInvestedPct)}%</td>
          <td>${fmtMoney(monthlyCompanyCost)}</td>
        `;
        peopleBody.appendChild(tr);
      });
    }

    const years = $("#projectionYears").value;
    const solutionCost = fmtMoney(totals.solutionMonthlyCost);
    const executionMonths = $("#executionMonths").value;
    $("#printParams").innerHTML =
      `<strong>Parámetros:</strong> Proyección a ${years} ${years === "1" ? "año" : "años"} · ` +
      `Costo mensual de la solución: ${solutionCost} · ` +
      `Tiempo de ejecución: ${executionMonths} ${executionMonths === "1" ? "mes" : "meses"}`;

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
    setupThousandsInput($("#solutionCost"), recalculate);
    $("#solutionPct").value = settings.solutionPct;
    $("#solutionPct").addEventListener("input", recalculate);
    $("#btnModeFixed").addEventListener("click", () => setSolutionCostMode("fixed"));
    $("#btnModePct").addEventListener("click", () => setSolutionCostMode("percentage"));
    $("#executionMonths").addEventListener("change", recalculate);
    $("#processName").addEventListener("input", () => {});
    $("#processName").addEventListener("focus", () => {
      const processName = $("#processName");
      if (processName.value === "Mi proceso") processName.value = "";
    });
    $("#btnGeneratePDF").addEventListener("click", generatePDF);

    addPerson();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
