"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { ManaCost } from "@/components/Mana";
import { api } from "@/lib/api";
import { formatPrice } from "@/lib/links";
import { buildQuery, COLORS, COMPARES, emptyForm, identityPicks, RARITIES, type Color, type Compare, type Numeric, type SearchForm } from "@/lib/searchQuery";
import type { Board, Card } from "@/lib/types";
import { btn, field } from "@/lib/ui";
import { useAdvancedSearch } from "@/lib/useAdvancedSearch";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Ids of cards already in the deck, to mark them and to hide them on request. */
  inDeck: Set<string>;
  /** The commander's color identity ("WUB"), so one click can search inside it. Null when there is no commander. */
  commanderIdentity: string | null;
  onAdd: (card: Card, board?: Board) => void;
  onSetCommander: (card: Card) => void;
  /** Opens the deck as editable text, on top of this window. */
  onEditList: () => void;
}

const SORTS: Array<[string, string]> = [
  ["name", "Name"],
  ["edhrec", "Popularity"],
  ["cmc", "Mana value"],
  ["usd", "Price"],
  ["rarity", "Rarity"],
  ["released", "Release date"],
  ["color", "Color"],
];

const VIEW_KEY = "eregion-advanced-view";
type View = "list" | "gallery";

const label = "text-sm text-muted";
const select = `${field.md} !w-auto`;

