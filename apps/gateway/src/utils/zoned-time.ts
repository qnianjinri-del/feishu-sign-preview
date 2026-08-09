function dateTimeParts(value: Date, timeZone: string): Record<string, number> {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  return Object.fromEntries(parts
    .filter((part) => part.type !== "literal")
    .map((part) => [part.type, Number(part.value)]));
}

/** Converts a wall-clock time in an IANA zone to an absolute Unix timestamp. */
export function zonedDateTimeToTimestamp(date: string, time: string, timeZone: string): number {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const wantedAsUtc = Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1, hour ?? 0, minute ?? 0, 0);
  let candidate = wantedAsUtc;
  // Two passes cover offset changes around daylight-saving boundaries.
  for (let pass = 0; pass < 2; pass += 1) {
    const represented = dateTimeParts(new Date(candidate), timeZone);
    const representedAsUtc = Date.UTC(
      represented.year ?? 0,
      (represented.month ?? 1) - 1,
      represented.day ?? 1,
      represented.hour ?? 0,
      represented.minute ?? 0,
      represented.second ?? 0,
    );
    candidate += wantedAsUtc - representedAsUtc;
  }
  return candidate;
}
