/** One stop of a tour: the element marked data-tour={target}, and what to say about it. */
export interface TourStep {
  target: string;
  title: string;
  body: string;
}

/** The deck page, in the order a new player meets it. A step whose target is not on screen is left out. */
export const DECK_TOUR: TourStep[] = [
  { target: "search", title: "Add cards", body: "Search any card here and add it. Your changes stay a draft until you save them." },
  { target: "versions", title: "Save a version", body: "Each save keeps the whole list as a new version, with a short note about what changed. Nothing is overwritten." },
  { target: "history", title: "See what changed", body: "Your newest saves, with their notes and how many cards came in and went out. Click one to open it." },
  { target: "compare", title: "Compare any two", body: "Pick two versions to see every card in and out, and how the curve, price and bracket moved." },
  { target: "stats", title: "Know what you built", body: "Mana curve, colours, bracket and how often you hit your land drops, worked out from the list." },
  { target: "share", title: "Share it", body: "Make the deck public to show it on Explore. You choose which version people see." },
  { target: "variant", title: "Try a variant", body: "Test an idea, such as a budget build, without touching the main deck." },
];

/** The steps whose target is on the page, in order. */
export function stepsToShow(steps: TourStep[], isOnPage: (target: string) => boolean): TourStep[] {
  return steps.filter((step) => isOnPage(step.target));
}
