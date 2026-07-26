// Minimal structured logger that deliberately never logs email bodies,
// attachment contents, OAuth tokens, or full financial line items - only
// event names and non-sensitive identifiers (message IDs, counts, statuses).

type LogFields = Record<string, string | number | boolean | undefined>;

function emit(level: "info" | "warn" | "error", event: string, fields?: LogFields) {
  const line = {
    level,
    event,
    time: new Date().toISOString(),
    ...fields,
  };
  // eslint-disable-next-line no-console
  console[level === "info" ? "log" : level](JSON.stringify(line));
}

export const logger = {
  info: (event: string, fields?: LogFields) => emit("info", event, fields),
  warn: (event: string, fields?: LogFields) => emit("warn", event, fields),
  error: (event: string, fields?: LogFields) => emit("error", event, fields),
};
