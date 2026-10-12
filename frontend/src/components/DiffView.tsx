import { ManaCost } from "@/components/Mana";
import type { CardChange, DeckDiff, PrintingChange, QuantityChange, TagChange } from "@/lib/types";
import { knownRoles } from "@/lib/roles";

function signed(value: number, digits = 0): string {
  if (value === 0) return "no change";
  const text = Math.abs(value).toFixed(digits);
  return value > 0 ? `up ${text}` : `down ${text}`;
}

function BoardTag({ board }: { board: string }) {
  if (board === "main") return null;
  return <span className="rounded-full border border-line px-2.5 py-0.5 text-xs text-muted capitalize">{board}</span>;
}

function ChangeList({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <section>
      <h3 className="border-b border-line pb-3.5 text-[15px] text-muted">{title}</h3>
      {children.length === 0 ? <p className="py-5 text-muted">{empty}</p> : <ul>{children}</ul>}
    </section>
  );
}

function Added({ change }: { change: CardChange }) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-line py-4 text-xl last:border-b-0">
      <span className="flex flex-wrap items-center gap-2.5">
        {change.name}
        {change.quantity > 1 && <span className="font-mono text-sm text-muted">{change.quantity}x</span>}
        <BoardTag board={change.board} />
      </span>
      <span className="text-sm text-add-text"><ManaCost cost={change.manaCost} empty="no cost" /></span>
    </li>
  );
}

function Removed({ change }: { change: CardChange }) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-line py-4 text-xl text-muted last:border-b-0">
      <span className="flex flex-wrap items-center gap-2.5 line-through">
        {change.name}
        {change.quantity > 1 && <span className="font-mono text-sm">{change.quantity}x</span>}
        <BoardTag board={change.board} />
      </span>
      <span className="text-sm"><ManaCost cost={change.manaCost} empty="no cost" /></span>
    </li>
  );
}

function Changed({ change }: { change: QuantityChange }) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-line py-4 text-xl last:border-b-0">
      <span className="flex flex-wrap items-center gap-2.5">
        {change.name}
        <BoardTag board={change.board} />
      </span>
      <span className="font-mono text-sm text-muted">
        {change.from} to <span className="text-ink">{change.to}</span>
      </span>
    </li>
  );
}

function Reprinted({ change }: { change: PrintingChange }) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-line py-4 text-xl last:border-b-0">
      <span className="flex flex-wrap items-center gap-2.5">
        {change.name}
        <BoardTag board={change.board} />
      </span>
      <span className="font-mono text-sm text-muted">
        {change.from} to <span className="text-ink">{change.to}</span>
      </span>
    </li>
  );
}

function Retagged({ change }: { change: TagChange }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line py-4 text-xl last:border-b-0">
      <span className="flex flex-wrap items-center gap-2.5">
        {change.name}
        <BoardTag board={change.board} />
      </span>
      <span className="flex flex-wrap gap-1.5 font-mono text-sm">
        {change.added.map((tag) => (
          <span key={`+${tag}`} className="rounded-full border border-add-line px-2.5 py-0.5 text-add-text">
            + {tag}
          </span>
        ))}
        {change.removed.map((tag) => (
          <span key={`-${tag}`} className="rounded-full border border-line px-2.5 py-0.5 text-muted line-through">
            {tag}
          </span>
        ))}
      </span>
    </li>
  );
}

