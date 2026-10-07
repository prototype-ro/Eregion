import Image from "next/image";

/**
 * Card art inside a rounded frame. The frame decides the shape, the art covers it.
 * Art is grayscale until hovered inside a `group` parent.
 */
export function CardArt({
  src,
  alt,
  sizes,
  position = "50% 40%",
  priority = false,
  className = "",
}: {
  src: string;
  alt: string;
  sizes: string;
  position?: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <div className={`relative overflow-hidden bg-surface ${className}`}>
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className="art object-cover"
        style={{ objectPosition: position }}
      />
    </div>
  );
}
