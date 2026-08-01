import { useEffect, useState } from "react";
import { localDayStart } from "../utils/taskVisibility";

export function useTodayStart(): number {
  const [todayStart, setTodayStart] = useState(() => localDayStart());

  useEffect(() => {
    let timer = 0;
    const scheduleNextDay = () => {
      const now = new Date();
      setTodayStart(localDayStart(now.getTime()));
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
      timer = window.setTimeout(scheduleNextDay, Math.max(1_000, tomorrow - now.getTime() + 1_000));
    };
    scheduleNextDay();
    return () => window.clearTimeout(timer);
  }, []);

  return todayStart;
}
