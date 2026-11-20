/**
 * A name a player typed, set in the display face. The blackletter's figures are hard to tell apart (its "1" reads as
 * "l", so "Kinnan a11y test" reads "ally"), so digits switch to the text face and the name stays readable.
 */
export function DisplayName({ name }: { name: string }) {
  const parts = name.split(/(\d+)/);
  return (
    <>
      {parts.map((part, i) =>
        /^\d+$/.test(part) ? (
          <span key={i} className="font-sans font-semibold tracking-[-0.04em]">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}