function Pips({ value, onChange, name }: { value: Color[]; onChange: (next: Color[]) => void; name: string }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={name}>
      {COLORS.map((color) => {
        const on = value.includes(color);
        return (
          <button
            key={color}
            type="button"
            aria-pressed={on}
            aria-label={color === "C" ? "Colorless" : { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" }[color]}
            onClick={() => onChange(on ? value.filter((picked) => picked !== color) : [...value, color])}
            className={`inline-flex size-9 items-center justify-center rounded-full border text-lg transition-colors [@media(pointer:coarse)]:size-11 ${
              on ? "border-accent-text bg-surface-2" : "border-line opacity-60 hover:opacity-100"
            }`}
          >
            <ManaCost cost={`{${color}}`} />
          </button>
        );
      })}
    </div>
  );
}

function Compared({ id, name, value, onChange, placeholder }: { id: string; name: string; value: Numeric; onChange: (next: Numeric) => void; placeholder?: string }) {
  return (
    <div className="flex gap-2">
      <select aria-label={`${name}, comparison`} value={value.op} onChange={(event) => onChange({ ...value, op: event.target.value as Compare })} className={select}>
        {COMPARES.map((op) => (
          <option key={op} value={op}>
            {op}
          </option>
        ))}
      </select>
      <input id={id} inputMode="decimal" value={value.value} placeholder={placeholder} onChange={(event) => onChange({ ...value, value: event.target.value })} className={field.md} />
    </div>
  );
}

function Row({ name, htmlFor, children }: { name: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className={label}>
        {name}
      </label>
      {children}
    </div>
  );
}

/**
 * Search every card in Scryfall by what is on it: type, colors, mana value, rules text and more, plus Eregion's own role.
 * The form writes the search in Scryfall's syntax, which is shown and can be edited before searching.
 */
export function AdvancedSearch({ open, onClose, inDeck, commanderIdentity, onAdd, onSetCommander, onEditList }: Props) {
  const [form, setForm] = useState<SearchForm>(emptyForm);
  const [edited, setEdited] = useState<string | null>(null);
  const [legal, setLegal] = useState(true);
  const [role, setRole] = useState("");
  const [order, setOrder] = useState("name");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [hideInDeck, setHideInDeck] = useState(false);
  const [roles, setRoles] = useState<string[]>([]);
  const [view, setView] = useState<View>("list");
  const found = useAdvancedSearch();

  useEffect(() => {
    try {
      if (localStorage.getItem(VIEW_KEY) === "gallery") setView("gallery");
    } catch {
      // Keep the list.
    }
  }, []);
  function chooseView(next: View) {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Not remembered.
    }
  }

  useEffect(() => {
    if (!open || roles.length > 0) return;
    api<string[]>("/api/cards/roles").then(setRoles).catch(() => {
      // The role filter is an extra. The search works without it.
    });
  }, [open, roles.length]);

  const generated = useMemo(() => buildQuery(form), [form]);
  const syntax = edited ?? generated;
  const update = (patch: Partial<SearchForm>) => {
    setForm((previous) => ({ ...previous, ...patch }));
    setEdited(null);
  };
  const canSearch = syntax.trim().length > 0 || role !== "";
  const visible = hideInDeck ? found.cards.filter((card) => !inDeck.has(card.id)) : found.cards;

  function submit(event?: React.FormEvent) {
    event?.preventDefault();
    if (canSearch) void found.search({ q: syntax, legal, role, order, dir });
  }

  return (
    <Dialog open={open} onClose={onClose} label="Advanced search" size="lg">
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-[44px] leading-none">Advanced search</h2>
          <button type="button" onClick={onEditList} className={btn.secondary}>
            Edit list
          </button>
        </div>
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
          <form onSubmit={submit} className="flex flex-col gap-4 lg:max-h-[68vh] lg:overflow-auto lg:pr-2">
            <Row name="Card name" htmlFor="adv-name">
              <input id="adv-name" value={form.name} onChange={(event) => update({ name: event.target.value })} className={field.md} />
            </Row>
            <Row name="Type" htmlFor="adv-type">
              <input id="adv-type" value={form.type} placeholder="legendary creature, dragon" onChange={(event) => update({ type: event.target.value })} className={field.md} />
            </Row>
            <Row name="Rules text" htmlFor="adv-text">
              <input id="adv-text" value={form.text} placeholder={'flying "draw a card"'} onChange={(event) => update({ text: event.target.value })} className={field.md} />
              <p className="text-xs text-muted">Put exact phrases in quotes. A minus in front means without.</p>
            </Row>
            <Row name="Role in a deck" htmlFor="adv-role">
              <select id="adv-role" value={role} onChange={(event) => setRole(event.target.value)} className={`${field.md}`}>
                <option value="">Any</option>
                {roles.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </Row>
            <Row name="Colors">
              <Pips name="Colors" value={form.colors} onChange={(colors) => update({ colors })} />
              <select aria-label="How to match the colors" value={form.colorMode} onChange={(event) => update({ colorMode: event.target.value as SearchForm["colorMode"] })} className={select}>
                <option value="all">Must have all selected</option>
                <option value="any">Any of the selected</option>
                <option value="exact">Exactly these</option>
              </select>
            </Row>
            <Row name="Color identity">
              <Pips name="Color identity" value={form.identity} onChange={(identity) => update({ identity })} />
              <div className="flex flex-wrap gap-2">
                <select aria-label="How to match the identity" value={form.identityMode} onChange={(event) => update({ identityMode: event.target.value as SearchForm["identityMode"] })} className={select}>
                  <option value="within">Fits inside these (for a deck)</option>
                  <option value="includes">Includes these</option>
                  <option value="exact">Exactly these</option>
                </select>
                {commanderIdentity !== null && (
                  <button type="button" onClick={() => update({ identity: identityPicks(commanderIdentity), identityMode: "within" })} className={btn.secondary}>
                    My commander&rsquo;s colors
                  </button>
                )}
              </div>
            </Row>
            <Row name="Mana value" htmlFor="adv-mv">
              <Compared id="adv-mv" name="Mana value" value={form.manaValue} onChange={(manaValue) => update({ manaValue })} />
            </Row>
            <Row name="Mana cost" htmlFor="adv-cost">
              <input id="adv-cost" value={form.manaCost} placeholder="{2}{G} or 2G" onChange={(event) => update({ manaCost: event.target.value })} className={field.md} />
            </Row>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Row name="Power" htmlFor="adv-pow">
                <Compared id="adv-pow" name="Power" value={form.power} onChange={(power) => update({ power })} />
              </Row>
              <Row name="Toughness" htmlFor="adv-tou">
                <Compared id="adv-tou" name="Toughness" value={form.toughness} onChange={(toughness) => update({ toughness })} />
              </Row>
            </div>
            <Row name="Price in dollars" htmlFor="adv-price">
              <Compared id="adv-price" name="Price" value={form.price} onChange={(price) => update({ price })} placeholder="5" />
            </Row>
            <Row name="Rarity">
              <div className="flex flex-wrap gap-1.5">
                {RARITIES.map((rarity) => {
                  const on = form.rarity.includes(rarity);
                  return (
                    <button
                      key={rarity}
                      type="button"
                      aria-pressed={on}
                      onClick={() => update({ rarity: on ? form.rarity.filter((picked) => picked !== rarity) : [...form.rarity, rarity] })}
                      className={`min-h-9 rounded-full border px-3 text-[13px] capitalize transition-colors [@media(pointer:coarse)]:min-h-11 ${on ? "border-accent-text text-accent-text" : "border-line text-muted hover:text-ink"}`}
                    >
                      {rarity}
                    </button>
                  );
                })}
              </div>
            </Row>
            <Row name="Sort by" htmlFor="adv-order">
              <div className="flex gap-2">
                <select id="adv-order" value={order} onChange={(event) => setOrder(event.target.value)} className={field.md}>
                  {SORTS.map(([value, text]) => (
                    <option key={value} value={value}>
                      {text}
                    </option>
                  ))}
                </select>
                <select aria-label="Direction" value={dir} onChange={(event) => setDir(event.target.value as "asc" | "desc")} className={select}>
                  <option value="asc">Ascending</option>
                  <option value="desc">Descending</option>
                </select>
              </div>
            </Row>
            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" checked={legal} onChange={(event) => setLegal(event.target.checked)} className="size-5 accent-[var(--accent-text)]" />
              Only cards legal in Commander
            </label>
            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" checked={hideInDeck} onChange={(event) => setHideInDeck(event.target.checked)} className="size-5 accent-[var(--accent-text)]" />
              Hide cards already in the deck
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={() => { setForm(emptyForm()); setEdited(null); setRole(""); }} className={btn.quiet}>
                Clear
              </button>
              <button type="submit" disabled={!canSearch || found.loading} className={`${btn.primary} flex-1`}>
                {found.loading ? "Searching" : "Search"}
              </button>
            </div>
          </form>

          <div className="flex min-w-0 flex-col gap-4">
            <form onSubmit={submit} className="flex flex-col gap-1.5">
              <label htmlFor="adv-syntax" className={label}>
                Search syntax
              </label>
              <input id="adv-syntax" value={syntax} onChange={(event) => setEdited(event.target.value)} spellCheck={false} placeholder="t:dragon c:r mv<=5" className={`${field.md} font-mono [font-variant-ligatures:none]`} />
              <p className="text-xs text-muted">
                The form writes this for you. Type here for anything the form does not cover, such as <span className="font-mono">is:commander</span> or{" "}
                <span className="font-mono">keyword:flying</span>.
              </p>
            </form>

            <div className="flex items-center justify-between gap-3">
              <div aria-live="polite" className="min-h-6 text-sm text-muted">
                {found.error ? <span role="alert" className="text-danger">{found.error}</span> : found.searched ? `${found.total.toLocaleString()} ${found.total === 1 ? "card" : "cards"} found` : ""}
              </div>
              <div role="group" aria-label="View" className="inline-flex shrink-0 rounded-full border border-line p-0.5">
                {(["list", "gallery"] as const).map((name) => (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={view === name}
                    onClick={() => chooseView(name)}
                    className={`min-h-8 rounded-full px-4 text-[13px] capitalize transition-colors [@media(pointer:coarse)]:min-h-10 ${view === name ? "bg-ink text-bg" : "text-muted hover:text-ink"}`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>

            <div className="lg:max-h-[56vh] lg:overflow-auto">
              {!found.searched && !found.loading && <p className="py-6 text-muted">Pick a few filters and search. Results can be added to the deck from here.</p>}
              {found.searched && visible.length === 0 && !found.loading && <p className="py-6 text-muted">No card matches those filters.</p>}
              {view === "list" ? (
                <ul className="divide-y divide-line">
                  {visible.map((card) => (
                    <Result key={card.id} card={card} already={inDeck.has(card.id)} onAdd={onAdd} onSetCommander={onSetCommander} />
                  ))}
                </ul>
              ) : (
                <ul className="grid grid-cols-2 gap-x-4 gap-y-6 pb-2 sm:grid-cols-3">
                  {visible.map((card) => (
                    <Tile key={card.id} card={card} already={inDeck.has(card.id)} onAdd={onAdd} onSetCommander={onSetCommander} />
                  ))}
                </ul>
              )}
              {found.hasMore && (
                <div className="py-4">
                  <button type="button" onClick={found.more} disabled={found.loading} className={btn.secondary}>
                    {found.loading ? "Loading" : "Show more"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function Result({ card, already, onAdd, onSetCommander }: { card: Card; already: boolean; onAdd: Props["onAdd"]; onSetCommander: Props["onSetCommander"] }) {
  const legendary = card.typeLine.includes("Legendary") && card.typeLine.includes("Creature");
  return (
    <li className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-4 gap-y-2 py-3 sm:grid-cols-[72px_minmax(0,1fr)_auto]">
      <div className="relative h-[52px] w-[72px] overflow-hidden rounded-xl bg-surface-2">
        {card.imageArtCrop && <Image src={card.imageArtCrop} alt="" fill sizes="72px" className="object-cover" />}
      </div>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[16px] font-medium">
          {card.name}
          <ManaCost cost={card.manaCost} className="text-[15px]" />
          {already && <span className="rounded-full border border-line px-2 py-px text-xs font-normal text-muted">In deck</span>}
          {card.role && <span className="rounded-full border border-line px-2 py-px text-xs font-normal text-muted">{card.role}</span>}
        </p>
        <p className="mt-0.5 font-mono text-xs text-muted">
          {card.typeLine}
          {card.priceUsd !== null && <> &middot; {formatPrice(card.priceUsd)}</>}
        </p>
        {card.oracleText && <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-muted">{card.oracleText}</p>}
      </div>
      <div className="col-span-2 flex flex-wrap gap-2 sm:col-span-1 sm:flex-col sm:items-stretch">
        <button type="button" onClick={() => onAdd(card)} className={btn.primary}>
          {already ? "Add another" : "Add"}
        </button>
        <button type="button" onClick={() => onAdd(card, "maybe")} className={btn.secondary}>
          Maybe
        </button>
        {legendary && (
          <button type="button" onClick={() => onSetCommander(card)} className={btn.quiet}>
            Commander
          </button>
        )}
      </div>
    </li>
  );
}

/** One result as a card picture, with its price and the buttons under it, for browsing by how the cards look. */
function Tile({ card, already, onAdd, onSetCommander }: { card: Card; already: boolean; onAdd: Props["onAdd"]; onSetCommander: Props["onSetCommander"] }) {
  const legendary = card.typeLine.includes("Legendary") && card.typeLine.includes("Creature");
  return (
    <li className="flex min-w-0 flex-col gap-2">
      <div className="relative aspect-[488/680] overflow-hidden rounded-[14px] bg-surface-2">
        {card.imageNormal ? (
          <Image src={card.imageNormal} alt={card.name} fill sizes="(min-width: 1024px) 200px, 45vw" className="object-cover" />
        ) : (
          <p className="flex h-full items-center justify-center p-3 text-center text-sm text-muted">{card.name}</p>
        )}
        {already && <span className="absolute top-2 left-2 rounded-full bg-bg/85 px-2.5 py-0.5 text-xs text-ink backdrop-blur">In deck</span>}
      </div>
      <p className="flex items-baseline justify-between gap-2 text-[13px]">
        <span className="min-w-0 truncate" title={card.name}>
          {card.name}
        </span>
        <span className="shrink-0 font-mono text-xs text-muted">{card.priceUsd !== null ? formatPrice(card.priceUsd) : ""}</span>
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => onAdd(card)} className={btn.primary}>
          {already ? "Another" : "Add"}
        </button>
        <button type="button" onClick={() => onAdd(card, "maybe")} className={btn.secondary}>
          Maybe
        </button>
        {legendary && (
          <button type="button" onClick={() => onSetCommander(card)} className={`${btn.quiet} col-span-2`}>
            Commander
          </button>
        )}
      </div>
    </li>
  );
}
