/* Interactive explore — Chart.js; always show BERT · Gemini · Grok together where text is plotted */
(async function () {
  const el = (id) => document.getElementById(id);
  const status = el("load-status");
  let DATA = null;
  const charts = {};

  const C = { bert: "#4a4a4a", gemini: "#1a5f7a", grok: "#7c3aed" };
  const L = { bert: "BERT", gemini: "Gemini", grok: "Grok" };
  const MODELS = ["bert", "gemini", "grok"];

  function destroy(name) {
    if (charts[name]) {
      charts[name].destroy();
      delete charts[name];
    }
  }

  try {
    const res = await fetch("data/explore_bundle.json?v=3way", { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    DATA = await res.json();
    if (status) status.remove();
  } catch (e) {
    if (status) status.textContent = "Could not load data/explore_bundle.json: " + e.message;
    return;
  }

  // ========== HERO: three-way PleasantOther ==========
  function renderThreeWayHero() {
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
        labels: ["BERT", "Gemini", "Grok"],
        datasets: [
          {
            label: "Pooled r vs PleasantOther (fair 5 films)",
            data: MODELS.map((m) => (po[m] ? po[m].pooled_r : 0)),
            backgroundColor: MODELS.map((m) => C[m]),
            borderWidth: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              afterLabel(ctx) {
                const m = MODELS[ctx.dataIndex];
                const r = po[m];
                if (!r) return "";
                return `CI [${r.block_boot_ci95[0]}, ${r.block_boot_ci95[1]}] · ${r.n_films} films · ${r.n_seconds}s`;
              },
            },
          },
          title: {
            display: true,
            text: "BERT · Gemini · Grok — pooled r vs human PleasantOther (fair 5-film set)",
            font: { size: 14, weight: "600" },
          },
        },
        scales: {
          y: {
            title: { display: true, text: "Pooled Pearson r" },
            min: -0.15,
            max: 0.35,
            grid: { color: "#eee" },
          },
          x: { ticks: { font: { size: 13, weight: "600" } } },
        },
      },
    });

    // per-film grouped
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
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { font: { size: 12 } } },
          title: {
            display: true,
            text: "Per-film PleasantOther — all three models on every film",
            font: { size: 14, weight: "600" },
          },
        },
        scales: {
          y: {
            title: { display: true, text: "r vs PleasantOther" },
            min: -0.3,
            max: 0.55,
            grid: { color: "#eee" },
          },
          x: { ticks: { maxRotation: 25, font: { size: 11 } } },
        },
      },
    });
  }

  // ========== Multi-item: ALWAYS 3 models grouped ==========
  function renderTextThreeWay() {
    const tw = DATA.three_way;
    if (!tw) return;
    const by = {};
    tw.rows.forEach((r) => {
      by[r.item] = by[r.item] || {};
      by[r.item][r.model] = r.pooled_r;
    });
    const sort = (el("text-sort") && el("text-sort").value) || "abs";
    let items = Object.keys(by);
    items.sort((a, b) => {
      const sa = Math.max(...MODELS.map((m) => Math.abs(by[a][m] || 0)));
      const sb = Math.max(...MODELS.map((m) => Math.abs(by[b][m] || 0)));
      if (sort === "signed") {
        const ma = Math.max(...MODELS.map((m) => by[a][m] || 0));
        const mb = Math.max(...MODELS.map((m) => by[b][m] || 0));
        return mb - ma;
      }
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
        })),
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top", labels: { font: { size: 12, weight: "600" } } },
          title: {
            display: true,
            text: "All three models on every item (fair 5-film set)",
            font: { size: 14, weight: "600" },
          },
        },
        scales: {
          x: {
            title: { display: true, text: "Pooled Pearson r" },
            min: -0.35,
            max: 0.4,
            grid: { color: "#eee" },
          },
          y: { ticks: { font: { size: 11 } }, grid: { display: false } },
        },
      },
    });
    el("text-interp").innerHTML =
      "<strong>Interpretation.</strong> Bars are always BERT (grey) · Gemini (teal) · <strong>Grok (purple)</strong> on the <em>same</em> 5 films. " +
      "Grok tracks Gemini closely on valence (PleasantOther ≈ +0.12 both); BERT stays near zero. " +
      "None reaches human-level continuous labeling. TearsOfSteel is the shared strong film for all three (~+0.34–0.47).";
  }

  // ========== Per-film: always 3 models ==========
  function fillItemSelect() {
    const items = [...new Set((DATA.three_way?.rows || DATA.text_multi_item).map((r) => r.item))].sort();
    const sel = el("film-item");
    if (!sel) return;
    sel.innerHTML = items
      .map((i) => `<option value="${i}" ${i === "PleasantOther" ? "selected" : ""}>${i}</option>`)
      .join("");
  }

  function renderFilmThreeWay() {
    const item = el("film-item")?.value || "PleasantOther";
    const tw = DATA.three_way;
    // Prefer fair 5-film per_film from three_way for PleasantOther; else build from text_multi_item
    let labels = [];
    const series = { bert: [], gemini: [], grok: [] };

    if (item === "PleasantOther" && tw?.pleasantother_per_film) {
      labels = tw.pleasantother_per_film.map((r) => r.film);
      MODELS.forEach((m) => {
        series[m] = tw.pleasantother_per_film.map((r) => (r[m] != null ? r[m] : 0));
      });
    } else {
      // from text_multi_item per model
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
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { font: { size: 12, weight: "600" } } },
          title: {
            display: true,
            text: `${item}: BERT · Gemini · Grok on every film`,
            font: { size: 14, weight: "600" },
          },
        },
        scales: {
          y: {
            title: { display: true, text: "Pearson r" },
            min: -0.5,
            max: 0.6,
            grid: { color: "#eee" },
          },
          x: { ticks: { maxRotation: 30, font: { size: 10 } } },
        },
      },
    });

    // pooled note
    if (tw && item === "PleasantOther") {
      const bits = (tw.pleasantother_pooled || [])
        .map((r) => `${L[r.model]}=${r.pooled_r >= 0 ? "+" : ""}${r.pooled_r.toFixed(3)}`)
        .join(" · ");
      if (el("film-pool")) el("film-pool").textContent = "Pooled: " + bits;
    } else if (el("film-pool")) {
      el("film-pool").textContent = "";
    }
    el("film-interp").innerHTML =
      "<strong>Interpretation.</strong> Every film shows <strong>three bars</strong> (BERT / Gemini / Grok). " +
      "Within-film r swings with dialogue density; ToS is the shared positive peak for the LLMs. " +
      "Fair comparison films only when Grok has transcript coverage.";
  }

  // ========== Affective / hits / residual / physio / multimodal / annot (unchanged logic) ==========
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
            backgroundColor: "#1a5f7a",
          },
          {
            label: "Payload null",
            data: rois.map((roi) => {
              const r = DATA.affective_pleasantother.find((x) => x.roi === roi && x.film === "Payload");
              return r ? r.null : null;
            }),
            backgroundColor: "#c5c5c5",
          },
          {
            label: "ToS real",
            data: rois.map((roi) => {
              const r = DATA.affective_pleasantother.find(
                (x) => x.roi === roi && x.film === "TearsOfSteel"
              );
              return r ? r.real : null;
            }),
            backgroundColor: "#0d7377",
          },
          {
            label: "ToS null",
            data: rois.map((roi) => {
              const r = DATA.affective_pleasantother.find(
                (x) => x.roi === roi && x.film === "TearsOfSteel"
              );
              return r ? r.null : null;
            }),
            backgroundColor: "#e0e0e0",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom" } },
        scales: { y: { title: { display: true, text: "LOSO mean r" }, grid: { color: "#eee" } } },
      },
    });
  }

  function renderHits() {
    const hr = DATA.brain_hit_rates;
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
            backgroundColor: labels.map((k) => (k.includes("Payload") ? "#1a5f7a" : "#c44536")),
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
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
          y: { min: 0, max: 100, title: { display: true, text: "% items DECODES" } },
          x: { ticks: { maxRotation: 40, font: { size: 10 } } },
        },
      },
    });
  }

  function renderBrainTable() {
    const film = el("brain-film")?.value || "Payload";
    const roi = el("brain-roi")?.value || "network";
    const only = el("brain-only-hit")?.checked;
    let rows = DATA.brain_multi_item.filter(
      (r) => (film === "all" || r.film === film) && (roi === "all" || r.roi === roi)
    );
    if (only) rows = rows.filter((r) => r.verdict === "DECODES");
    rows.sort((a, b) => b.margin - a.margin);
    const tb = el("brain-table-body");
    if (!tb) return;
    tb.innerHTML = rows
      .slice(0, 80)
      .map(
        (r) => `<tr class="${r.verdict === "DECODES" ? "hit" : "null"}">
        <td>${r.roi}</td><td>${r.film}</td><td>${r.item}</td>
        <td class="num">${r.real > 0 ? "+" : ""}${r.real.toFixed(3)}</td>
        <td class="num">${r.null > 0 ? "+" : ""}${r.null.toFixed(3)}±${r.null_sd.toFixed(3)}</td>
        <td class="num">${r.margin > 0 ? "+" : ""}${r.margin.toFixed(3)}</td>
        <td>${r.verdict}</td></tr>`
      )
      .join("");
    if (el("brain-count"))
      el("brain-count").textContent = `Showing ${Math.min(80, rows.length)} of ${rows.length} tests`;
  }

  function renderResidual() {
    const film = el("resid-film")?.value || "Payload";
    const rows = film === "Payload" ? DATA.residual_payload : DATA.residual_tos;
    destroy("resid");
    charts.resid = new Chart(el("chart-resid"), {
      type: "bar",
      data: {
        labels: rows.map((r) => r.roi),
        datasets: [
          { label: "valence", data: rows.map((r) => r.valence), backgroundColor: "#1a5f7a" },
          { label: "valence − visual", data: rows.map((r) => r.resid), backgroundColor: "#e8a838" },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom" } },
        scales: { y: { title: { display: true, text: "LOSO mean r" } } },
      },
    });
    el("resid-interp").innerHTML =
      film === "Payload"
        ? "<strong>Interpretation.</strong> Payload affective DECODES survive residualizing visual features out of the target."
        : "<strong>Interpretation.</strong> Tears of Steel stays null after residualization.";
  }

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
            backgroundColor: top.map((t) => (t.r >= 0 ? "#1a5f7a" : "#c44536")),
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { title: { display: true, text: "Subject-mean physio vs human item (r)" } },
        },
      },
    });
  }

  function renderMulti() {
    const rows = (DATA.multimodal || []).filter((r) => r.film === "TearsOfSteel");
    destroy("mm");
    charts.mm = new Chart(el("chart-mm"), {
      type: "bar",
      data: {
        labels: rows.map((r) => r.item),
        datasets: [
          { label: "Gemini text", data: rows.map((r) => r.text_gemini), backgroundColor: "#1a5f7a" },
          { label: "vis motion", data: rows.map((r) => r.vis_motion), backgroundColor: "#6b8f71" },
          { label: "aud RMS", data: rows.map((r) => r.aud_rms_energy), backgroundColor: "#e8a838" },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom" } },
        scales: {
          y: { title: { display: true, text: "Univariate r" }, min: -0.6, max: 0.6 },
          x: { ticks: { maxRotation: 40, font: { size: 10 } } },
        },
      },
    });
  }

  function renderAnnot() {
    const rows = (DATA.annotation_top_items || []).slice(0, 15);
    destroy("annot");
    charts.annot = new Chart(el("chart-annot"), {
      type: "bar",
      data: {
        labels: rows.map((r) => r.item),
        datasets: [
          { label: "mean variance", data: rows.map((r) => r.mean_var), backgroundColor: "#1a5f7a" },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
      },
    });
  }

  // wire
  fillItemSelect();
  if (el("text-sort")) el("text-sort").onchange = renderTextThreeWay;
  if (el("film-item")) el("film-item").onchange = renderFilmThreeWay;
  if (el("brain-film")) el("brain-film").onchange = renderBrainTable;
  if (el("brain-roi")) el("brain-roi").onchange = renderBrainTable;
  if (el("brain-only-hit")) el("brain-only-hit").onchange = renderBrainTable;
  if (el("resid-film")) el("resid-film").onchange = renderResidual;

  renderThreeWayHero();
  renderTextThreeWay();
  renderFilmThreeWay();
  renderAffective();
  renderHits();
  renderBrainTable();
  renderResidual();
  renderPhysio();
  renderMulti();
  renderAnnot();
})();
