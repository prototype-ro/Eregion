"use client";

const CAVEATS: Array<{ name: string; url: string; note: string; status: "ok" | "watch" }> = [
  { name: "Order your data", url: "https://www.data-to-viz.com/caveat/order_data.html", note: "Roles and clusters are always sorted by count, so the shape reads at a glance.", status: "ok" },
  { name: "The pie chart", url: "https://www.data-to-viz.com/caveat/pie.html", note: "No pies anywhere. Composition is a field or a stream, not angles.", status: "ok" },
  { name: "The rainbow palette", url: "https://www.data-to-viz.com/caveat/rainbow.html", note: "One accent plus texture. Role hues are semantic, never a numeric ramp.", status: "ok" },
  { name: "The spaghetti chart", url: "https://www.data-to-viz.com/caveat/spaghetti.html", note: "Watch the River and the Bump: past ~8 lines they tangle. Small multiples is the fallback.", status: "watch" },
  { name: "Overplotting", url: "https://www.data-to-viz.com/caveat/overplotting.html", note: "Watch the Night sky and Voronoi: at 100 dots it is fine, but a 500-card format would smear.", status: "watch" },
  { name: "Too many distributions", url: "https://www.data-to-viz.com/caveat/multi_distribution.html", note: "The ridgeline stacks a distribution per version; beyond ~20 it turns to mush.", status: "watch" },
  { name: "Cut the y-axis?", url: "https://www.data-to-viz.com/caveat/cut_y_axis.html", note: "The terrain and bump always start at zero.", status: "ok" },
  { name: "Dual axis", url: "https://www.data-to-viz.com/caveat/dual_axis.html", note: "No twin axes. Each metric gets its own panel.", status: "ok" },
  { name: "The boxplot hides data", url: "https://www.data-to-viz.com/caveat/boxplot.html", note: "We show raw dots, not summaries.", status: "ok" },
  { name: "Small multiples, which way?", url: "https://www.data-to-viz.com/caveat/small_multiple.html", note: "Versions read left to right, top to bottom, like text.", status: "ok" },
];

/**
 * The discipline check: the caveats from From Data to Viz, each with a verdict for this lab. Read it before
 * any new panel ships. Links open the original page.
 */
export function Caveats() {
  return (
    <section className="rounded-[28px] border border-line p-6">
      <h2 className="font-display text-3xl leading-none">Caveats</h2>
      <p className="mt-2 mb-5 max-w-[70ch] text-sm text-muted">
        The common mistakes from <a href="https://www.data-to-viz.com/caveats.html" target="_blank" rel="noreferrer" className="text-accent-text underline underline-offset-4">From Data to Viz</a>, each with how this lab stands. Green is clean; amber is a known limit.
      </p>
      <ul className="grid gap-x-10 gap-y-3 sm:grid-cols-2">
        {CAVEATS.map((caveat) => (
          <li key={caveat.name} className="flex gap-3">
            <span aria-hidden="true" className={`mt-1.5 size-2.5 shrink-0 rounded-full ${caveat.status === "ok" ? "bg-accent-text" : "bg-danger"}`} />
            <div className="min-w-0">
              <a href={caveat.url} target="_blank" rel="noreferrer" className="text-[15px] underline underline-offset-4 decoration-line hover:decoration-ink">
                {caveat.name}
              </a>
              <p className="mt-0.5 text-sm text-muted">{caveat.note}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
