import { useEffect, useState } from "react";
import { calculateDaysRemaining, nowMs } from "@/src/shared/time";

export function Countdown({ eventDate }: { eventDate: string }) {
  const [daysLeft, setDaysLeft] = useState(0);

  useEffect(() => {
    setDaysLeft(calculateDaysRemaining(eventDate, nowMs()));
  }, [eventDate]);

  return <p className="mt-4 text-sm text-gray-600">{daysLeft} days remaining</p>;
}
