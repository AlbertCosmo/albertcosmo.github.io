/* Explore — Chart.js with figure numbers; primary = segment lag-2 LLM vs lexical */
(async function () {
  const el = (id) => document.getElementById(id);
  const status = el("load-status");
  let DATA = null;
  const charts = {};

  // Editorial palette (match R theme_pub.R)
  const C = { bert: "#1F2937", gemini: "#0F766E", grok: "#9D174D" };
  const L = { bert: "BERT (lexical)", gemini: "Gemini (LLM)", grok: "Grok (exploratory)" };
  const MODELS = ["bert", "gemini", "grok"];
  const PAPER = "#F4F1EA";
  const INK = "#0B1220";
  const GRID = "rgba(217,210,197,0.7)";

  // Chart.js defaults
  Chart.defaults.font.family = "Inter, system-ui, sans-serif";
  Chart.defaults.color = INK;
  Chart.defaults.borderColor = GRID;

  // Value labels plugin
  const valueLabels = {
    id: "valueLabels",
    afterDatasetsDraw(chart, _args, opts) {
      if (opts === false || (opts && opts.display === false)) return;
      const { ctx } = chart;
      ctx.save();
      ctx.font = "600 11px Inter, system-ui, sans-serif";
      ctx.fillStyle = INK;
      chart.data.datasets.forEach((ds, di) => {
        if (ds.hidden) return;
        const meta = chart.getDatasetMeta(di);
        meta.data.forEach((pt, i) => {
          const v = ds.data[i];
          if (v == null || Number.isNaN(v)) return;
          const label = (v >= 0 ? "+" : "") + Number(v).toFixed(opts?.digits ?? 2);
          const { x, y } = pt.tooltipPosition();
          const horiz = chart.options.indexAxis === "y";
          if (horiz) {
            ctx.textAlign = v >= 0 ? "left" : "right";
            ctx.textBaseline = "middle";
            ctx.fillText(label, x + (v >= 0 ? 4 : -4), y);
          } else {
            ctx.textAlign = "center";
            ctx.textBaseline = v >= 0 ? "bottom" : "top";
            ctx.fillText(label, x, y + (v >= 0 ? -4 : 4));
          }
        });
      });
      ctx.restore();
    },
  };
  Chart.register(valueLabels);

  function destroy(name) {
    if (charts[name]) {
      charts[name].destroy();
      delete charts[name];
    }
  }

  function barOpts(title, yLabel, yMin, yMax, extra = {}) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { font: { size: 12, weight: "600" }, boxWidth: 12 } },
        title: {
          display: true,
          text: title,
          color: INK,
          font: { size: 15, weight: "700" },
          padding: { bottom: 10 },
        },
        valueLabels: { digits: 2 },
        ...extra.plugins,
      },
      scales: {
        y: {
          title: yLabel ? { display: true, text: yLabel, color: INK } : undefined,
          min: yMin,
          max: yMax,
          grid: { color: GRID },
          ticks: { color: INK },
          border: { color: INK },
        },
        x: {
          ticks: { color: INK, font: { size: 12, weight: "600" } },
          grid: { display: false },
          border: { color: INK },
        },
      },
      ...extra,
    };
  }

  try {
    const res = await fetch("data/explore_bundle.json?v=seg3", { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    DATA = await res.json();
    if (status) {
      const m = DATA.meta || {};
      status.className = "meta";
      status.innerHTML =
        `Loaded primary unit=<strong>${m.primary_unit || "segment"}</strong> · lag <strong>${m.primary_lag_s ?? 2}s</strong> · n=<strong>${m.primary_n_segments ?? "—"}</strong> · frame: ${m.frame || "LLM vs lexical"}`;
    }
  } catch (e) {
    if (status) {
      status.className = "loading";
      status.textContent = "Could not load data/explore_bundle.json: " + e.message;
    }
    return;
  }

  // Fig E1 — hero pooled
  function renderHero() {
    const tw = DATA.three_way;
    if (!tw) return;
    const po = {};
    (tw.pleasantother_pooled || []).forEach((r) => {
      po[r.model] = r;
    });
    destroy("hero");
    charts.hero = new Chart(el("chart-hero"), {
      type: "bar",
      data: {
        labels: ["BERT\n(lexical)", "Gemini\n(LLM)", "Grok\n(exploratory)"],
        datasets: [
          {
            label: "Pooled r",
            data: MODELS.map((m) => (po[m] ? po[m].pooled_r : 0)),
            backgroundColor: MODELS.map((m) => C[m]),
            borderRadius: 6,
            borderSkipped: false,
            maxBarThickness: 72,
          },
        ],
      },
      options: {
        ...barOpts(
          "Fig. E1  |  LLM vs lexical · segment PleasantOther",
          "Pooled Pearson r (within-film z)",
          -0.15,
          0.35
        ),
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: "Fig. E1  |  LLM vs lexical · segment PleasantOther (lag 2 s, n=435)",
            color: INK,
            font: { size: 15, weight: "700" },
          },
          valueLabels: { digits: 3 },
          tooltip: {
            callbacks: {
              afterLabel(ctx) {
                const m = MODELS[ctx.dataIndex];
                const r = po[m];
                if (!r) return "";
                return `CI [${r.block_boot_ci95[0]}, ${r.block_boot_ci95[1]}] · ${r.n_segments} segments · lag ${r.lag_s}s`;
              },
            },
          },
        },
      },
    });

    // Fig E2 per-film
    const pf = tw.pleasantother_per_film || [];
    destroy("heroFilm");
    charts.heroFilm = new Chart(el("chart-hero-film"), {
      type: "bar",
      data: {
        labels: pf.map((r) => r.film),
        datasets: MODELS.map((m) => ({
          label: L[m],
          data: pf.map((r) => (r[m] != null ? r[m] : 0)),
          backgroundColor: C[m],
          borderRadius: 4,
          maxBarThickness: 36,
        })),
      },
      options: {
        ...barOpts(
          "Fig. E2  |  Per-film segment r (PleasantOther, lag 2 s)",
          "r vs PleasantOther",
          -0.35,
          0.55
        ),
        plugins: {
          legend: { position: "bottom", labels: { font: { size: 12, weight: "600" }, boxWidth: 12 } },
          title: {
            display: true,
            text: "Fig. E2  |  Per-film segment r · all three arms",
            color: INK,
            font: { size: 15, weight: "700" },
          },
          valueLabels: { digits: 2 },
        },
      },
    });
  }

  // Fig E3 multi-item
  function renderTextThreeWay() {
    const rows = DATA.text_multi_item || [];
    const by = {};
    rows.forEach((r) => {
      by[r.item] = by[r.item] || {};
      const val = r.pooled_r_centered != null ? r.pooled_r_centered : r.pooled_r;
      by[r.item][r.model] = val;
    });
    const sort = (el("text-sort") && el("text-sort").value) || "abs";
    let items = Object.keys(by);
    items.sort((a, b) => {
      if (sort === "signed") {
        const ma = Math.max(...MODELS.map((m) => by[a][m] || 0));
        const mb = Math.max(...MODELS.map((m) => by[b][m] || 0));
        return mb - ma;
      }
      const sa = Math.max(...MODELS.map((m) => Math.abs(by[a][m] || 0)));
      const sb = Math.max(...MODELS.map((m) => Math.abs(by[b][m] || 0)));
      return sb - sa;
    });
    items = items.slice(0, 12);

    destroy("text");
    charts.text = new Chart(el("chart-text"), {
      type: "bar",
      data: {
        labels: items,
        datasets: MODELS.map((m) => ({
          label: L[m],
          data: items.map((it) => by[it][m] ?? 0),
          backgroundColor: C[m],
          borderRadius: 3,
          maxBarThickness: 14,
        })),
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top", labels: { font: { size: 12, weight: "600" }, boxWidth: 12 } },
          title: {
            display: true,
            text: "Fig. E3  |  GRID items · three arms (centered pooled r)",
            color: INK,
            font: { size: 15, weight: "700" },
          },
          valueLabels: { digits: 2 },
        },
        scales: {
          x: {
            title: { display: true, text: "Pooled Pearson r (within-film z)" },
            min: -0.35,
            max: 0.4,
            grid: { color: GRID },
          },
          y: { ticks: { font: { size: 11 } }, grid: { display: false } },
        },
      },
    });
    if (el("text-interp"))
      el("text-interp").innerHTML =
        "<strong>Read.</strong> Grouped bars: BERT · Gemini · Grok on the same items. " +
        "Primary headline remains segment PleasantOther (Fig. E1), not these multi-item pools. " +
        "Grok is exploratory.";
  }

  function fillItemSelect() {
    const items = [
      ...new Set((DATA.three_way?.rows || DATA.text_multi_item || []).map((r) => r.item)),
    ].sort();
    const sel = el("film-item");
    if (!sel) return;
    sel.innerHTML = items
      .map((i) => `<option value="${i}" ${i === "PleasantOther" ? "selected" : ""}>${i}</option>`)
      .join("");
  }

  // Fig E4 per-film item picker
  function renderFilmThreeWay() {
    const item = el("film-item")?.value || "PleasantOther";
    const tw = DATA.three_way;
    let labels = [];
    const series = { bert: [], gemini: [], grok: [] };

    if (item === "PleasantOther" && tw?.pleasantother_per_film) {
      labels = tw.pleasantother_per_film.map((r) => r.film);
      MODELS.forEach((m) => {
        series[m] = tw.pleasantother_per_film.map((r) => (r[m] != null ? r[m] : 0));
      });
    } else {
      const byFilm = {};
      DATA.text_multi_item
        .filter((r) => r.item === item)
        .forEach((r) => {
          (r.per_film || []).forEach((pf) => {
            byFilm[pf.film] = byFilm[pf.film] || {};
            byFilm[pf.film][r.model] = pf.r;
          });
        });
      labels = Object.keys(byFilm).sort();
      MODELS.forEach((m) => {
        series[m] = labels.map((f) => (byFilm[f][m] != null ? byFilm[f][m] : 0));
      });
    }

    destroy("film");
    charts.film = new Chart(el("chart-film"), {
      type: "bar",
      data: {
        labels,
        datasets: MODELS.map((m) => ({
          label: L[m],
          data: series[m],
          backgroundColor: C[m],
          borderRadius: 4,
          maxBarThickness: 34,
        })),
      },
      options: {
        ...barOpts(`Fig. E4  |  ${item}: per-film (three arms)`, "Pearson r", -0.5, 0.6),
        plugins: {
          legend: { position: "bottom", labels: { font: { size: 12, weight: "600" }, boxWidth: 12 } },
          title: {
            display: true,
            text: `Fig. E4  |  ${item}: per-film · BERT · Gemini · Grok`,
            color: INK,
            font: { size: 15, weight: "700" },
          },
          valueLabels: { digits: 2 },
        },
      },
    });

    if (tw && item === "PleasantOther") {
      const bits = (tw.pleasantother_pooled || [])
        .map((r) => `${L[r.model].split(" ")[0]}=${r.pooled_r >= 0 ? "+" : ""}${r.pooled_r.toFixed(3)}`)
        .join(" · ");
      if (el("film-pool")) el("film-pool").textContent = "Primary pooled: " + bits;
    } else if (el("film-pool")) el("film-pool").textContent = "";

    if (el("film-interp"))
      el("film-interp").innerHTML =
        "<strong>Read.</strong> Segment-level PleasantOther peaks on TearsOfSteel for LLMs. " +
        "LLM−lexical gap holds without ToS; absolute LLM r still ToS-sensitive (see LOFO).";
  }

  // Fig E5 lag profile if data present
  function renderLag() {
    const canvas = el("chart-lag");
    if (!canvas || !DATA.lag_profile) return;
    const prof = DATA.lag_profile.profile || [];
    const byM = { bert: [], gemini: [], grok: [] };
    const lags = [...new Set(prof.map((p) => p.lag_s))].sort((a, b) => a - b);
    lags.forEach((Llag) => {
      MODELS.forEach((m) => {
        const row = prof.find((p) => p.model === m && p.lag_s === Llag);
        byM[m].push(row ? row.r : null);
      });
    });
    destroy("lag");
    charts.lag = new Chart(canvas, {
      type: "line",
      data: {
        labels: lags.map(String),
        datasets: MODELS.map((m) => ({
          label: L[m],
          data: byM[m],
          borderColor: C[m],
          backgroundColor: C[m],
          tension: 0.25,
          pointRadius: 4,
          pointHoverRadius: 6,
          borderWidth: 2.5,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { font: { size: 12, weight: "600" }, boxWidth: 12 } },
          title: {
            display: true,
            text: `Fig. E5  |  Lag profile on common sample (n=${DATA.lag_profile.n_common_seconds})`,
            color: INK,
            font: { size: 15, weight: "700" },
          },
          valueLabels: { display: false },
        },
        scales: {
          y: { title: { display: true, text: "Pearson r" }, grid: { color: GRID } },
          x: { title: { display: true, text: "Lag L (s)" }, grid: { display: false } },
        },
      },
    });
  }

  // Fig E6 affective
  function renderAffective() {
    const rois = ["network", "insula", "vmpfc", "amygdala"];
    destroy("aff");
    charts.aff = new Chart(el("chart-aff"), {
      type: "bar",
      data: {
        labels: rois,
        datasets: [
          {
            label: "Payload real",
            data: rois.map((roi) => {
              const r = DATA.affective_pleasantother.find((x) => x.roi === roi && x.film === "Payload");
              return r ? r.real : null;
            }),
            backgroundColor: C.gemini,
            borderRadius: 4,
          },
          {
            label: "Payload null",
            data: rois.map((roi) => {
              const r = DATA.affective_pleasantother.find((x) => x.roi === roi && x.film === "Payload");
              return r ? r.null : null;
            }),
            backgroundColor: "#CBD5E1",
            borderRadius: 4,
          },
          {
            label: "ToS real",
            data: rois.map((roi) => {
              const r = DATA.affective_pleasantother.find(
                (x) => x.roi === roi && x.film === "TearsOfSteel"
              );
              return r ? r.real : null;
            }),
            backgroundColor: "#B45309",
            borderRadius: 4,
          },
          {
            label: "ToS null",
            data: rois.map((roi) => {
              const r = DATA.affective_pleasantother.find(
                (x) => x.roi === roi && x.film === "TearsOfSteel"
              );
              return r ? r.null : null;
            }),
            backgroundColor: "#E7E5E4",
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 12 } },
          title: {
            display: true,
            text: "Fig. E6  |  Affective ROIs · PleasantOther (gated LOSO)",
            color: INK,
            font: { size: 15, weight: "700" },
          },
          valueLabels: { digits: 2 },
        },
        scales: {
          y: { title: { display: true, text: "LOSO mean r" }, grid: { color: GRID } },
          x: { grid: { display: false } },
        },
      },
    });
  }

  // Fig E7 hits
  function renderHits() {
    const hr = DATA.brain_hit_rates || {};
    const labels = Object.keys(hr).sort();
    destroy("hits");
    charts.hits = new Chart(el("chart-hits"), {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "% DECODES",
            data: labels.map((k) => 100 * hr[k].rate),
            backgroundColor: labels.map((k) => (k.includes("Payload") ? C.gemini : "#B45309")),
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: "Fig. E7  |  Multi-item brain hit rates",
            color: INK,
            font: { size: 15, weight: "700" },
          },
          valueLabels: { digits: 0 },
          tooltip: {
            callbacks: {
              afterLabel(ctx) {
                const k = labels[ctx.dataIndex];
                return `${hr[k].d}/${hr[k].t} items`;
              },
            },
          },
        },
        scales: {
          y: { min: 0, max: 100, title: { display: true, text: "% items DECODES" }, grid: { color: GRID } },
          x: { ticks: { maxRotation: 40, font: { size: 10 } }, grid: { display: false } },
        },
      },
    });
  }

  function renderBrainTable() {
    const film = el("brain-film")?.value || "Payload";
    const roi = el("brain-roi")?.value || "network";
    const only = el("brain-only-hit")?.checked;
    let rows = (DATA.brain_multi_item || []).filter(
      (r) => (film === "all" || r.film === film) && (roi === "all" || r.roi === roi)
    );
    if (only) rows = rows.filter((r) => r.verdict === "DECODES");
    rows.sort((a, b) => (b.margin || 0) - (a.margin || 0));
    const tb = el("brain-table-body");
    if (!tb) return;
    tb.innerHTML = rows
      .slice(0, 80)
      .map(
        (r) => `<tr class="${r.verdict === "DECODES" ? "hit" : "null"}">
        <td>${r.roi}</td><td>${r.film}</td><td>${r.item}</td>
        <td class="num">${r.real > 0 ? "+" : ""}${Number(r.real).toFixed(3)}</td>
        <td class="num">${r.null > 0 ? "+" : ""}${Number(r.null).toFixed(3)}±${Number(r.null_sd || 0).toFixed(3)}</td>
        <td class="num">${r.margin > 0 ? "+" : ""}${Number(r.margin).toFixed(3)}</td>
        <td>${r.verdict}</td></tr>`
      )
      .join("");
    if (el("brain-count"))
      el("brain-count").textContent = `Showing ${Math.min(80, rows.length)} of ${rows.length} tests`;
  }

  // Fig E8 residual
  function renderResidual() {
    const film = el("resid-film")?.value || "Payload";
    const rows = film === "Payload" ? DATA.residual_payload : DATA.residual_tos;
    if (!rows || !rows.length) return;
    destroy("resid");
    charts.resid = new Chart(el("chart-resid"), {
      type: "bar",
      data: {
        labels: rows.map((r) => r.roi),
        datasets: [
          { label: "valence", data: rows.map((r) => r.valence), backgroundColor: C.gemini, borderRadius: 4 },
          { label: "valence − visual", data: rows.map((r) => r.resid), backgroundColor: "#B45309", borderRadius: 4 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 12 } },
          title: {
            display: true,
            text: `Fig. E8  |  Visual residualization · ${film}`,
            color: INK,
            font: { size: 15, weight: "700" },
          },
          valueLabels: { digits: 2 },
        },
        scales: {
          y: { title: { display: true, text: "LOSO mean r" }, grid: { color: GRID } },
          x: { grid: { display: false } },
        },
      },
    });
    if (el("resid-interp"))
      el("resid-interp").innerHTML =
        film === "Payload"
          ? "<strong>Read.</strong> Payload affective DECODES survive residualizing visual features out of the target."
          : "<strong>Read.</strong> Tears of Steel stays null after residualization.";
  }

  // Fig E9 physio
  function renderPhysio() {
    const top = (DATA.physio_top || []).slice(0, 15);
    destroy("phys");
    charts.phys = new Chart(el("chart-phys"), {
      type: "bar",
      data: {
        labels: top.map((t) => `${t.film.slice(0, 3)}|${t.channel}|${t.item}`),
        datasets: [
          {
            label: "r",
            data: top.map((t) => t.r),
            backgroundColor: top.map((t) => (t.r >= 0 ? C.gemini : "#B45309")),
            borderRadius: 3,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: "Fig. E9  |  Physio × annotations (top |r|)",
            color: INK,
            font: { size: 15, weight: "700" },
          },
          valueLabels: { digits: 2 },
        },
        scales: {
          x: { title: { display: true, text: "Subject-mean physio vs human item (r)" }, grid: { color: GRID } },
          y: { ticks: { font: { size: 10 } }, grid: { display: false } },
        },
      },
    });
  }

  // Fig E10 multimodal
  function renderMulti() {
    const rows = (DATA.multimodal || []).filter((r) => r.film === "TearsOfSteel");
    if (!rows.length) return;
    destroy("mm");
    charts.mm = new Chart(el("chart-mm"), {
      type: "bar",
      data: {
        labels: rows.map((r) => r.item),
        datasets: [
          { label: "Gemini text", data: rows.map((r) => r.text_gemini), backgroundColor: C.gemini, borderRadius: 3 },
          { label: "vis motion", data: rows.map((r) => r.vis_motion), backgroundColor: "#6b8f71", borderRadius: 3 },
          { label: "aud RMS", data: rows.map((r) => r.aud_rms_energy), backgroundColor: "#B45309", borderRadius: 3 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 12 } },
          title: {
            display: true,
            text: "Fig. E10  |  Multimodal snapshot (Tears of Steel)",
            color: INK,
            font: { size: 15, weight: "700" },
          },
          valueLabels: { digits: 2 },
        },
        scales: {
          y: { title: { display: true, text: "Univariate r" }, min: -0.6, max: 0.6, grid: { color: GRID } },
          x: { ticks: { maxRotation: 40, font: { size: 10 } }, grid: { display: false } },
        },
      },
    });
  }

  // Fig E11 annot variance
  function renderAnnot() {
    const rows = (DATA.annotation_top_items || []).slice(0, 15);
    destroy("annot");
    charts.annot = new Chart(el("chart-annot"), {
      type: "bar",
      data: {
        labels: rows.map((r) => r.item),
        datasets: [
          {
            label: "mean variance",
            data: rows.map((r) => r.mean_var),
            backgroundColor: C.gemini,
            borderRadius: 3,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: "Fig. E11  |  Annotation dynamics (top variance)",
            color: INK,
            font: { size: 15, weight: "700" },
          },
          valueLabels: { digits: 2 },
        },
        scales: {
          x: { grid: { color: GRID } },
          y: { ticks: { font: { size: 10 } }, grid: { display: false } },
        },
      },
    });
  }

  fillItemSelect();
  if (el("text-sort")) el("text-sort").onchange = renderTextThreeWay;
  if (el("film-item")) el("film-item").onchange = renderFilmThreeWay;
  if (el("brain-film")) el("brain-film").onchange = renderBrainTable;
  if (el("brain-roi")) el("brain-roi").onchange = renderBrainTable;
  if (el("brain-only-hit")) el("brain-only-hit").onchange = renderBrainTable;
  if (el("resid-film")) el("resid-film").onchange = renderResidual;

  renderHero();
  renderTextThreeWay();
  renderFilmThreeWay();
  renderLag();
  renderAffective();
  renderHits();
  renderBrainTable();
  renderResidual();
  renderPhysio();
  renderMulti();
  renderAnnot();
})();
