// A few faint hearts drifting up behind the page. Pure CSS, decorative only.

// Fixed values (not random) so server and client render the same markup.
const HEARTS = [
  { left: 6, size: 18, delay: 0, duration: 19 },
  { left: 18, size: 12, delay: 7, duration: 23 },
  { left: 31, size: 22, delay: 3, duration: 21 },
  { left: 47, size: 14, delay: 11, duration: 25 },
  { left: 62, size: 20, delay: 5, duration: 20 },
  { left: 74, size: 11, delay: 14, duration: 24 },
  { left: 86, size: 17, delay: 2, duration: 22 },
  { left: 94, size: 13, delay: 9, duration: 26 },
];

export default function Hearts() {
  return (
    <div className="hearts" aria-hidden="true">
      {HEARTS.map((h, i) => (
        <span
          key={i}
          style={{
            left: `${h.left}%`,
            fontSize: `${h.size}px`,
            animationDelay: `-${h.delay}s`,
            animationDuration: `${h.duration}s`,
          }}
        >
          ♥
        </span>
      ))}
    </div>
  );
}
