/**
 * Token gating — restrict premium features based on $CANDOR token holdings.
 *
 * Tiers:
 *   Free     — 0 tokens:      basic proxy, 24h retention, 3 alert rules
 *   Holder   — 1,000+ tokens:  7d retention, 10 alert rules, cost reports
 *   Pro      — 10,000+ tokens: 30d retention, unlimited alerts, SDK access, session replay
 *   Whale    — 100,000+ tokens: 90d retention, priority webhooks, multi-tenant, compare CLI
 */

import { SolanaChecker, CANDOR_MINT } from "./solana.js";

// ── Tier definitions ────────────────────────────────────

export type Tier = "free" | "holder" | "pro" | "whale";

export interface TierConfig {
    name: Tier;
    label: string;
    minTokens: number;
    retentionDays: number;
    maxAlertRules: number;
    maxEventsPerSession: number;
    features: string[];
}

export const TIERS: Record<Tier, TierConfig> = {
    free: {
        name: "free",
        label: "Free",
        minTokens: 0,
        retentionDays: 1,
        maxAlertRules: 3,
        maxEventsPerSession: 500,
        features: ["proxy", "dashboard", "basic_alerts"],
    },
    holder: {
        name: "holder",
        label: "Holder",
        minTokens: 1_000,
        retentionDays: 7,
        maxAlertRules: 10,
        maxEventsPerSession: 2_000,
        features: ["proxy", "dashboard", "basic_alerts", "cost_reports", "cli_tools"],
    },
    pro: {
        name: "pro",
        label: "Pro",
        minTokens: 10_000,
        retentionDays: 30,
        maxAlertRules: -1, // unlimited
        maxEventsPerSession: 10_000,
        features: [
            "proxy", "dashboard", "basic_alerts", "cost_reports", "cli_tools",
            "sdk_access", "session_replay", "compare", "webhook_alerts",
        ],
    },
    whale: {
        name: "whale",
        label: "Whale",
        minTokens: 100_000,
        retentionDays: 90,
        maxAlertRules: -1,
        maxEventsPerSession: -1, // unlimited
        features: [
            "proxy", "dashboard", "basic_alerts", "cost_reports", "cli_tools",
            "sdk_access", "session_replay", "compare", "webhook_alerts",
            "priority_webhooks", "multi_tenant", "custom_cost_rates", "export",
        ],
    },
};

// ── Token Gate ───────────────────────────────────────────

export class TokenGate {
    private checker: SolanaChecker;
    private cache: Map<string, { tier: Tier; balance: number; checkedAt: number }> = new Map();
    private cacheTtlMs: number;

    constructor(options: { rpcUrl?: string; cacheTtlMs?: number } = {}) {
        this.checker = new SolanaChecker(options.rpcUrl);
        this.cacheTtlMs = options.cacheTtlMs || 60_000; // Cache for 1 minute
    }

    /**
     * Determine the tier for a wallet address.
     * Results are cached to avoid excessive RPC calls.
     */
    async getTier(walletAddress: string): Promise<{ tier: Tier; config: TierConfig; balance: number }> {
        if (!SolanaChecker.isValidAddress(walletAddress)) {
            return { tier: "free", config: TIERS.free, balance: 0 };
        }

        // Check cache
        const cached = this.cache.get(walletAddress);
        if (cached && Date.now() - cached.checkedAt < this.cacheTtlMs) {
            return { tier: cached.tier, config: TIERS[cached.tier], balance: cached.balance };
        }

        // Query on-chain
        let balance: number;
        try {
            balance = await this.checker.getTokenBalance(walletAddress);
        } catch {
            // RPC failure — return cached tier if available, otherwise free
            if (cached) {
                return { tier: cached.tier, config: TIERS[cached.tier], balance: cached.balance };
            }
            return { tier: "free", config: TIERS.free, balance: 0 };
        }

        // Determine tier from balance
        const tier = this.balanceToTier(balance);

        // Update cache
        this.cache.set(walletAddress, { tier, balance, checkedAt: Date.now() });

        return { tier, config: TIERS[tier], balance };
    }

    /**
     * Check if a wallet has access to a specific feature.
     */
    async hasFeature(walletAddress: string, feature: string): Promise<boolean> {
        const { config } = await this.getTier(walletAddress);
        return config.features.includes(feature);
    }

    /**
     * Get the effective config values for a wallet (retention, alert limits, etc.).
     */
    async getEffectiveConfig(walletAddress: string): Promise<{
        tier: Tier;
        retentionDays: number;
        maxAlertRules: number;
        maxEventsPerSession: number;
        features: string[];
    }> {
        const { tier, config } = await this.getTier(walletAddress);
        return {
            tier,
            retentionDays: config.retentionDays,
            maxAlertRules: config.maxAlertRules,
            maxEventsPerSession: config.maxEventsPerSession,
            features: config.features,
        };
    }

    /**
     * Middleware-style gate check. Returns null if allowed, error message if denied.
     */
    async gate(walletAddress: string, requiredFeature: string): Promise<string | null> {
        const { tier, config, balance } = await this.getTier(walletAddress);

        if (config.features.includes(requiredFeature)) {
            return null; // Access granted
        }

        // Find the minimum tier that has this feature
        const requiredTier = this.featureToMinTier(requiredFeature);
        if (!requiredTier) {
            return `Unknown feature: ${requiredFeature}`;
        }

        const needed = TIERS[requiredTier].minTokens;
        return `Feature "${requiredFeature}" requires ${requiredTier} tier (${needed.toLocaleString()}+ $CANDOR tokens). Current balance: ${balance.toLocaleString()} (${tier} tier).`;
    }

    /** Clear the tier cache for a specific wallet or all wallets */
    clearCache(walletAddress?: string): void {
        if (walletAddress) {
            this.cache.delete(walletAddress);
        } else {
            this.cache.clear();
        }
    }

    /** Get the token mint address */
    static get mint(): string {
        return CANDOR_MINT;
    }

    // ── Private helpers ─────────────────────────────────

    private balanceToTier(balance: number): Tier {
        if (balance >= TIERS.whale.minTokens) return "whale";
        if (balance >= TIERS.pro.minTokens) return "pro";
        if (balance >= TIERS.holder.minTokens) return "holder";
        return "free";
    }

    private featureToMinTier(feature: string): Tier | null {
        for (const tierName of ["free", "holder", "pro", "whale"] as Tier[]) {
            if (TIERS[tierName].features.includes(feature)) {
                return tierName;
            }
        }
        return null;
    }
}
