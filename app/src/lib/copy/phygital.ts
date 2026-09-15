/**
 * Revibase brand stack — company first, products second.
 *
 * All user-facing UX strings live here. Import nested groups:
 * `copy.verify.holdToCheck`, `copy.wallet.*`, etc.
 *
 * Voice: short labels, one-line bodies, plain words over jargon.
 * Titles name what the screen is; subtitles show current state.
 */

const pearl = "#F7F4EF";
const charcoal = "#1A1F1E";
const accent = "#00C2B8";

export const brand = {
  company: "Revibase",
  /** Hex for PWA / OG / viewport chrome (Luminous Object pearl / warm dark). */
  chromeLight: pearl,
  chromeDark: charcoal,
  /**
   * Locked identity colors. Shape is constant; color follows context.
   * - Master mark: charcoal (production / fashion / engrave)
   * - Digital default: accent on pearl
   * - App tiles / splash icons: pearl on accent field
   */
  colors: {
    accent,
    pearl,
    charcoal,
  },
  /**
   * Default meta / PWA description — product, not company slogan.
   * Screen titles still come from `products.*`.
   */
  description: "NFC wallets linked to your accessories.",
} as const;

export const products = {
  home: {
    name: "Revibase",
    tagline: "Cards & Accessories",
  },
  token: {
    name: "Wallet",
    tagline: "Your NFC wallet",
  },
} as const;

