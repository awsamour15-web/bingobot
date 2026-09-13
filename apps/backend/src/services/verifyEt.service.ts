/**
 * verify.et — Ethiopian bank transaction verification service
 * https://verify.et/docs/api
 *
 * Wraps POST /api/verify to confirm a transaction reference actually
 * exists on the bank's side before crediting the player.
 *
 * Requires VERIFY_ET_API_KEY env var. If not set, all checks return
 * { verified: true, skipped: true } so the rest of the flow is unaffected.
 */

const BASE_URL = 'https://verify.et';

export interface VerifyEtResult {
  /** true if the transaction was confirmed real by the bank */
  verified: boolean;
  /** true when the API key is not configured — check was skipped */
  skipped?: boolean;
  /** amount reported by the bank (may differ from player's SMS) */
  amount?: number;
  /** receiver account/phone returned by the bank */
  receiverAccount?: string;
  /** whether the receiver matched our settlement account */
  settlementMatched?: boolean;
  /** raw reason code from the API */
  reason?: string;
  /** full error message when verified === false */
  error?: string;
}

interface VerifyEtApiResponse {
  success: boolean;
  message?: string;
  requestId?: string;
  data?: {
    status?: string;
    amount?: number | string;
    receiverAccount?: string;
    receiverName?: string;
    [key: string]: unknown;
  };
  verification?: {
    status?: string;
    amount?: number | string;
    receiverAccount?: string;
    [key: string]: unknown;
  };
  settlementAccountMatch?: {
    matched: boolean;
    confidence?: string;
    source?: string;
    reason?: string;
    ambiguous?: boolean;
  };
}

/**
 * Verify a transaction reference against the verify.et API.
 *
 * @param txNumber      - The transaction reference (e.g. Telebirr tx ID)
 * @param bank          - Optional bank hint ('telebirr' | 'cbe' | 'boa' | 'dashen' | 'awash' | 'mpesa' | 'cbebirr')
 *                        If omitted, verify.et's universal smart-router will auto-detect.
 * @param settlementAccount - Optional: our receiving phone/account number to verify the money came to us
 * @param accountSuffix - Last 8 digits of CBE account, or last 5 for BOA (required for those banks)
 */
export async function verifyTransaction(
  txNumber: string,
  bank?: string,
  settlementAccount?: string,
  accountSuffix?: string,
): Promise<VerifyEtResult> {
  const apiKey = process.env['VERIFY_ET_API_KEY'];

  if (!apiKey) {
    return { verified: true, skipped: true };
  }

  try {
    const body: Record<string, string> = {
      reference: txNumber,
    };

    if (bank) body['bank'] = bank;
    if (settlementAccount) body['settlementAccount'] = settlementAccount;
    if (accountSuffix) body['accountSuffix'] = accountSuffix;

    const response = await fetch(`${BASE_URL}/api/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000), // 10s timeout — don't block deposits forever
    });

    const json = await response.json() as VerifyEtApiResponse;

    if (!response.ok || !json.success) {
      console.warn(`[VerifyET] Verification failed for ${txNumber}:`, json.message);
      return {
        verified: false,
        error: json.message ?? `HTTP ${response.status}`,
      };
    }

    // Determine the effective data source (some banks use data, some use verification)
    const result = json.verification ?? json.data;
    const status = result?.status?.toLowerCase();
    const isSuccess = status === 'success' || status === 'completed' || status === 'verified';

    const amount = result?.amount !== undefined ? Number(result.amount) : undefined;
    const receiverAccount = result?.receiverAccount as string | undefined;
    const settlementMatch = json.settlementAccountMatch;

    const out: VerifyEtResult = { verified: isSuccess };
    if (amount !== undefined) out.amount = amount;
    if (receiverAccount !== undefined) out.receiverAccount = receiverAccount;
    if (settlementMatch?.matched !== undefined) out.settlementMatched = settlementMatch.matched;
    if (settlementMatch?.reason !== undefined) out.reason = settlementMatch.reason;
    if (!isSuccess) out.error = json.message ?? 'Transaction not confirmed by bank';
    return out;
  } catch (err) {
    // Network errors, timeouts, etc. — fail open so deposits aren't blocked
    // by verify.et outages. Log for monitoring.
    console.error('[VerifyET] API call failed, failing open:', err);
    return { verified: true, skipped: true, error: err instanceof Error ? err.message : String(err) };
  }
}
