/** HMAC ticket heads for approvals live WS / visitor watch. */

export function approvalsLiveTicketHead(
  phygitalToken: string,
  credentialId: string,
): string {
  return `approvals-live|${phygitalToken}|${credentialId}`;
}

export function approvalsWatchTicketHead(
  phygitalToken: string,
  intentHash: string,
): string {
  return `approvals-watch|${phygitalToken}|${intentHash}`;
}

export function parseApprovalsLiveTicketHead(head: string):
  | { kind: "live"; phygitalToken: string; credentialId: string }
  | { kind: "watch"; phygitalToken: string; intentHash: string }
  | null {
  const first = head.indexOf("|");
  const second = head.indexOf("|", first + 1);
  if (first < 0 || second < 0) return null;
  const kind = head.slice(0, first);
  const phygitalToken = head.slice(first + 1, second).trim();
  const rest = head.slice(second + 1);
  if (!phygitalToken || !rest) return null;
  if (kind === "approvals-live") {
    return { kind: "live", phygitalToken, credentialId: rest };
  }
  if (kind === "approvals-watch") {
    return { kind: "watch", phygitalToken, intentHash: rest };
  }
  return null;
}
