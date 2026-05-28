import { prisma } from "services/prisma";

// Fire-and-forget analytics. Never block the request: failures are logged
// and swallowed so a busted analytics insert can't break sign-in or task
// creation. `props` is stringified JSON — keep payloads small.
export function trackEvent(
  event: string,
  userId: string | null,
  props?: Record<string, unknown>,
): Promise<void> {
  const data = {
    event,
    userId,
    props: props ? JSON.stringify(props) : null,
  };
  return prisma.analyticsEvent
    .create({ data })
    .then(() => undefined)
    .catch((err: unknown) => {
      console.error(`[analytics] failed to record "${event}":`, err);
    });
}
