/**
 * Solana token balance checker.
 *
 * Queries on-chain token accounts via Solana JSON-RPC to determine
 * how many $CANDOR tokens a wallet holds. No SDK dependencies —
 * uses raw RPC calls via fetch.
 */

/** $CANDOR token mint address */
export const CANDOR_MINT = "8Kk1Ud3tysVR7hL8Z7wrHz4DeXBAMvmQ7b7aV3dypump";

/** Default Solana RPC endpoint */
const DEFAULT_RPC = "https://api.mainnet-beta.solana.com";

/** SPL Token Program ID */
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

interface TokenAccount {
    pubkey: string;
    account: {
        data: {
            parsed: {
                info: {
                    mint: string;
                    owner: string;
                    tokenAmount: {
                        amount: string;
                        decimals: number;
                        uiAmount: number;
                        uiAmountString: string;
                    };
                };
            };
        };
    };
}

interface RpcResponse<T> {
    jsonrpc: string;
    id: number;
    result?: T;
    error?: { code: number; message: string };
}

export class SolanaChecker {
    private rpcUrl: string;

    constructor(rpcUrl?: string) {
        this.rpcUrl = rpcUrl || process.env.SOLANA_RPC_URL || DEFAULT_RPC;
    }

    /**
     * Get the $CANDOR token balance for a wallet address.
     * Returns the UI amount (human-readable, with decimals applied).
     */
    async getTokenBalance(walletAddress: string): Promise<number> {
        const body = {
            jsonrpc: "2.0",
            id: 1,
            method: "getTokenAccountsByOwner",
            params: [
                walletAddress,
                { mint: CANDOR_MINT },
                { encoding: "jsonParsed" },
            ],
        };

        const res = await fetch(this.rpcUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) {
            throw new Error(`Solana RPC error: ${res.status} ${res.statusText}`);
        }

        const data = (await res.json()) as RpcResponse<{ value: TokenAccount[] }>;

        if (data.error) {
            throw new Error(`Solana RPC error: ${data.error.message}`);
        }

        if (!data.result?.value?.length) {
            return 0;
        }

        // Sum across all token accounts (usually just one)
        let total = 0;
        for (const account of data.result.value) {
            total += account.account.data.parsed.info.tokenAmount.uiAmount || 0;
        }

        return total;
    }

    /**
     * Check if a wallet holds at least `minAmount` $CANDOR tokens.
     */
    async holdsMinimum(walletAddress: string, minAmount: number): Promise<boolean> {
        const balance = await this.getTokenBalance(walletAddress);
        return balance >= minAmount;
    }

    /**
     * Validate that a string looks like a valid Solana address (base58, 32-44 chars).
     */
    static isValidAddress(address: string): boolean {
        if (!address || address.length < 32 || address.length > 44) return false;
        return /^[1-9A-HJ-NP-Za-km-z]+$/.test(address);
    }
}
