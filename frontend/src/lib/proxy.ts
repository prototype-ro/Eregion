export interface BatchOptions {
  concurrency: number;
  signal: AbortSignal;
  /** Called after each item finishes, with how many have finished so far (failed ones included). */
  onProgress?: (finished: number) => void;
}

export interface BatchResult<T> {
  done: number;
  failed: Array<{ item: T; error: unknown }>;
}

/**
 * Runs the worker over the items with at most `concurrency` in flight. A failing item is recorded and the rest carry on. Aborting the
 * signal stops new items from starting; ones already running finish.
 */
export async function runBatch<T>(items: T[], worker: (item: T) => Promise<void>, options: BatchOptions): Promise<BatchResult<T>> {
  const failed: BatchResult<T>["failed"] = [];
  let next = 0;
  let finished = 0;
  let done = 0;

  async function lane() {
    while (!options.signal.aborted && next < items.length) {
      const item = items[next++];
      try {
        await worker(item);
        done++;
      } catch (error) {
        failed.push({ item, error });
      }
      finished++;
      options.onProgress?.(finished);
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, Math.min(options.concurrency, items.length)) }, lane));
  return { done, failed };
}

/** Cards that have no current result yet, in the order given. An interrupted batch resumes with these. */
export function pending(cardIds: string[], treatments: Array<{ cardId: string; current?: unknown | null }>): string[] {
  const have = new Set(treatments.filter((t) => t.current).map((t) => t.cardId));
  return cardIds.filter((id) => !have.has(id));
}

/** The text to paste into Midjourney: the prompt plus the deck's parameters. */
export function fullPrompt(prompt: string, params: string | null): string {
  const extra = params?.trim();
  return extra ? `${prompt} ${extra}` : prompt;
}