export const copy = {
  common: {
    tryAgain: "Try again",
    done: "Done",
    cancel: "Cancel",
    loading: "Loading…",
    back: "Back",
    close: "Close",
    wallet: "Wallet",
    remove: "Remove",
    notFoundTitle: "Page not found",
    notFoundBody: "That link doesn’t go anywhere.",
    goHome: "Go home",
  },
  wallet: {
    addressCopyFailed: "Couldn’t copy",
    showCardAria: "Back to card",
    addMoney: "Nothing here yet — receive to get started",
    available: "Available",
    sendNeedsFunds: "Add money to send",
    balancesUpdating: "Updating…",
    balancesUpdateFailed: "Couldn’t update",
    manageDevice: "Settings",
    send: "Send",
    receive: "Receive",
    activity: "Activity",
    tokens: "Tokens",
    collectibles: "Collectibles",
    seeAll: "See all",
    seeMore: "See more",
    searchTokens: "Search tokens",
    searchCollectibles: "Search collectibles",
    noMatchingTokens: "No matches",
    noMatchingCollectibles: "No matches",
    noActivity: "No activity yet",
    settings: "Settings",
    settingsAccess: "Access",
    settingsFees: "Fees",
    settingsSafety: "Safety",
    settingsSendProtections: "Send protections",
    /** Who verifies / co-signs transactions (not authenticity verify). Replaces Revibase when custom. */
    signing: "Transaction Verifier",
    rpcConnection: "Network",
    rpcBody: "Where this wallet loads balances and collectibles from.",
    rpcDefault: "Default",
    rpcCustom: "Custom",
    rpcCustomPrompt: "Use your own URL…",
    rpcCustomHint: "Paste an HTTPS Solana RPC URL",
    rpcUrlLabel: "URL",
    rpcSwitch: "Switch",
    rpcSwitchedDefault: "Using default network",
    rpcSwitchedCustom: "Using custom network",
    rpcBannerTitle: "Custom network",
    rpcBannerBody: (endpoint: string) => `Via ${endpoint}`,
    rpcBannerChange: "Change",
    rpcInvalidUrl: "Enter a valid HTTPS URL",
    advanced: "Advanced",
    toWalletChip: "Wallet",
    openWalletAriaLabel: "Open wallet",
    holdToSend: "Hold to confirm",
    holdToReceive: "Hold to confirm",
    holdToReceiveDesktopHint: "They’ll hold their accessory to confirm",
    holdToIdentifyPayer: "Hold their accessory",
    holdToIdentifyPayerHint: "They hold once to link, then again to pay",
    nearbySummaryTitle: "Confirm receive",
    nearbySummaryBody: "Have them hold again to send this amount.",
    nearbyChangeDetails: "Change amount",
    nearbyChangePayer: "Use a different item",
    holdToSave: "Hold to save",
    /** NFC step when Config default verifier will also need phone confirm. */
    configChangeHoldBody:
      "Hold your accessory, then confirm on this phone with Face ID, fingerprint, or screen lock.",
    configChangeConfirmTitle: "Confirm on this phone",
    configChangeConfirmBody:
      "Tap below, then use Face ID, fingerprint, or screen lock to finish saving.",
    configChangeConfirmCta: "Confirm with Passkey",
    configChangeConfirmPending:
      "Waiting for Face ID, fingerprint, or screen lock…",
    save: "Save",
    holdToOpenTitle: "Hold to open",
    holdToOpenBody: "Hold your accessory to unlock this wallet on this phone.",
    holdToOpenCta: "Hold to open",
    holdCeremonyTitle: "Hold your accessory",
    holdCeremonyBody: "Hold it to the top of your phone until this finishes.",
    signPreparingTitle: "Preparing",
    signPreparingBody: "Getting everything ready…",
    signPreviewingTitle: "Checking limits",
    signPreviewingBody: "Making sure this is allowed…",
    signAwaitingPasskeyTitle: "Hold your accessory",
    signAwaitingPasskeyBody:
      "Hold it to the top of your phone until this finishes.",
    signBuildingTitle: "Almost done",
    signBuildingBody: "Building your transaction…",
    signCoSigningTitle: "Confirming",
    signCoSigningBody: "Waiting for the verifier…",
    signSendingTitle: "Sending",
    signSendingBody: "Waiting for the network to confirm…",
    setupStepPasskey: "Step 1 of 2 · This phone",
    setupStepLink: "Step 2 of 2 · Link accessory",
    setupStepConfirm: "Step 2 of 2 · Confirm on this phone",
    continueWithPasskey: "Continue",
    setUpThisPhone: "Set up this phone",
    newPhoneHint: "New on this phone?",
    usernameLabel: "Username",
    usernamePlaceholder: "yourname",
    usernameHint: "4–15 characters · letters, numbers, underscores",
    usernameContinue: "Continue",
    usernameTitle: "Choose a username",
    usernameBody:
      "This name identifies your passkey. Pick something unique — like a Twitter handle.",
    usernameTaken: "That username is taken. Try another.",
    usernameInvalid:
      "Use 4–15 characters: letters, numbers, and underscores only.",
    max: "Max",
    restoreDefault: "Use Revibase",
    add: "Add",
    sent: "Sent",
    received: "Received",
    activityFailed: "Failed",
    ofAvailableAsset: (available: string, symbol: string) =>
      `${available} ${symbol} available`,
    selectAsset: "Choose asset",
    sendCollectible: "Sending 1 collectible",
    insufficientBalance: "Not enough balance",
    selfSend: "Can’t send to this wallet",
    cantReceiveFromSelf: "Can’t receive from this item",
    viewReceipt: "Receipt",
    openCard: "Open card",
    feeBalance: "Network fees",
    feeBalanceHint:
      "New wallets start with 0.001 SOL for network fees. Top up with SOL from this wallet when it runs low.",
    feeBalanceLow: "Network fees are low. Top up before sending.",
    feeBalanceInsufficient: "Not enough network fees. Top up to continue.",
    networkFeeFromBalance: "Network fees paid from your fee balance",
    networkFeeFromBalanceShort: "Paid from fee balance",
    topUpFees: "Top up",
    topUpFeesTitle: "Top up fees",
    topUpFeesBody: "Move SOL from this wallet into your fee balance.",
    topUpAmount: "Amount (SOL)",
    holdToTopUp: "Hold to top up",
    topUpPending: "Top-up sent. Balance updates shortly.",
    topUpSuccess: "Top-up submitted",
    // Accessory policy (what a tap may do)
    policy: "Accessory permissions",
    policyHint:
      "Control what this item can do with a tap. Start with everyday payments; add spendable assets or apps when you need them.",
    policyStatusStandard: "Everyday payments",
    policyStatusStandardBody:
      "A tap can send SOL and standard tokens with no amount cap. Other apps stay blocked until you allow them. Token-account takeovers (standing approvals) are blocked.",
    policyStatusOpen: "Protections off",
    policyStatusOpenBody:
      "Accessory checks are turned off. A tap can call any program this wallet can sign for. Restore everyday payments unless you intend this.",
    policyStatusLimited: "Custom limits",
    policyStatusLocked: "Locked",
    policyStatusLockedBody:
      "No transactions until someone claims this accessory. Claim it to turn on everyday payments.",
    policyLockedClaimCta: "Claim to unlock",
    /** Post-tap: no on-chain authority yet. */
    authorityChecking: "Checking ownership…",
    authoritySignInTitle: "Claim this accessory",
    authoritySignInBody:
      "Continue on this phone, then hold the accessory once to become the owner and turn on everyday payments.",
    authoritySignInCta: "Continue",
    authorityClaimTitle: "Turn on everyday payments",
    authorityClaimBody:
      "Claim this accessory as yours. You’ll hold it once to confirm — then a tap can send SOL and standard tokens.",
    authorityClaimCta: "Claim accessory",
    authorityClaiming: "Claiming…",
    authorityClaimFailed: "Couldn’t claim this item",
    authorityBrowse: "Just browsing",
    /** Wallet home after browse-without-claim. */
    unclaimedBanner:
      "Everyday payments stay off until you claim this accessory.",
    unclaimedBannerAction: "Claim",
    otherOwnerBanner: "Owned by another account on this phone.",
    otherOwnerBannerAction: "Details",
    ownershipLabel: "Ownership",
    ownershipSignIn: "Continue",
    ownershipSignInSubtitle: "Continue to claim or manage this accessory.",
    ownershipClaimFooter:
      "Claiming sets you as the owner and turns on everyday payments: a tap can send SOL and standard tokens; other apps stay blocked until you allow them.",
    ownershipOtherTitle: "Owned by another account",
    ownershipOtherSubtitle: (short: string) => `Owner · ${short}`,
    ownershipOtherFooter:
      "Only the owner can change permissions or unlink. After they unlink, anyone holding the accessory can claim it.",
    ownershipUnlink: "Unlink accessory",
    ownershipUnlinkSubtitle:
      "Removes the owner and disables the accessory until it is claimed again.",
    ownershipUnlinkTitle: "Unlink this accessory?",
    ownershipUnlinkBody:
      "This removes you as the owner and disables everyday payments. Funds in this wallet stay put — move them out first if you’re handing the accessory off. Anyone holding it can claim it again with a hold.",
    ownershipUnlinkCta: "Unlink",
    ownershipUnlinking: "Unlinking…",
    ownershipUnlinked: "Accessory unlinked",
    ownershipUnlinkFailed: "Couldn’t unlink this item",
    ownershipDangerZone: "Danger zone",
    policyBaselineTitle: "Included by default",
    policyBaselineHint:
      "These stay allowed while protections are on, unless you block them under Advanced.",
    /** The allow-list surprise, stated plainly — shown wherever asset limits are set. */
    policyAllowlistNote:
      "Listing any asset turns this into an allow-list: a tap can only spend assets you add here. Unlisted assets are blocked.",
    policySolLabel: "SOL",
    /** Remaining allowance until the reset date (recurring window). */
    policyLeftUntil: (amount: string, date: string) =>
      `${amount} SOL left · resets ${date}`,
    /** Remaining allowance for a one-time (lifetime) budget. */
    policyLeftLifetime: (amount: string) => `${amount} SOL left · one-time`,
    policyResetsOn: (date: string) => `Resets ${date}`,
    policyNoReset: "One-time — doesn’t reset",
    policyAssetsSummary: (count: number) =>
      `${count} spendable asset${count === 1 ? "" : "s"}`,
    policyHubStandard: "Everyday payments",
    policyHubOpen: "Protections off",
    policyHubLocked: "Locked · no transactions",
    // Pre-save preview of what a tap will be allowed to do
    policyPreviewTitle: "After saving, a tap can:",
    policyPreviewStandard:
      "Send SOL and standard tokens with no amount cap. Other apps stay blocked.",
    policyPreviewSpend: (amount: string, phrase: string) =>
      `Spend up to ${amount}, ${phrase}`,
    policyPreviewBlocked: "All other assets are blocked",
    policyPreviewApps: (n: number) =>
      `${n} extra app rule${n === 1 ? "" : "s"}`,
    policyWindowDay: "Every day",
    policyWindowWeek: "Every week",
    policyWindowMonth: "Every month",
    policyWindowLifetime: "One-time",
    policyWindowHint:
      "Resets on a fixed UTC schedule (daily at 00:00 UTC), not from the moment you save.",
    policyAmountLabel: "SOL a tap can spend",
    policyWindowLabel: "Renew this limit",
    policyEdit: "Edit permissions",
    policySet: "Customize permissions",
    policyPresetsTitle: "Quick setups",
    policyPresetsHint:
      "One tap applies an allow-list. You can edit amounts anytime.",
    policyPresetApplied: "Spend limits applied",
    policyClaimedTitle: "Everyday payments are on",
    policyClaimedBody:
      "A tap can send SOL and standard tokens with no amount cap. Other apps stay blocked. You can add spend limits anytime.",
    policyClaimedStay: "Looks good",
    policyClaimedLimit: "Limit what a tap can spend",
    policySave: "Save",
    policySaved: "Permissions saved",
    policyRestore: "Restore everyday payments",
    policyRestored: "Everyday payments restored",
    policyRestoreConfirmTitle: "Restore everyday payments?",
    policyRestoreConfirmBody:
      "Removes your asset limits and extra app rules. A tap can again send SOL and standard tokens with no amount cap; other apps stay blocked.",
    policyTurnOff: "Turn off protections",
    policyTurnedOff: "Protections turned off",
    policyTurnOffConfirmTitle: "Turn off accessory protections?",
    policyTurnOffConfirmBody:
      "Removes spending limits and the built-in payment-only rules. A tap won’t be checked until you restore everyday payments. Your owner key stays.",
    policySignInToEdit: "Continue as the owner to change permissions.",
    policyTokenLimits: "Spendable assets",
    policyTokenLimitsHint:
      "Only assets you list can leave with a tap. Add SOL above and any tokens here — up to 8 tokens.",
    policyAddToken: "Add an asset",
    policyPickToken: "Choose an asset",
    policyNoTokensToAdd: "No more assets to add",
    policyRemoveTokenAria: (symbol: string) => `Remove ${symbol}`,
    policyTokenAmountLabel: (symbol: string) => `${symbol} a tap can spend`,
    // Advanced — app/program permissions
    policyAdvanced: "Advanced",
    policyAdvancedHint:
      "Most people don’t need this. Allow or block specific apps beyond everyday payments.",
    policyPrograms: "Extra apps",
    policyProgramsHint:
      "Everyday payments (SOL and standard tokens) are already included. Add an app to allow or block it.",
    policyProgramsNone: "No extra apps",
    policyProgramsBaseline:
      "Everyday payment programs stay allowed unless you block them here.",
    policyAddProgram: "Add",
    policyProgramIdPlaceholder: "App address",
    policyProgramInvalid: "Enter a valid app address",
    policyProgramDuplicate: "That app is already listed",
    policyAccessAllow: "Allow",
    policyAccessDeny: "Block",
    policyAccessCustom: "Custom rules",
    policyRemoveProgramAria: (id: string) => `Remove ${id}`,
    interfaceNft: "NFT",
    interfacePnft: "pNFT",
    interfaceCnft: "cNFT",
    interfaceCore: "Core",
    to: "To",
    from: "From",
    pasteAddress: "Paste address",
    invalidAddress: "Enter a valid address",
    tapAccessory: "Hold item",
    tapTheirAccessory: "Hold their item",
    accessoryLinked: "Linked",
    clear: "Clear",
    copied: "Copied",
    receiveAnything: "Receive SOL, tokens, and collectibles here",
    receiveNearby: "Receive from someone nearby",
    receiveNearbyHint: "Use NFC to receive",
    refresh: "Refresh",
    refreshing: "Refreshing…",
    lastUpdated: (value: string) => `Updated ${value}`,
    firstRunTitle: "Nothing here yet",
    firstRunBody:
      "Receive money here. Hold your accessory to your phone when you send.",
    firstRunCta: "Receive",
    firstRunDismiss: "Not now",
    copySignature: "Copy signature",
    viewOnExplorer: "View on explorer",
    receiptPending: "Pending",
    receiptDetails: "Receipt",
    receiptTime: "Time",
    receiptType: "Type",
    receiptFee: "Network fee",
    accessRecoveryRow: "Recovery address",
    recoveryWallet: "Recovery address",
    recoveryWalletBody:
      "Paste a Solana address you control. That wallet can move all funds from this accessory — without the accessory or Revibase — on the recover site.",
    recoveryWalletPubkey: "Address",
    recoveryWalletPubkeyPlaceholder: "Paste Solana address",
    recoveryWalletSave: "Hold to save",
    recoveryWalletReplace: "Hold to replace",
    recoveryWalletClear: "Clear address",
    recoveryWalletClearConfirmTitle: "Clear recovery address?",
    recoveryWalletClearConfirmBody:
      "That wallet can no longer recover funds here. You’ll need this accessory to set a new address.",
    recoveryWalletClearConfirmCta: "Clear",
    recoveryWalletSaved: "Recovery address saved",
    recoveryWalletCleared: "Recovery address cleared",
    recoveryWalletInvalid: "Enter a valid address",
    recoveryWalletSame: "Already set to this address",
    recoveryWalletConfigured: "Set",
    recoveryWalletNotConfigured: "Not set",
    recoveryWalletCurrent: "Current",
    recoveryWalletHint:
      "Public address only — never a private key or seed. Prefer a cold wallet.",
    recoveryWalletRecoverSiteNote:
      "Anyone with this key can empty the vault. Keep it offline and safe. Recover site coming soon.",
    recoveryWalletAck:
      "I understand this address can move all funds without this accessory.",
    recoveryAckTitle: "Add a recovery address?",
    recoveryAckBody:
      "If you lose this accessory, that address can restore funds. It can also move everything — choose a key you fully control.",
    recoveryAckCta: "Add address",
    recoveryAckSkip: "Not now",
    limitsStatusOff: "Not set",
    limitsStatusOn: "On",
    limitsStatusInvalid: "Needs fix",
    limitsInvalidBody:
      "Saved limits are invalid. Save again to restore protection.",
    limitsTurnOff: "Turn off spend caps",
    limitsTurnedOff: "Spend caps off",
    openApprovalContinue: "Approved — they can hold to finish",
    nearbyPolicyTitle: "Needs approval",
    nearbyPolicyBody:
      "Over their limits. Ask them to approve once on their linked phone, then try again.",
    nearbyPolicyFeeBody:
      "They need more network fees. Ask them to top up, then try again.",
    nearbyPolicyGotIt: "Got it",
    visitorNeedsApprovalBody:
      "Ask the owner to approve this send on their linked phone. Once approved, try the same transaction again.",
    visitorNeedsApprovalHint: "Requests will expire in about 5 minutes.",
    visitorDeniedTitle: "Send not approved",
    visitorDeniedBody: "The owner declined this send.",
    openApprovalDenied: "Declined",
    signingBody:
      "Every transaction needs your accessory and a verifier that co-signs. Revibase is the default — it checks your limits before it signs.",
    signingCustomPolicyWarn:
      "This replaces Revibase as your transaction verifier. Revibase will no longer check spending limits, programs, or one-time approvals. Only use a verifier you trust.",
    signingCustomAck:
      "I understand I’m replacing the Revibase transaction verifier and its protections on every send.",
    signingCustomContinue: "Continue",
    signingCustomSaved:
      "Custom transaction verifier on — Revibase protections off",
    signingRestored: "Back to Revibase",
    signingInvalidCustom: "Enter a valid address and HTTPS URL",
    signingCurrent: "Current",
    signingDefault: "Revibase",
    signingCustom: "Custom",
    useCustomSigning: "Use a custom transaction verifier…",
    customEndpoint: "Verifier URL",
    customVerifier: "Verifier public key",
    verifierPubkey: "Solana address",
    policyDefaultSigningOnly:
      "Caps apply to built-in wallet sends. Exception programs are unrestricted.",
    policySection: "Limits",
    sendProtections: "Send protections",
    sendProtectionsHint:
      "When on, this wallet can only call built-in wallet and collectible programs — unless you add exceptions.",
    sendProtectionsOff: "Off",
    sendProtectionsOffBody: "Any program is allowed. No spend caps.",
    sendProtectionsOn: "On",
    sendProtectionsOnBody:
      "Built-in wallet programs are allowed. Set spend caps and exceptions below.",
    sendProtectionsTurnOn: "Turn on send protections",
    sendProtectionsTurnOff: "Turn off send protections",
    sendProtectionsTurnOffConfirm:
      "This removes spend caps and exceptions. Any program will be allowed again.",
    sendProtectionsRequired:
      "Turn on send protections first to set spend caps or exceptions.",
    unrestrictedAppsWarn:
      "Exception programs can move funds without your spend caps.",
    unrestrictedAppsHint: "Exceptions",
    approveSendTitle: "Approve this send?",
    approveSendBodyLimit: (limit: string) => `Over your $${limit} limit.`,
    approveSendBodyTime: "Sending isn’t allowed right now.",
    approveSendBodyApproval: "This send needs your one-time approval.",
    approveSendBodyFallback: "This send needs your one-time approval.",
    approveSendBodyInstruction:
      "This action isn’t allowed by your accessory permissions.",
    approveSendBodyProgram:
      "This app isn’t allowed by your accessory permissions.",
    approveSendBodyUnexpected:
      "This transaction couldn’t be checked against your settings.",
    approveSendSignInBody:
      "Unlock as the owner to approve once, then try again.",
    approveSendSignInCta: "Continue",
    approveSendSignInNotNow: "Not now",
    approveSendAmount: "Amount",
    approveSendDestination: "To",
    approveSendMint: "Token",
    approveSendProgram: "Program",
    approveSendInstruction: "Action",
    approveOnce: "Approve once",
    denyOnce: "Deny",
    changeLimits: "Change settings",
    sendBlockedHard:
      "This can’t be approved once — change permissions or try a different send.",
    spendingLimits: "Spending limits",
    spendingLimitsHint:
      "Caps cover SOL and verified tokens you add on built-in wallet sends. Larger sends need a one-time approval. They do not apply to exceptions.",
    spendingLimitsOff: "Off",
    spendingLimitsOffBody: "No mint or SOL spend caps on built-in sends.",
    spendingLimitsOn: "On",
    spendingLimitsOnBody: (
      mints: readonly { label: string; amount: string }[],
      sol: string
    ) => {
      const parts: string[] = [];
      for (const m of mints) {
        if (m.amount !== "—") parts.push(`${m.amount} ${m.label}`);
      }
      if (sol !== "—") parts.push(`${sol} SOL`);
      if (parts.length === 0) return "Spend caps are on.";
      if (parts.length === 1) {
        return `Up to ${parts[0]} per built-in send without a one-time approval.`;
      }
      const last = parts.pop()!;
      return `Up to ${parts.join(
        ", "
      )} and ${last} per built-in send without a one-time approval.`;
    },
    spendingLimitsInvalid: "Needs fix",
    spendingLimitsInvalidBody:
      "Saved limits are invalid. Save again to restore protection.",
    spendingLimitsAdvanced: "Set caps",
    spendingLimitsAdvancedHide: "Hide caps",
    spendingLimitsAdvancedHint:
      "Add a SOL cap and mint caps from verified tokens. Suggested start: 50 USDC and 0.1 SOL.",
    spendingLimitsSaveTurnsOn: "Saving turns on these spend caps.",
    spendingLimitsSaveNeedsCap:
      "Add a mint cap or SOL cap to turn spend limits on.",
    spendingLimitsMintAlreadyAdded: "That mint is already in your list.",
    spendingLimitsUseSolField: "Use the SOL field for native SOL caps.",
    mintSpendCaps: "Mint caps",
    mintSpendCapsEmpty: "No mint caps yet.",
    mintSpendCapsAddCta: "Add mint cap",
    mintSpendCapsAddUsdc: "Add USDC cap",
    mintSpendCapsRemove: "Remove mint cap",
    mintSpendCapsPickTitle: "Choose a token",
    mintSpendCapsNoneLeft: "Every verified token already has a cap.",
    maxMintPerSend: "Max per send",
    maxSolPerSend: "Max SOL per send",
    extraPrograms: "Exceptions",
    extraProgramsHint:
      "Send protections allow built-in wallet programs. Add an exception only if you need another program (for example a DEX).",
    extraProgramsAllAllowed: "All programs",
    extraProgramsAllAllowedBody:
      "Send protections are off — any program is allowed.",
    extraProgramsBuiltIn: "Built-in only",
    extraProgramsBuiltInBody:
      "Standard wallet and collectible programs. Spend caps apply here.",
    extraProgramsWithUnrestricted: (count: number) =>
      count === 1 ? "Built-in + 1 exception" : `Built-in + ${count} exceptions`,
    extraProgramsWithUnrestrictedBody:
      "Exception programs can move funds without your spend caps.",
    extraProgramsProtected: "Built-in",
    extraProgramsProtectedHint: "Included with send protections.",
    extraProgramsUnrestricted: "Exceptions",
    extraProgramsUnrestrictedHint:
      "Any instruction on these programs is allowed — no spend-cap checks.",
    extraProgramsAddCta: "Add exception",
    extraProgramsAddConfirm:
      "This program can move funds without your spend caps. Continue?",
    extraProgramsAddConfirmCta: "Add exception",
    extraProgramsEmpty: "None",
    extraProgramsAlreadyBuiltIn: "That program is already in the built-in set.",
    extraProgramsShowBuiltIn: "Show built-in programs",
    extraProgramsHideBuiltIn: "Hide built-in programs",
    invalidProgramId: "Enter a valid program ID",
    programId: "Program ID",
    allowedSites: "Allowed sites",
    allowedSitesHint:
      "Restrict signing to specific websites. When the list is empty, any site you tap into can request signatures.",
    allowedSitesStatusAny: "Any site",
    allowedSitesStatusOn: (count: number) =>
      count === 1 ? "1 site" : `${count} sites`,
    allowedSitesListLabel: "Allowed sites",
    allowedSitesEmpty: "None — any site can sign",
    allowedSitesLockedNote:
      "Only these origins can sign. A site not on the list — and any server request with no site origin — is blocked.",
    allowedSitesAddCta: "Add site",
    allowedSitesAddPlaceholder: "https://example.com",
    allowedSitesAddLabel: "Site URL",
    invalidOrigin: "Enter a valid site URL, e.g. https://example.com",
    settingsSaved: "Saved",
    statusAuthentic: "Authentic",
    statusAuthenticLive: "Authentic · Live tap",
    statusLinked: "Linked",
    statusVisitor: "Visitor",
    statusVerifiedNow: "Verified just now",
    readingAccessory: "Reading your accessory…",
    confirmingAuthenticity: "Confirming authenticity",
    walletReady: "Your wallet is ready",
    openWallet: "Open wallet",
  },
  home: {
    welcomeTitle: "Your accessories, one place",
    welcomeBody:
      "Set up this phone to manage what you own — or open an accessory you’re holding.",
    welcomeSignIn: "Continue",
    welcomeHaveAccessory: "I have an accessory",
    emptyTitle: "No accessories yet",
    emptyBody: "Hold an accessory to open it, then claim it to see it here.",
    emptyOpenCta: "Hold to open",
    openAnother: "Open another",
    account: "Account",
    accountExportKey: "Export private key",
    accountExportKeySubtitle: "Reveal and copy this wallet’s private key.",
    accountSignOut: "Sign out",
    accountExportFailed: "Couldn’t open export",
    keysSubtitle: "Your keys",
    cards: "Cards",
    accessories: "Accessories",
    card: "Card",
    accessory: "Accessory",
    holdTitle: "Add accessory",
    holdBody: "Hold it to the top of your phone.",
  },
  address: {
    default: "address",
    wallet: "wallet",
    linkedWallet: "linked wallet",
    mintAddress: "token ID",
    mintOwner: "owner wallet",
    cardId: "card ID",
    recipient: "recipient",
    walletAddress: "wallet address",
    copiedToClipboard: "Copied",
    copyAria: (label: string, addr: string) => `Copy ${label} ${addr}`,
    copiedAria: (label: string) => `Copied ${label}`,
  },
  verify: {
    holdToCheck: "Hold to verify",
    introBody: "Hold your accessory to the top of your phone.",
    verifying: "Confirming authenticity…",
    verifyAgain: "Verify again",
    verifyAgainHint: "Hold to re-check",
    verifyCta: "Verify",
    verified: "Verified just now",
    verifiedAgainBody: "This accessory is authentic.",
    failed: "Couldn’t read the accessory",
    failedBody: "Try holding again.",
    holdStill: "Hold still…",
    holdStillBody: "Keep holding until this finishes.",
    verifiedRecheckAria: "Verified. Verify again.",
    notVerified: "Not verified",
    notVerifiedHint: "Hold your accessory to the top of your phone.",
    verifyingChip: "Confirming authenticity…",
    notSetUpTitle: "Not set up",
    notSetUpBody: "This accessory isn’t on Revibase yet.",
    loadTimedOut: "Taking too long",
    loadTimedOutBody: "Check your connection and try again.",
    verifyToUnlockShortcut: "Verify to unlock",
  },
  token: {
    verification: "Authenticity",
    linked: "Linked",
    notLinked: "Not linked",
    mintOwner: "Owner",
    cardId: "Card ID",
    cardIdHint: "Unique ID for this accessory.",
    about: "About",
    attributes: "Attributes",
    details: "Details",
    provenance: "Provenance",
    collection: "Collection",
    showMore: "More",
    showLess: "Less",
    showDetails: "Details",
    hideDetails: "Hide",
    mintAddress: "Token ID",
    itemLoadFailed: "Couldn’t load",
    itemNotOnChain: "This accessory may no longer be available.",
    unnamedCard: "Collectible",
    wrongItem: "Wrong accessory.",
  },
  shortcut: {
    heading: "Shortcuts",
    openInBrowser: "Open in browser",
    embedBlocked: "Can’t show this site here.",
    loading: "Loading…",
  },
  gate: {
    openInBrowserTitle: "Open in browser",
    openInBrowserBody:
      "This browser can’t use your accessory. Copy the link and open it in Chrome or Safari.",
    copyLink: "Copy link",
    openInSafari: "Open in Safari",
    linkCopied: "Link copied",
    linkCopyFailed: "Couldn’t copy",
  },
} as const;