export function DiffView({ diff }: { diff: DeckDiff }) {
  const { stats } = diff;
  // Changes in what the cards do, such as +2 Ramp, -1 Removal. Cards with no known role are not a change worth reporting.
  const roleChanges = knownRoles(stats.roleDelta);
  const maxCurve = Math.max(...stats.from.curve, ...stats.to.curve, 1);

  const tiles: Array<{ label: string; value: string; note: string; accent: boolean }> = [
    {
      label: "Average mana value",
      value: stats.to.averageManaValue.toFixed(2),
      note: `${signed(stats.averageManaValueDelta, 2)} from ${stats.from.averageManaValue.toFixed(2)}`,
      accent: stats.averageManaValueDelta !== 0,
    },
    {
      label: "Cards",
      value: String(stats.to.totalCards),
      note: `${signed(stats.totalDelta)} from ${stats.from.totalCards}`,
      accent: false,
    },
    {
      label: "Lands",
      value: String(stats.to.lands),
      note: `${signed(stats.landsDelta)} from ${stats.from.lands}`,
      accent: false,
    },
    {
      label: "Owned",
      value: `${stats.to.owned} of ${stats.to.totalCards}`,
      note: `${stats.to.missing} still needed`,
      accent: false,
    },
  ];

  return (
    <div className="flex flex-col gap-16">
      <div className="grid gap-x-14 gap-y-10 md:grid-cols-2">
        <ChangeList title={`Added in v${diff.toVersion}`} empty="No cards added.">
          {diff.added.map((change) => (
            <Added key={`${change.cardId}|${change.board}`} change={change} />
          ))}
        </ChangeList>
        <ChangeList title={`Removed from v${diff.fromVersion}`} empty="No cards removed.">
          {diff.removed.map((change) => (
            <Removed key={`${change.cardId}|${change.board}`} change={change} />
          ))}
        </ChangeList>
      </div>

      {diff.changed.length > 0 && (
        <ChangeList title="Quantity changed" empty="">
          {diff.changed.map((change) => (
            <Changed key={`${change.cardId}|${change.board}`} change={change} />
          ))}
        </ChangeList>
      )}

      {diff.printings.length > 0 && (
        <ChangeList title="Printing changed" empty="">
          {diff.printings.map((change) => (
            <Reprinted key={`${change.cardId}|${change.board}`} change={change} />
          ))}
        </ChangeList>
      )}

      {diff.tags.length > 0 && (
        <ChangeList title="Tags changed" empty="">
          {diff.tags.map((change) => (
            <Retagged key={`${change.cardId}|${change.board}`} change={change} />
          ))}
        </ChangeList>
      )}

      <section aria-label="Stat shift">
        <h2 className="mb-6 font-display text-[clamp(48px,6vw,80px)] leading-none">Stat shift</h2>
        <dl className="grid border-y border-line sm:grid-cols-2 lg:grid-cols-4">
          {tiles.map((tile) => (
            <div key={tile.label} className="border-line px-0 py-8 sm:px-7 lg:border-l lg:first:border-l-0 lg:first:pl-0">
              <dt className="text-[15px] text-muted">{tile.label}</dt>
              <dd className="mt-2.5 text-[clamp(44px,4.6vw,72px)] leading-none font-medium tracking-[-0.045em] whitespace-nowrap">
                {tile.value}
              </dd>
              <dd className={`mt-2.5 font-mono text-sm ${tile.accent ? "text-accent-text" : "text-muted"}`}>{tile.note}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="grid gap-x-14 gap-y-12 lg:grid-cols-[1.6fr_1fr]">
        <section aria-label="Mana curve">
          <div className="mb-7 flex flex-wrap items-center justify-between gap-3 text-[15px] text-muted">
            <h3>Mana curve</h3>
            <p className="flex gap-5">
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-muted" />v{diff.fromVersion}
              </span>
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-accent-text" />v{diff.toVersion}
              </span>
            </p>
          </div>
          <div className="flex h-[200px] items-end gap-3.5 border-b border-line">
            {stats.to.curve.map((toCount, value) => {
              const fromCount = stats.from.curve[value] ?? 0;
              return (
                <div key={value} className="flex h-full min-w-0 flex-1 items-end justify-center gap-1">
                  <div className="w-[34%] rounded-t-md bg-muted opacity-60" style={{ height: `${Math.round((fromCount / maxCurve) * 170)}px` }} />
                  <div className="w-[34%] rounded-t-md bg-accent-text" style={{ height: `${Math.round((toCount / maxCurve) * 170)}px` }} />
                </div>
              );
            })}
          </div>
          <div className="mt-2.5 flex gap-3.5 font-mono text-[13px] text-muted">
            {stats.to.curve.map((_, value) => (
              <span key={value} className="min-w-0 flex-1 text-center">
                {value === 6 ? "6+" : value}
              </span>
            ))}
          </div>
        </section>

        <section aria-label="Type changes">
          <h3 className="border-b border-line pb-3.5 text-[15px] text-muted">Card types</h3>
          {Object.keys(stats.typeDelta).length === 0 ? (
            <p className="py-5 text-muted">Same mix of types.</p>
          ) : (
            <ul>
              {Object.entries(stats.typeDelta).map(([type, delta]) => (
                <li key={type} className="flex justify-between py-3.5 text-lg">
                  <span>{type}</span>
                  <span className="font-mono text-sm text-accent-text">{delta > 0 ? `+${delta}` : delta}</span>
                </li>
              ))}
            </ul>
          )}
          {roleChanges.length > 0 && (
            <>
              <h3 className="mt-8 border-b border-line pb-3.5 text-[15px] text-muted">Roles</h3>
              <p className="py-3.5 text-lg" aria-label="Role changes">
                {roleChanges.map(([role, delta], index) => (
                  <span key={role}>
                    {index > 0 && ", "}
                    <span className="font-mono text-sm text-accent-text">{delta > 0 ? `+${delta}` : delta}</span> {role}
                  </span>
                ))}
              </p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
