/* Interactive explore dashboard — Chart.js + explore_bundle.json */
(async function () {
  const el = (id) => document.getElementById(id);
  const status = el("load-status");
  let DATA = null;
  const charts = {};

  function destroy(name) {
    if (charts[name]) {
      charts[name].destroy();
      delete charts[name];
    }
  }

  try {
    const res = await fetch("data/explore_bundle.json", { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    DATA = await res.json();
    if (status) status.remove();
  } catch (e) {
    if (status) status.textContent = "Could not load data/explore_bundle.json: " + e.message;
    return;
  }

  // --- Text multi-item bar (model + sort) ---
  function renderTextChart() {
    const model = el("text-model").value;
    const sort = el("text-sort").value;
    let rows = DATA.text_multi_item.filter((r) => r.model === model);
    rows = rows.slice().sort((a, b) =>
      sort === "abs" ? Math.abs(b.r) - Math.abs(a.r) : b.r - a.r
    );
    const top = rows.slice(0, 25);
    const labels = top.map((r) => r.item);
    const vals = top.map((r) => r.r);
    const colors = vals.map((v) => (v >= 0 ? "#1a5f7a" : "#a33"));
    destroy("text");
    charts.text = new Chart(el("chart-text"), {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: model === "gemini" ? "Gemini pooled r" : "BERT pooled r",
          data: vals,
          backgroundColor: colors,
          borderWidth: 0,
        }],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              afterLabel(ctx) {
                const r = top[ctx.dataIndex];
                return `CI [${r.ci[0]}, ${r.ci[1]}] · ${r.n_films} films · ${r.n_s}s`;
              },
            },
          },
        },
        scales: {
          x: {
            title: { display: true, text: "Pooled Pearson r (12 films)" },
            min: -0.35,
            max: 0.35,
            grid: { color: "#eee" },
          },
          y: { ticks: { font: { size: 11 } }, grid: { display: false } },
        },
      },
    });
    el("text-interp").innerHTML =
      model === "gemini"
        ? "<strong>Interpretation.</strong> Gemini’s strongest absolute associations are a mix of positive valence/social items (PleasantOther, Happiness, SocialNorms) and anti-correlations with oppositional/action items (Oppose, Tackle). Absolute |r| stays modest (≲0.22): dialogue transformers track continuous human affect only weakly and unevenly. Film-block CIs that exclude 0 are more trustworthy than single-film peaks."
        : "<strong>Interpretation.</strong> BERT |r| stays near the noise floor for almost every item (top |r| ≲ 0.10). Per-segment bag-of-segment classifiers do not recover continuous human consensus under this naturalistic, dialogue-only pipeline—consistent with the multi-film pool near zero for PleasantOther.";
  }

  // --- Per-film text for selected item ---
  function fillItemSelect() {
    const items = [...new Set(DATA.text_multi_item.map((r) => r.item))].sort();
    const sel = el("film-item");
    sel.innerHTML = items
      .map((i) => `<option value="${i}" ${i === "PleasantOther" ? "selected" : ""}>${i}</option>`)
      .join("");
  }

  function renderFilmChart() {
    const item = el("film-item").value;
    const model = el("film-model").value;
    const row = DATA.text_multi_item.find((r) => r.model === model && r.item === item);
    if (!row) return;
    const pf = (row.per_film || []).filter((p) => p.r != null);
    destroy("film");
    charts.film = new Chart(el("chart-film"), {
      type: "bar",
      data: {
        labels: pf.map((p) => p.film),
        datasets: [{
          label: `${model} r vs ${item}`,
          data: pf.map((p) => p.r),
          backgroundColor: pf.map((p) => (p.r >= 0 ? "#1a5f7a" : "#c44536")),
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              afterLabel(ctx) {
                return `n seconds (finite pair) ≈ ${pf[ctx.dataIndex].n}`;
              },
            },
          },
        },
        scales: {
          y: {
            title: { display: true, text: "Pearson r (within film)" },
            min: -0.6,
            max: 0.7,
            grid: { color: "#eee" },
          },
          x: { ticks: { maxRotation: 45, minRotation: 30, font: { size: 10 } } },
        },
      },
    });
    el("film-pool").textContent =
      `Pooled r = ${row.r > 0 ? "+" : ""}${row.r.toFixed(3)} · 95% film-block CI [${row.ci[0]}, ${row.ci[1]}] · ${row.n_films} films`;
    el("film-interp").innerHTML =
      "<strong>Interpretation.</strong> Within-film correlations swing widely—dialogue density, contamination, and film character dominate. That is why the project reports <em>pooled</em> r with film-block bootstrap rather than averaging optimistic single-film peaks. Sparse-dialogue or song-heavy films can sit near zero even when dialogue-dense films look positive.";
  }

  // --- Affective ROI grouped ---
  function renderAffective() {
    const rois = ["network", "insula", "vmpfc", "amygdala"];
    const films = ["Payload", "TearsOfSteel"];
    const realP = rois.map((roi) => {
      const r = DATA.affective_pleasantother.find((x) => x.roi === roi && x.film === "Payload");
      return r ? r.real : null;
    });
    const nullP = rois.map((roi) => {
      const r = DATA.affective_pleasantother.find((x) => x.roi === roi && x.film === "Payload");
      return r ? r.null : null;
    });
    const realT = rois.map((roi) => {
      const r = DATA.affective_pleasantother.find((x) => x.roi === roi && x.film === "TearsOfSteel");
      return r ? r.real : null;
    });
    const nullT = rois.map((roi) => {
      const r = DATA.affective_pleasantother.find((x) => x.roi === roi && x.film === "TearsOfSteel");
      return r ? r.null : null;
    });
    destroy("aff");
    charts.aff = new Chart(el("chart-aff"), {
      type: "bar",
      data: {
        labels: rois,
        datasets: [
          { label: "Payload real", data: realP, backgroundColor: "#1a5f7a" },
          { label: "Payload null", data: nullP, backgroundColor: "#c5c5c5" },
          { label: "ToS real", data: realT, backgroundColor: "#0d7377" },
          { label: "ToS null", data: nullT, backgroundColor: "#e0e0e0" },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom" } },
        scales: {
          y: { title: { display: true, text: "LOSO mean r" }, grid: { color: "#eee" } },
        },
      },
    });
  }

  // --- Hit rates ---
  function renderHits() {
    const hr = DATA.brain_hit_rates;
    const labels = Object.keys(hr).sort();
    destroy("hits");
    charts.hits = new Chart(el("chart-hits"), {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: "% DECODES",
          data: labels.map((k) => 100 * hr[k].rate),
          backgroundColor: labels.map((k) =>
            k.includes("Payload") ? "#1a5f7a" : "#c44536"
          ),
        }],
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

  // --- Multi-item brain table filter ---
  function renderBrainTable() {
    const film = el("brain-film").value;
    const roi = el("brain-roi").value;
    const only = el("brain-only-hit").checked;
    let rows = DATA.brain_multi_item.filter(
      (r) => (film === "all" || r.film === film) && (roi === "all" || r.roi === roi)
    );
    if (only) rows = rows.filter((r) => r.verdict === "DECODES");
    rows.sort((a, b) => b.margin - a.margin);
    const tb = el("brain-table-body");
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
    el("brain-count").textContent = `Showing ${Math.min(80, rows.length)} of ${rows.length} tests`;
  }

  // --- Residual scatter-style paired bars ---
  function renderResidual() {
    const film = el("resid-film").value;
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
        ? "<strong>Interpretation.</strong> On Payload, residualizing low-level visual features out of the <em>target</em> barely moves LOSO r. That argues the small affective DECODES are not an artifact of valence being linearly predictable from luminance/motion/etc. in the annotation stream."
        : "<strong>Interpretation.</strong> On Tears of Steel, residualization does not turn a null into a clean DECODES pattern. The elevated shift-null on this visual film remains the right comparison—not zero.";
  }

  // --- Physio ---
  function renderPhysio() {
    const top = DATA.physio_top.slice(0, 15);
    destroy("phys");
    charts.phys = new Chart(el("chart-phys"), {
      type: "bar",
      data: {
        labels: top.map((t) => `${t.film.slice(0, 3)}|${t.channel}|${t.item}`),
        datasets: [{
          label: "r",
          data: top.map((t) => t.r),
          backgroundColor: top.map((t) => (t.r >= 0 ? "#1a5f7a" : "#c44536")),
        }],
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

  // --- Multimodal ToS ---
  function renderMulti() {
    const rows = DATA.multimodal.filter((r) => r.film === "TearsOfSteel");
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

  // --- Annotation variance ---
  function renderAnnot() {
    const rows = DATA.annotation_top_items.slice(0, 15);
    destroy("annot");
    charts.annot = new Chart(el("chart-annot"), {
      type: "bar",
      data: {
        labels: rows.map((r) => r.item),
        datasets: [{
          label: "mean variance",
          data: rows.map((r) => r.mean_var),
          backgroundColor: "#1a5f7a",
        }],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              afterLabel(ctx) {
                const r = rows[ctx.dataIndex];
                return `median acf 1/e lag ≈ ${r.median_acf_1e_lag_s}s`;
              },
            },
          },
        },
      },
    });
  }

  // wire
  fillItemSelect();
  el("text-model").onchange = renderTextChart;
  el("text-sort").onchange = renderTextChart;
  el("film-item").onchange = renderFilmChart;
  el("film-model").onchange = renderFilmChart;
  el("brain-film").onchange = renderBrainTable;
  el("brain-roi").onchange = renderBrainTable;
  el("brain-only-hit").onchange = renderBrainTable;
  el("resid-film").onchange = renderResidual;

  renderTextChart();
  renderFilmChart();
  renderAffective();
  renderHits();
  renderBrainTable();
  renderResidual();
  renderPhysio();
  renderMulti();
  renderAnnot();
})();
