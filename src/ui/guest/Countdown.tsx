import { useEffect, useState } from "react";

export function Countdown({ eventDate }: { eventDate: string }) {
  const [daysLeft, setDaysLeft] = useState(0);

  useEffect(() => {
    const target = new Date(eventDate).getTime();
    const now = Date.now();
    const diff = target - now;
    setDaysLeft(Math.max(Math.ceil(diff / (1000 * 60 * 60 * 24)), 0));
  }, [eventDate]);

  return <p className="mt-4 text-sm text-gray-600">{daysLeft} days remaining</p>;
}
