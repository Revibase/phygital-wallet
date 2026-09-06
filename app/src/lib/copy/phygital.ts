/**
 * Revibase brand stack — company first, products second.
 *
 * All user-facing UX strings live here. Import nested groups:
 * `copy.verify.holdToCheck`, `copy.wallet.*`, etc.
 *
 * Voice: short labels, one-line bodies, plain words over jargon.
 * Titles name what the screen is; subtitles show current state.
 */

export const brand = {
  company: "Revibase",
  companyLegal: "Revibase",
  /** Hex for PWA / OG / viewport chrome (Luminous Object pearl / warm dark). */
  chromeLight: "#F7F4EF",
  chromeDark: "#1A1F1E",
} as const;

export const products = {
  home: {
    name: "Your keys",
    tagline: "Accessories linked to this phone",
  },
  token: {
    name: "Wallet",
    tagline: "Your luminous NFC wallet",
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
    devnet: "Devnet",
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
    settingsMoney: "Money",
    settingsSafety: "Safety",
    settingsSendProtections: "Send protections",
    /** Who cosigns sends (not authenticity verify). Replaces Revibase when custom. */
    signing: "Send signing",
    rpcConnection: "Network",
    rpcBody: "Where this wallet loads balances and collectibles from.",
    rpcDefault: "Default",
    rpcCustom: "Custom",
    rpcCustomPrompt: "Use your own URL…",
    rpcCustomHint: "Paste an HTTPS Solana RPC URL. Keys stay on this phone.",
    rpcUrlLabel: "URL",
    rpcSwitch: "Switch",
    rpcSwitchedDefault: "Using default network",
    rpcSwitchedCustom: "Using custom network",
    rpcBannerTitle: "Custom network",
    rpcBannerBody: (endpoint: string) => `Via ${endpoint}`,
    rpcBannerChange: "Change",
    rpcInvalidUrl: "Enter a valid HTTPS URL",
    advanced: "Advanced",
    backToCard: "Object",
    backToCardChip: "Object",
    toWalletChip: "Wallet",
    openWalletAriaLabel: "Open wallet",
    modeObject: "Object",
    modeWallet: "Wallet",
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
    save: "Save",
    holdToOpenTitle: "Hold to open",
    holdToOpenBody: "Hold your accessory to the top of your phone.",
    holdToOpenCta: "Hold to open",
    holdCeremonyTitle: "Hold your accessory",
    holdCeremonyBody: "Hold it to the top of your phone until this finishes.",
    setupStepPasskey: "Step 1 of 2 · This phone",
    setupStepLink: "Step 2 of 2 · Link accessory",
    continueWithPasskey: "Continue",
    setUpThisPhone: "Set up this phone",
    newPhoneHint: "New on this phone?",
    max: "Max",
    restoreDefault: "Use Revibase",
    add: "Add",
    sent: "Sent",
    received: "Received",
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
    feeBalanceHint: "Prepaid SOL used to cover network fees on your sends.",
    feeBalanceLow: "Network fees are low. Top up before sending.",
    feeBalanceInsufficient: "Not enough network fees. Top up to continue.",
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
    shareAddress: "Share address",
    share: "Share",
    copied: "Copied",
    receiveAnything: "Receive SOL, tokens, and collectibles here",
    receiveNearby: "Receive from someone nearby",
    receiveNearbyHint:
      "Enter an amount, then they hold twice — once to link, once to pay",
    refresh: "Refresh",
    refreshing: "Refreshing…",
    lastUpdated: (value: string) => `Updated ${value}`,
    contacts: "Contacts",
    saveContact: "Save contact",
    contactName: "Name",
    contactNote: "Note",
    noContacts: "No contacts yet",
    useContact: "Use",
    removeContact: "Remove",
    contactsHint: "Saved from sends on this phone.",
    firstRunTitle: "Nothing here yet",
    firstRunBody:
      "Receive money here. Hold your accessory to your phone when you send.",
    firstRunCta: "Receive",
    firstRunDismiss: "Not now",
    networkFeeSponsored: (amountUi: string) =>
      `Network fee ~${amountUi} SOL (sponsored)`,
    networkFeeShort: (amountUi: string) => `~${amountUi} SOL network fee`,
    copySignature: "Copy signature",
    viewOnExplorer: "View on explorer",
    receiptPending: "Pending",
    receiptDetails: "Receipt",
    receiptTime: "Time",
    accessAndRecovery: "This phone",
    accessAndRecoveryHint: "Link and recovery",
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
    homeHaveItemHint: "Have an accessory? Hold it to your phone",
    homeLinkSetupTitle: "Hold to claim",
    homeLinkSetupBody:
      "Hold your accessory to the top of your phone to finish claiming.",
    homeSetupPasskeyClaimTitle: "Make it yours",
    deviceLinkBody:
      "Claim this accessory so only this phone can change limits, recovery, and approval.",
    deviceLinkCta: "Hold to claim",
    deviceVisitorNotice: "Linked to another phone",
    deviceVisitorUnlinkedNotice: "Make this yours",
    deviceVisitorLinkAction: "Claim",
    deviceVisitorSoftDeny:
      "Over the owner’s limits. Ask them to approve once on their linked phone.",
    deviceAuthReady: "Signed in on this phone",
    deviceUnlink: "Unlink this phone",
    deviceUnlinkConfirmTitle: "Unlink this phone?",
    deviceUnlinkConfirmBody:
      "Limits turn off. Anyone who holds the accessory can claim it on their phone.",
    deviceUnlinkConfirmCta: "Unlink",
    deviceUnlinkConfirmCancel: "Cancel",
    deviceUnlinkPolicyWarn:
      "Recovery and send signing can only be changed while this phone is linked. Limits turn off when you unlink.",
    deviceUnlinkNeedsRecovery:
      "Clear the recovery address before unlinking.",
    deviceUnlinkNeedsSigning:
      "Switch back to Revibase signing before unlinking.",
    deviceUnlinkClearRecoveryCta: "Clear recovery",
    deviceUnlinkRestoreSigningCta: "Use Revibase",
    deviceUnlinkStepNeeded: "Required",
    deviceUnlinked: "Unlinked. Limits are off.",
    deviceAddAccessory: "Add accessory",
    claimTitle: "Make it yours",
    claimBody:
      "Link this accessory to this phone. Takes about 10 seconds. Only this phone can then change limits, recovery, and approval.",
    claimCta: "Continue with Passkey",
    claimContinue: "Claim",
    claimNotNow: "Not now",
    claimHoldToContinue: "Hold to continue",
    claimHoldBody:
      "Hold your accessory to the top of your phone to finish claiming.",
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
    limitsSetupTitle: "Set up spending limits",
    limitsSetupBody:
      "Claim this accessory, then choose your caps. Limits apply with Revibase approval.",
    limitsSetupCta: "Continue",
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
    openApprovalContinue: "They can continue in their app",
    openApprovalsTitle: "Approve a pending send",
    openApprovalsLater: "Later",
    nearbyPolicyTitle: "Needs approval",
    nearbyPolicyBody:
      "Over their limits. Ask them to approve once on their linked phone, then try again.",
    nearbyPolicyFeeBody:
      "They need more network fees. Ask them to top up, then try again.",
    nearbyPolicyGotIt: "Got it",
    signingBody:
      "Every send needs your accessory and a signing service that co-signs. Revibase is the default — it checks your limits before it signs.",
    signingCustomPolicyWarn:
      "This replaces Revibase as the service that co-signs your sends. Revibase will no longer check spending limits, recipients, programs, or one-time approvals. Only use a service you trust.",
    signingCustomAck:
      "I understand I’m replacing Revibase signing and its protections on every send.",
    signingCustomContinue: "Continue",
    signingCustomSaved: "Custom signing on — Revibase protections off",
    signingRestored: "Back to Revibase",
    signingInvalidCustom: "Enter a valid address and HTTPS URL",
    signingCurrent: "Current",
    signingDefault: "Revibase",
    signingCustom: "Custom",
    useCustomSigning: "Use a custom signing service…",
    customEndpoint: "Service URL",
    customVerifier: "Service public key",
    verifierPubkey: "Solana address",
    setupDeviceNotLinked: "Not linked",
    setupDeviceLinkedElsewhere: "Linked elsewhere",
    setupDeviceSignIn: "Sign in",
    setupDeviceLinkedHere: "Linked here",
    policyDefaultSigningOnly:
      "Each control is separate. Caps and allow lists cover standard sends only — not unrestricted programs.",
    policySection: "Limits",
    unrestrictedAppsWarn:
      "Unrestricted programs can move funds without your USDC/SOL caps or allow list.",
    unrestrictedAppsHint: "Programs unrestricted",
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
    changeLimits: "Change settings",
    sendBlockedHard:
      "This can’t be approved once — it would fail on-chain.",
    spendingLimits: "Spending limits",
    spendingLimitsHint:
      "Caps cover USDC and SOL on standard wallet sends. Larger sends need a one-time approval. They do not apply to unrestricted programs.",
    spendingLimitsOff: "Off",
    spendingLimitsOffBody:
      "No USDC or SOL spend caps. You can still restrict recipients or programs separately.",
    spendingLimitsOn: "On",
    spendingLimitsOnBody: (usdc: string, sol: string) => {
      const hasUsdc = usdc !== "—";
      const hasSol = sol !== "—";
      if (hasUsdc && hasSol) {
        return `Up to ${usdc} USDC and ${sol} SOL per standard send without a one-time approval.`;
      }
      if (hasUsdc) {
        return `Up to ${usdc} USDC per standard send without a one-time approval. SOL is uncapped on standard sends.`;
      }
      if (hasSol) {
        return `Up to ${sol} SOL per standard send without a one-time approval. USDC is uncapped on standard sends.`;
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
    spendingLimitsSaveTurnsOn:
      "Saving turns on these spend caps and limits you to built-in programs (unless you add unrestricted ones).",
    spendingLimitsSaveNeedsCap: "Enter a USDC or SOL cap to turn spend limits on.",
    maxPerSend: "Max USDC per send",
    maxSolPerSend: "Max SOL per send",
    recipients: "Recipients",
    recipientsHint:
      "Allow lists cover who you pay on standard wallet sends — not unrestricted programs.",
    recipientsAnyone: "Anyone",
    recipientsAllowlist: "Allow list",
    recipientsAllAllowed: "Anyone",
    recipientsAllAllowedBody:
      "No recipient restriction. Standard sends can go to any address.",
    recipientsAnyoneActive: "Anyone",
    recipientsAnyoneActiveBody:
      "Recipient allow list is off. Standard sends can go to any address.",
    recipientsRestricted: "Allow list only",
    recipientsRestrictedBody:
      "Only these addresses can be paid on standard sends without a one-time approval.",
    recipientsAdvanced: "Manage",
    recipientsAdvancedHide: "Hide",
    recipientsAdvancedHint:
      "Use wallet addresses. Matching token accounts are applied automatically. Saving an allow list also limits you to built-in programs.",
    recipientsEmpty: "No addresses yet",
    recipientsNeedAddress: "Add at least one address for an allow list.",
    extraPrograms: "Programs",
    extraProgramsHint:
      "Without send protections, any program is allowed. Turning on spend caps or a recipient allow list also limits you to built-in programs. Add unrestricted programs only if you need them.",
    extraProgramsAllAllowed: "All programs",
    extraProgramsAllAllowedBody:
      "No standing policy — Revibase does not restrict which programs this wallet can call.",
    extraProgramsBuiltIn: "Built-in only",
    extraProgramsBuiltInBody:
      "Standard wallet and collectible programs. Spend caps and recipient rules apply on scoped paths.",
    extraProgramsWithUnrestricted: (count: number) =>
      count === 1
        ? "Built-in + 1 unrestricted"
        : `Built-in + ${count} unrestricted`,
    extraProgramsWithUnrestrictedBody:
      "Added programs can move funds without your USDC/SOL caps or allow list.",
    extraProgramsRestricted: "Built-in only",
    extraProgramsRestrictedBody:
      "Only built-in wallet programs are allowed unless you add unrestricted ones.",
    extraProgramsAdvanced: "Manage",
    extraProgramsAdvancedHide: "Hide",
    extraProgramsProtected: "Built-in",
    extraProgramsProtectedHint:
      "Scoped wallet and collectible sends. Caps and recipient rules apply on these instruction paths.",
    extraProgramsCompanions: "Collectible helpers",
    extraProgramsCompanionsHint:
      "Included for collectible transfers. Any instruction is allowed — no spend or recipient checks.",
    extraProgramsUnrestricted: "Added (unrestricted)",
    extraProgramsUnrestrictedHint:
      "Any instruction on these programs is allowed — no spend or recipient checks.",
    extraProgramsAddConfirm:
      "This program can move funds without your USDC/SOL caps or allow list. Continue?",
    extraProgramsAddConfirmCta: "Add unrestricted program",
    extraProgramsEmpty: "None — built-in programs only",
    extraProgramsAdded: "Unrestricted",
    extraProgramsAllowAllCta: "Allow all programs",
    extraProgramsOrphanBody:
      "Only built-in programs are allowed, with no spend caps or recipient list. Remove this limit to allow any program again.",
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
