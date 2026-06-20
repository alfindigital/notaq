import { useEffect, useState, useMemo, useRef } from "react";

function DigitReel({ target, delay }: { target: string; delay: number }) {
  const [settled, setSettled] = useState(false);
  const digits = "0123456789";

  useEffect(() => {
    const t = setTimeout(() => setSettled(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  if (target === ".") {
    return <span className="inline-block text-center w-[0.4em]">.</span>;
  }

  const n = parseInt(target, 10);
  const finalOffset = settled ? n : 0;

  return (
    <span className="inline-block overflow-hidden h-[1.2em] w-[0.65em] relative align-bottom">
      <span
        className="flex flex-col items-center transition-transform duration-700 ease-out"
        style={{
          transform: `translateY(-${finalOffset * 10}%)`,
          transitionDelay: `${delay}ms`,
        }}
      >
        {digits.split("").map((d) => (
          <span key={d} className="block h-[1.2em] leading-[1.2em]">
            {d}
          </span>
        ))}
      </span>
    </span>
  );
}

export function RollingIDR({
  value,
  className = "",
  trigger = true,
}: {
  value: number;
  className?: string;
  trigger?: boolean;
}) {
  const [key, setKey] = useState(0);
  const prevTrigger = useRef(trigger);

  useEffect(() => {
    if (trigger && !prevTrigger.current) {
      setKey((k) => k + 1);
    }
    prevTrigger.current = trigger;
  }, [trigger]);

  const negative = Math.round(value) < 0;
  const chars = useMemo(() => {
    const abs = Math.abs(Math.round(value));
    const formatted = abs.toLocaleString("id-ID"); // "2.222"
    return formatted.split(""); // ["2", ".", "2", "2", "2"]
  }, [value]);

  const stagger = 30; // ms between each digit settling

  return (
    <span key={key} className={`inline-flex items-baseline font-mono ${className}`}>
      {negative && <span className="mr-[0.05em]">-</span>}
      <span className="mr-[0.15em]">Rp</span>
      {chars.map((ch, i) => (
        <DigitReel key={`${i}-${ch}`} target={ch} delay={i * stagger + 80} />
      ))}
    </span>
  );
}
