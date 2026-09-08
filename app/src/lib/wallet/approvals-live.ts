import { getApiBaseUrl } from "@/lib/api-base";
import { verifierApprovalsLiveUrl } from "phygital-wallet-sdk";

export function approvalsLiveWsUrl(ticket: string): string {
  return verifierApprovalsLiveUrl(getApiBaseUrl(), ticket);
}
