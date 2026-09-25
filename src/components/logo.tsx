/** The Arrsenal mark, drawn in the current text color so it follows the theme. */
export function Logo({
  size = 28,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M4 54 26 10h12l11 22H35l-3-6-14 28Z" />
      <path d="M31 36h20l9 18H46l-4-8H26Z" />
    </svg>
  );
}
