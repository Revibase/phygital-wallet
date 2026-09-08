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
    showCardAria: "Back to object",
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
    holdToOpenBody: "Hold your accessory to the top of your phone.",
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
    receiveNearbyHint:
      "Use NFC to receive",
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
    accessAndRecovery: "This phone",
    accessAndRecoveryHint: "Link",
    accessAndRecoveryBody:
      "Your accessory authorizes spends. Linking it to this phone lets you change limits and approve exceptions.",
    accessClaimHint: "Claim",
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
    deviceLoginTitle: "Sign in",
    deviceLoginBody:
      "Manage linked accessories and spending limits with Face ID, fingerprint, or your screen lock.",
    homeSetupPasskeyBody: "Continue, then hold your accessory to claim it.",
    homeLinkSetupTitle: "Hold to claim",
    homeLinkSetupBody:
      "Hold your accessory to the top of your phone to finish claiming.",
    homeLinkConfirmTitle: "Confirm on this phone",
    homeLinkConfirmBody:
      "Use Face ID, fingerprint, or your screen lock to link this accessory to this phone.",
    homeLinkConfirmCta: "Confirm with Passkey",
    homeLinkConfirmPending: "Waiting for Face ID, fingerprint, or screen lock…",
    homeSetupPasskeyClaimTitle: "Make it yours",
    deviceLinkBody:
      "Claim this accessory so only this phone can change limits, recovery, and approval.",
    deviceLinkCta: "Hold to claim",
    deviceVisitorUnlinkedNotice: "Make this yours",
    deviceVisitorLinkAction: "Claim",
    deviceAuthReady: "Signed in on this phone",
    deviceUnlink: "Unlink this phone",
    deviceUnlinkConfirmTitle: "Unlink this phone?",
    deviceUnlinkConfirmBody:
      "Limits turn off. Anyone who holds the accessory can claim it on their phone.",
    deviceUnlinkConfirmCta: "Unlink",
    deviceUnlinkConfirmCancel: "Cancel",
    deviceUnlinkPolicyWarn: "Limits turn off when you unlink.",
    deviceUnlinkBefore: "Before you unlink",
    deviceUnlinkBlockersFooter:
      "Clear these while this phone is linked. Limits turn off when you unlink.",
    deviceUnlinkNeedsRecovery:
      "Clear the recovery address before unlinking.",
    deviceUnlinkNeedsSigning:
      "Switch back to the Revibase transaction verifier before unlinking.",
    deviceUnlinkClearRecoveryCta: "Clear",
    deviceUnlinkRestoreSigningCta: "Use Revibase",
    deviceUnlinkStepNeeded: "Required",
    deviceUnlinked: "Unlinked. Limits are off.",
    deviceAddAccessory: "Add accessory",
    claimTitle: "Make it yours",
    claimBody:
      "Link this accessory to this phone. Takes about 10 seconds. Only this phone can then change limits, recovery, and approval.",
    claimCta: "Continue with Passkey",
    claimNotNow: "Not now",
    claimHoldToContinue: "Hold to continue",
    claimDesktopHint:
      "Open this on your phone to claim with Face ID, fingerprint, or screen lock.",
    claimTryAgain: "Try again",
    claimBannerAction: "Claim",
    claimBannerTitle: "Make this yours",
    claimSuccessTitle: "Linked to this phone",
    claimSuccessBody:
      "Only this phone can change limits, recovery, and approval.",
    claimSuccessCta: "Continue",
    claimSignInTitle: "Sign in",
    claimSignInBody:
      "Continue to manage limits, recovery, and approval on this phone.",
    limitsLinkedElsewhereTitle: "Linked to another phone",
    limitsLinkedElsewhereBody:
      "Unlink on that phone first, then come back here to claim.",
    limitsStatusOff: "Not set",
    limitsStatusOn: "On",
    limitsStatusSetup: "Claim",
    limitsStatusRequiresClaim: "Requires claim",
    limitsStatusInvalid: "Needs fix",
    limitsInvalidBody:
      "Saved limits are invalid. Save again to restore protection.",
    limitsTurnOff: "Turn off spend caps",
    limitsTurnedOff: "Spend caps off",
    policyRemoved: "Send protections off",
    openApprovalContinue: "Approved — they can hold to finish",
    nearbyPolicyTitle: "Needs approval",
    nearbyPolicyBody:
      "Over their limits. Ask them to approve once on their linked phone, then try again.",
    nearbyPolicyFeeBody:
      "They need more network fees. Ask them to top up, then try again.",
    nearbyPolicyGotIt: "Got it",
    visitorNeedsApprovalBody:
      "Ask the owner to approve this send on their linked phone. When they approve, you’ll hold your accessory to finish.",
    visitorNeedsApprovalHint:
      "Your amount and recipient stay filled in. Requests expire in about 5 minutes.",
    visitorDeniedTitle: "Send not approved",
    visitorDeniedBody: "The owner declined this send.",
    openApprovalDenied: "Declined",
    signingBody:
      "Every transaction needs your accessory and a verifier that co-signs. Revibase is the default — it checks your limits before it signs.",
    signingCustomPolicyWarn:
      "This replaces Revibase as your transaction verifier. Revibase will no longer check spending limits, recipients, programs, or one-time approvals. Only use a verifier you trust.",
    signingCustomAck:
      "I understand I’m replacing the Revibase transaction verifier and its protections on every send.",
    signingCustomContinue: "Continue",
    signingCustomSaved: "Custom transaction verifier on — Revibase protections off",
    signingRestored: "Back to Revibase",
    signingInvalidCustom: "Enter a valid address and HTTPS URL",
    signingCurrent: "Current",
    signingDefault: "Revibase",
    signingCustom: "Custom",
    useCustomSigning: "Use a custom transaction verifier…",
    customEndpoint: "Verifier URL",
    customVerifier: "Verifier public key",
    verifierPubkey: "Solana address",
    setupDeviceNotLinked: "Not linked",
    setupDeviceLinkedElsewhere: "Linked elsewhere",
    setupDeviceSignIn: "Sign in",
    setupDeviceLinkedHere: "Linked here",
    policyDefaultSigningOnly:
      "Caps and allow lists apply to built-in wallet sends. Exception programs are unrestricted.",
    policySection: "Limits",
    sendProtections: "Send protections",
    sendProtectionsHint:
      "When on, this wallet can only call built-in wallet and collectible programs — unless you add exceptions.",
    sendProtectionsOff: "Off",
    sendProtectionsOffBody:
      "Any program is allowed. No spend caps or recipient allow list.",
    sendProtectionsOn: "On",
    sendProtectionsOnBody:
      "Built-in wallet programs are allowed. Set spend caps, recipients, and exceptions below.",
    sendProtectionsTurnOn: "Turn on send protections",
    sendProtectionsTurnOff: "Turn off send protections",
    sendProtectionsTurnOffConfirm:
      "This removes spend caps, recipient allow list, and exceptions. Any program will be allowed again.",
    sendProtectionsRequired:
      "Turn on send protections first to set spend caps, recipients, or exceptions.",
    unrestrictedAppsWarn:
      "Exception programs can move funds without your USDC/SOL caps or allow list.",
    unrestrictedAppsHint: "Exceptions",
    approveSendTitle: "Approve this send?",
    approveSendBodyLimit: (limit: string) => `Over your $${limit} limit.`,
    approveSendBodyRecipient: "Address isn’t on your allowed people list.",
    approveSendBodyRecipientDenied: "This address is blocked.",
    approveSendBodyTime: "Sending isn’t allowed right now.",
    approveSendBodyApproval: "This send needs your one-time approval.",
    approveSendBodyInstruction:
      "This action isn’t allowed by your standing settings.",
    approveSendBodyProgram:
      "This program isn’t allowed by your standing settings.",
    approveSendBodyUnexpected:
      "This transaction couldn’t be checked against your settings.",
    approveSendAmount: "Amount",
    approveSendDestination: "To",
    approveSendMint: "Token",
    approveSendProgram: "Program",
    approveSendInstruction: "Action",
    approveOnce: "Approve once",
    denyOnce: "Deny",
    changeLimits: "Change settings",
    sendBlockedHard:
      "This can’t be approved once — it would fail on-chain.",
    spendingLimits: "Spending limits",
    spendingLimitsHint:
      "Caps cover USDC and SOL on built-in wallet sends. Larger sends need a one-time approval. They do not apply to exceptions.",
    spendingLimitsOff: "Off",
    spendingLimitsOffBody: "No USDC or SOL spend caps on built-in sends.",
    spendingLimitsOn: "On",
    spendingLimitsOnBody: (usdc: string, sol: string) => {
      const hasUsdc = usdc !== "—";
      const hasSol = sol !== "—";
      if (hasUsdc && hasSol) {
        return `Up to ${usdc} USDC and ${sol} SOL per built-in send without a one-time approval.`;
      }
      if (hasUsdc) {
        return `Up to ${usdc} USDC per built-in send without a one-time approval. SOL is uncapped.`;
      }
      if (hasSol) {
        return `Up to ${sol} SOL per built-in send without a one-time approval. USDC is uncapped.`;
      }
      return "Spend caps are on.";
    },
    spendingLimitsInvalid: "Needs fix",
    spendingLimitsInvalidBody:
      "Saved limits are invalid. Save again to restore protection.",
    spendingLimitsAdvanced: "Set caps",
    spendingLimitsAdvancedHide: "Hide caps",
    spendingLimitsAdvancedHint:
      "Suggested starting caps are 50 USDC and 0.1 SOL. Change them, then save.",
    spendingLimitsSaveTurnsOn: "Saving turns on these spend caps.",
    spendingLimitsSaveNeedsCap: "Enter a USDC or SOL cap to turn spend limits on.",
    maxPerSend: "Max USDC per send",
    maxSolPerSend: "Max SOL per send",
    recipients: "Recipients",
    recipientsHint:
      "Allow lists cover who you pay on built-in wallet sends — not exception programs.",
    recipientsAnyone: "Anyone",
    recipientsAllowlist: "Allow list",
    recipientsAllAllowed: "Anyone",
    recipientsAllAllowedBody:
      "No recipient restriction. Built-in sends can go to any address.",
    recipientsAnyoneActive: "Anyone",
    recipientsAnyoneActiveBody:
      "Recipient allow list is off. Built-in sends can go to any address.",
    recipientsRestricted: "Allow list only",
    recipientsRestrictedBody:
      "Only these addresses can be paid on built-in sends without a one-time approval.",
    recipientsAdvanced: "Manage",
    recipientsAdvancedHide: "Hide",
    recipientsAdvancedHint:
      "Use wallet addresses. Matching token accounts are applied automatically.",
    recipientsEmpty: "No addresses yet",
    recipientsNeedAddress: "Add at least one address for an allow list.",
    extraPrograms: "Exceptions",
    extraProgramsHint:
      "Send protections allow built-in wallet programs. Add an exception only if you need another program (for example a DEX).",
    extraProgramsAllAllowed: "All programs",
    extraProgramsAllAllowedBody:
      "Send protections are off — any program is allowed.",
    extraProgramsBuiltIn: "Built-in only",
    extraProgramsBuiltInBody:
      "Standard wallet and collectible programs. Caps and recipient rules apply here.",
    extraProgramsWithUnrestricted: (count: number) =>
      count === 1
        ? "Built-in + 1 exception"
        : `Built-in + ${count} exceptions`,
    extraProgramsWithUnrestrictedBody:
      "Exception programs can move funds without your USDC/SOL caps or allow list.",
    extraProgramsProtected: "Built-in",
    extraProgramsProtectedHint: "Included with send protections.",
    extraProgramsUnrestricted: "Exceptions",
    extraProgramsUnrestrictedHint:
      "Any instruction on these programs is allowed — no spend or recipient checks.",
    extraProgramsAddCta: "Add exception",
    extraProgramsAddConfirm:
      "This program can move funds without your USDC/SOL caps or allow list. Continue?",
    extraProgramsAddConfirmCta: "Add exception",
    extraProgramsEmpty: "None",
    extraProgramsAlreadyBuiltIn: "That program is already in the built-in set.",
    extraProgramsShowBuiltIn: "Show built-in programs",
    extraProgramsHideBuiltIn: "Hide built-in programs",
    invalidProgramId: "Enter a valid program ID",
    programId: "Program ID",
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
    emptyTitle: "Hold an accessory to add it",
    emptyBody: "Hold it to the top of your phone.",
    keysTitle: "Your keys",
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
    rarity: "Rarity",
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
    openInBrowserBody: "Open this link in your phone’s browser to continue.",
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
    body: "This item can’t send right now.",
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
