import { useEffect, useState } from "react";
import { getCountdownText } from "@/lib/time";

/**
 * Live-updating countdown to a target date.
 * Updates every second for <1h, every minute for >1h, every 5min for >24h.
 */
export function useCountdown(targetDate: Date | null) {
  const [text, setText] = useState<string>("");

  useEffect(() => {
    if (!targetDate) {
      setText("");
      return;
    }

    const update = () => {
      const now = new Date();
      const diffMs = targetDate.getTime() - now.getTime();

      if (diffMs <= 0) {
        setText("now");
        return;
      }

      setText(getCountdownText(targetDate));
    };

    update();

    // Choose interval based on how far away the target is
    const diffMs = targetDate.getTime() - new Date().getTime();
    let intervalMs: number;
    if (diffMs < 60 * 60 * 1000) {
      intervalMs = 1000; // every second for <1h
    } else if (diffMs < 24 * 60 * 60 * 1000) {
      intervalMs = 60 * 1000; // every minute for <24h
    } else {
      intervalMs = 5 * 60 * 1000; // every 5min for >24h
    }

    const interval = setInterval(update, intervalMs);
    return () => clearInterval(interval);
  }, [targetDate]);

  return text;
}