/** User-facing send / verify error titles and bodies (see user-errors.ts). */
export const errorCopy = {
  fallback: {
    title: "Not completed",
    body: "Something went wrong. Try again.",
  },
  couldntVerify: {
    title: "Couldn’t verify",
    body: "Hold here again and try once more.",
  },
  notEnoughMoney: {
    title: "Not enough",
    body: "This wallet doesn’t have enough for that amount.",
  },
  paymentFailed: {
    title: "Not completed",
    body: "Couldn’t go through. Check the amount and try again.",
  },
  accessoryLocked: {
    title: "Locked",
    body: "Claim this accessory before a tap can send.",
  },
  signerCancelled: {
    title: "Cancelled",
    body: "Setup was cancelled. Try again when you’re ready.",
  },
  signerUnsupported: {
    title: "Passkey not supported",
    body: "This browser or device can’t create a synced passkey. Try Safari or Chrome on a phone that supports passkeys.",
  },
  signerFailed: {
    title: "Couldn’t continue",
    body: "Something went wrong unlocking this phone. Try again.",
  },
  sessionEnded: {
    title: "Timed out",
    body: "Hold here again to verify.",
  },
  accessoryNotReady: {
    title: "Not ready",
    body: "This item isn’t ready to send yet.",
  },
  wrongItem: {
    title: "Wrong item",
    body: "Hold the same item flat against your phone.",
  },
  nfcVerifyFailed: {
    title: "Couldn’t verify",
    body: copy.verify.failedBody,
  },
  notSetUp: {
    title: copy.verify.notSetUpTitle,
    body: copy.verify.notSetUpBody,
  },
  itemNotFound: {
    title: "Not found",
    body: "Hold here again to verify.",
  },
  enterAmount: {
    title: "Enter amount",
    body: "Enter a valid amount.",
  },
  amountTooPrecise: {
    title: "Too many decimals",
    body: "Use fewer decimal places.",
  },
  tryAgainBody: {
    title: "Not completed",
    body: "Something went wrong. Try again.",
  },
} as const;
