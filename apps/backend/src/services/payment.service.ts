// Payment gateway service — Chapa and Telebirr integrations
// Requirements: 6.3, 6.5

// ─── Interface ────────────────────────────────────────────────────────────────

export interface IPaymentGateway {
  /**
   * Initiate a deposit for a player.
   * Returns a checkout URL the client can redirect to.
   */
  initiateDeposit(
    playerId: string,
    amount: number,
  ): Promise<{ checkoutUrl: string }>;

  /**
   * Initiate a payout to a player's phone number.
   * Resolves on success, throws on failure.
   */
  initiatePayout(
    playerId: string,
    amount: number,
    phone: string,
  ): Promise<void>;
}

// ─── Chapa Gateway ────────────────────────────────────────────────────────────

export class ChapaGateway implements IPaymentGateway {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.chapa.co/v1';
  private readonly returnUrl: string;

  constructor() {
    const apiKey = process.env['CHAPA_API_KEY'];
    if (!apiKey) {
      throw new Error('CHAPA_API_KEY environment variable is not set');
    }
    this.apiKey = apiKey;
    this.returnUrl =
      process.env['PAYMENT_RETURN_URL'] ?? 'https://t.me/beteseb_bingo_bot';
  }

  async initiateDeposit(
    playerId: string,
    amount: number,
  ): Promise<{ checkoutUrl: string }> {
    const txRef = `dep_${playerId}_${Date.now()}`;

    const body = {
      amount: amount.toString(),
      currency: 'ETB',
      tx_ref: txRef,
      return_url: this.returnUrl,
      customization: {
        title: 'Beteseb Bingo Deposit',
      },
    };

    const response = await fetch(`${this.baseUrl}/transaction/initialize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Chapa deposit initialization failed: ${response.status} ${errorText}`,
      );
    }

    const data = (await response.json()) as {
      data?: { checkout_url?: string };
      status?: string;
    };

    const checkoutUrl = data?.data?.checkout_url;
    if (!checkoutUrl) {
      throw new Error('Chapa response did not include a checkout URL');
    }

    return { checkoutUrl };
  }

  async initiatePayout(
    playerId: string,
    amount: number,
    phone: string,
  ): Promise<void> {
    const reference = `pay_${playerId}_${Date.now()}`;

    const body = {
      account_name: 'Beteseb Bingo Player',
      account_number: phone,
      amount: amount.toString(),
      currency: 'ETB',
      reference,
    };

    const response = await fetch(`${this.baseUrl}/transfers`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Chapa payout failed: ${response.status} ${errorText}`,
      );
    }
  }
}

// ─── Telebirr Gateway ─────────────────────────────────────────────────────────

export class TelebirrGateway implements IPaymentGateway {
  private readonly appId: string;
  private readonly appKey: string;

  constructor() {
    const appId = process.env['TELEBIRR_APP_ID'];
    const appKey = process.env['TELEBIRR_APP_KEY'];
    if (!appId || !appKey) {
      throw new Error(
        'TELEBIRR_APP_ID and TELEBIRR_APP_KEY environment variables must be set',
      );
    }
    this.appId = appId;
    this.appKey = appKey;
  }

  async initiateDeposit(
    playerId: string,
    amount: number,
  ): Promise<{ checkoutUrl: string }> {
    // Stub implementation — Telebirr API details vary by integration partner
    console.log(
      `[TelebirrGateway] initiateDeposit stub: playerId=${playerId} amount=${amount} appId=${this.appId}`,
    );
    const txRef = `dep_${playerId}_${Date.now()}`;
    return {
      checkoutUrl: `https://telebirr.et/pay?ref=${txRef}&amount=${amount}&appId=${this.appId}`,
    };
  }

  async initiatePayout(
    playerId: string,
    amount: number,
    phone: string,
  ): Promise<void> {
    // Stub implementation — log and resolve
    console.log(
      `[TelebirrGateway] initiatePayout stub: playerId=${playerId} amount=${amount} phone=${phone} appKey=${this.appKey ? '[set]' : '[unset]'}`,
    );
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Returns the configured payment gateway instance.
 * Reads PAYMENT_GATEWAY env var: 'chapa' | 'telebirr', defaults to 'chapa'.
 */
export function getPaymentGateway(): IPaymentGateway {
  const gatewayName = (process.env['PAYMENT_GATEWAY'] ?? 'chapa').toLowerCase();

  switch (gatewayName) {
    case 'telebirr':
      return new TelebirrGateway();
    case 'chapa':
    default:
      return new ChapaGateway();
  }
}
