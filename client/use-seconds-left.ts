import { useEffect, useState } from "react";

/** autoAt까지 남은 초. 지났거나 null이면 null. */
export function useSecondsLeft(autoAt: string | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  const target = autoAt ? Date.parse(autoAt) : null;
  const running = target !== null && target > now;
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [running]);
  return running ? Math.ceil((target - now) / 1000) : null;
}
