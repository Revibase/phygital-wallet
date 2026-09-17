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
    settingsFees: "Fees",
    /** Settings hub group for accessory permissions (DD-011). */
    settingsPermissions: "Permissions",
    approveSendsWith: "Approve sends with",
    approveWithPhone: "This phone",
    approveWithAccessory: "Your accessory",
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
    /** Form CTA — Hold UI appears only at awaitingPasskey (DD-004). */
    holdToSend: "Hold to send",
    confirmToSend: "Confirm on this phone",
    holdToReceive: "Hold to confirm",
    holdToIdentifyPayer: "Hold their accessory",
    holdToIdentifyPayerHint: "They hold once to link, then again to pay",
    nearbySummaryTitle: "Confirm receive",
    nearbySummaryBody: "Have them hold again to send this amount.",
    /** Owner-signed config: confirm on this phone (DD-006). */
    configChangeConfirmTitle: "Confirm on this phone",
    configChangeConfirmBody:
      "Tap below, then use your passkey to finish saving.",
    configChangeConfirmCta: "Confirm with passkey",
    configChangeConfirmPending: "Waiting for passkey…",
    save: "Save",
    holdToOpenTitle: "Hold to open",
    holdToOpenBody: "Hold this accessory against your phone.",
    holdToOpenBodyNamed: (name: string) => `Hold ${name} against your phone.`,
    holdToOpenCta: "Hold to open",
    holdMismatchTitle: "Different accessory",
    holdMismatchBody: (expected: string) =>
      `Hold ${expected} to continue, or open the one you just held.`,
    holdMismatchRetry: (expected: string) => `Hold ${expected}`,
    holdMismatchOpenHeld: (held: string) => `Open ${held} instead`,
    /** Shared Hold placement body — titles carry intent (DD-004). */
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
    signFeePayingTitle: "Covering fees",
    signFeePayingBody: "Adding network fees…",
    signSendingTitle: "Sending",
    signSendingBody: "Waiting for the network to confirm…",
    setupStepPasskey: "Step 1 of 2 · This phone",
    setupStepLink: "Step 2 of 2 · Link accessory",
    setupStepConfirm: "Step 2 of 2 · Confirm on this phone",
    setUpThisPhone: "Set up on this phone",
    setUpThisPhoneBody:
      "Unlock with a passkey already on this phone, or create one. Next you’ll hold the accessory to become the owner.",
    passkeyUnlockCta: "Unlock with passkey",
    passkeyCreateCta: "Create a new passkey",
    passkeyCreating: "Waiting for passkey…",
    passkeyLostTitle: "Can’t unlock this wallet",
    passkeyLostBody:
      "The passkey for this wallet isn’t available on this phone. Creating a new passkey starts a new wallet — it won’t recover the old one.",
    passkeyLostCreateCta: "Create a new wallet",
    usernameLabel: "Username",
    usernamePlaceholder: "yourname",
    usernameHint:
      "3–32 characters · letters, numbers, periods, underscores, hyphens",
    usernameContinue: "Create passkey",
    usernameTitle: "Choose a username",
    usernameBody:
      "This name identifies your passkey. Next, save a passkey on this phone.",
    usernameTaken: "That username is taken. Try another.",
    usernameInvalid:
      "Use 3–32 characters: letters, numbers, periods, underscores, and hyphens only.",
    max: "Max",
    restoreDefault: "Use Revibase",
    add: "Add",
    sent: "Sent",
    received: "Received",
    activityFailed: "Failed",
    ofAvailableAsset: (available: string, symbol: string) =>
      `${available} ${symbol} available`,
    checkingPayerBalance: "Checking their balance…",
    selectAsset: "Choose asset",
    sendCollectible: "Sending 1 collectible",
    insufficientBalance: "Not enough balance",
    insufficientAtaRent: "They need a little SOL to open your token account",
    insufficientAtaRentSend:
      "You need a little SOL to open their token account",
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
    confirmToTopUp: "Confirm on this phone",
    topUpPending: "Top-up sent. Balance updates shortly.",
    topUpSuccess: "Top-up submitted",
    // Accessory policy (what a tap may do)
    policy: "Accessory permissions",
    policyStatusStandard: "Everyday payments",
    policyStatusStandardBody:
      "A tap can send SOL and standard tokens with no amount caps until you set limits. Other programs stay blocked.",
    policyStatusOpen: "Protections off",
    policyStatusOpenBody:
      "Anyone with this accessory can move funds with no checks until you restore everyday payments.",
    policyStatusLimited: "Custom limits",
    policyStatusLimitedBody: "Only listed assets can leave with a tap.",
    policyStatusLocked: "Locked",
    policyStatusLockedBody:
      "Claim this accessory to turn on everyday payments.",
    policyLockedClaimCta: "Claim to unlock",
    /** Post-tap: no on-chain authority yet. */
    authorityChecking: "Checking ownership…",
    authoritySignInTitle: "Set up this phone to claim",
    authoritySignInBody:
      "Continue with a passkey, then hold your accessory once to become the owner.",
    authoritySignInCta: "Continue",
    authorityClaimBody:
      "Become the owner to turn on everyday payments. You’ll hold your accessory on the next step.",
    authorityClaimTitle: "Hold to claim",
    authorityClaimHoldBody:
      "Hold your accessory to the top of this phone to become the owner and turn on everyday payments.",
    authorityClaimCta: "Hold to claim",
    authorityClaiming: "Hold your accessory…",
    authorityClaimFailed: "Couldn’t claim this item",
    /** Claimed accessory, signed-out visitor — browse only. */
    claimedVisitorBanner:
      "This accessory has an owner. You can browse balances.",
    claimedVisitorBannerAction: "Details",
    otherOwnerBanner: "Owned by another account on this phone.",
    otherOwnerBannerAction: "Details",
    ownershipLabel: "Ownership",
    ownershipSignIn: "Continue on this phone",
    ownershipSignInSubtitle:
      "Unlock on this phone to claim or manage this accessory.",
    ownershipClaimFooter:
      "Claiming sets you as the owner and turns on everyday payments: a tap can send SOL and standard tokens with no amount caps until you set limits. Other programs stay blocked until you allow them.",
    ownershipOtherTitle: "Owned by another account",
    ownershipOtherSubtitle: (short: string) => `Owner · ${short}`,
    ownershipOtherFooter:
      "Only the owner can change permissions or unlink. After they unlink, anyone holding the accessory can claim it.",
    ownershipUnlink: "Unlink accessory",
    ownershipUnlinkSubtitle:
      "Disables the accessory until it is claimed again.",
    ownershipUnlinkTitle: "Unlink this accessory?",
    ownershipUnlinkCta: "Unlink",
    ownershipUnlinking: "Unlinking…",
    ownershipUnlinked: "Accessory unlinked",
    ownershipUnlinkFailed: "Couldn’t unlink this item",
    ownershipDangerZone: "Danger zone",
    policySolLabel: "SOL",
    /** Remaining allowance until the reset date (recurring window). */
    policyLeftUntil: (amount: string, symbol: string, date: string) =>
      `${amount} ${symbol} left · resets ${date}`,
    /** Remaining allowance for a one-time (lifetime) budget. */
    policyLeftLifetime: (amount: string, symbol: string) =>
      `${amount} ${symbol} left · one-time`,
    policyResetsOn: (date: string) => `Resets ${date}`,
    policyNoReset: "One-time — doesn’t reset",
    policyAssetsSummary: (count: number) =>
      `${count} spendable asset${count === 1 ? "" : "s"}`,
    policyHubLimited: (detail: string) => `Custom limits · ${detail}`,
    policyHubStandard: "Everyday payments",
    policyHubOpen: "Protections off",
    policyHubLocked: "Locked · no transactions",
    policyMore: "More",
    // Pre-save preview of what a tap will be allowed to do
    policyPreviewTitle: "After saving, a tap can:",
    policyPreviewStandard:
      "Send SOL and standard tokens. Other programs stay blocked.",
    policyPreviewSpend: (amount: string, phrase: string) =>
      `Spend up to ${amount}, ${phrase}`,
    policyPreviewBlocked: "All other assets are blocked",
    policyPreviewPrograms: (n: number) =>
      `${n} extra program rule${n === 1 ? "" : "s"}`,
    policyWindowDay: "Every day",
    policyWindowWeek: "Every week",
    policyWindowMonth: "Every month",
    policyWindowLifetime: "One-time",
    policyWindowHint: "Resets on a fixed UTC schedule.",
    policyWindowLabel: "Renew this limit",
    policyEdit: "Edit limits",
    policySet: "Limit what a tap can spend",
    policyPresetsTitle: "Quick setups",
    policyPresetApplied: "Spend limits applied",
    policyClaimedTitle: "Everyday payments are on",
    policyClaimedBody:
      "A tap can send SOL and standard tokens. Other programs stay blocked. You can add spend limits anytime.",
    policyClaimedStay: "Looks good",
    policyClaimedLimit: "Limit what a tap can spend",
    policySave: "Save",
    policySaved: "Permissions saved",
    policyRestore: "Restore everyday payments",
    policyRestored: "Everyday payments restored",
    policyRestoreConfirmTitle: "Restore everyday payments?",
    policyRestoreConfirmBody:
      "Removes your asset limits and extra program rules. A tap can again send SOL and standard tokens; other programs stay blocked.",
    policyTurnOff: "Turn off protections",
    policyTurnedOff: "Protections turned off",
    policyTurnOffConfirmTitle: "Turn off accessory protections?",
    policyTurnOffConfirmBody:
      "Anyone with this accessory can move funds with no checks until you restore everyday payments. Your owner key stays.",
    /** Exact phrase required before the turn-off confirm button enables. */
    policySignInToEdit: "Unlock on this phone to change permissions.",
    policyTokenLimits: "Spendable assets",
    policyTokenLimitsHint:
      "Add SOL or any token. A tap can only spend what you list.",
    policyAddToken: "Add an asset",
    policyPickToken: "Choose an asset",
    policyNoTokensToAdd: "No more assets to add",
    policyRemoveTokenAria: (symbol: string) => `Remove ${symbol}`,
    policyTokenAmountLabel: (symbol: string) => `${symbol} a tap can spend`,
    // Advanced — on-chain program permissions
    policyAdvanced: "Extra programs",
    policyProgramsHint:
      "Allow or block Solana programs beyond everyday payments.",
    policyProgramsNone: "No extra programs",
    policyAddProgram: "Add",
    policyProgramIdPlaceholder: "Program ID",
    policyProgramInvalid: "Enter a valid program ID",
    policyProgramDuplicate: "That program is already listed",
    policyAccessAllow: "Allow",
    policyAccessDeny: "Block",
    policyAccessCustom: "Custom rules",
    policyAccessAllowDanger:
      "Allow lets this program run any instruction, including nested calls. Only allow programs you trust.",
    policyRemoveProgramAria: (id: string) => `Remove program ${id}`,
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
    copySignature: "Copy signature",
    viewOnExplorer: "View on explorer",
    receiptPending: "Pending",
    receiptDetails: "Receipt",
    receiptTime: "Time",
    receiptType: "Type",
    receiptFee: "Network fee",
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
    approveSendTitle: "Approve this send?",
    approveSendBodyLimit: (limit: string) => `Over your $${limit} limit.`,
    approveSendBodyTime: "Sending isn’t allowed right now.",
    approveSendBodyApproval: "This send needs your one-time approval.",
    approveSendBodyFallback: "This send needs your one-time approval.",
    approveSendBodyInstruction:
      "This action isn’t allowed by your accessory permissions.",
    approveSendBodyProgram:
      "This program isn’t allowed by your accessory permissions.",
    approveSendBodyUnexpected:
      "This transaction couldn’t be checked against your settings.",
    approveSendSignInBody:
      "Unlock on this phone as the owner to approve once, then try again.",
    approveSendSignInCta: "Unlock on this phone",
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
    welcomeSignIn: "Continue on this phone",
    welcomeHaveAccessory: "I have an accessory",
    emptyTitle: "No accessories yet",
    emptyBody: "Hold an accessory to open it, then claim it to see it here.",
    emptyOpenCta: "Hold to open",
    openAnother: "Open another",
    addMoreTitle: "Add another",
    accessoriesCount: (count: number) =>
      count === 1 ? "1 linked" : `${count} linked`,
    oneItem: "1 item",
    manyItems: (count: number) => `${count} items`,
    accessoriesLoadFailed: "Couldn’t load your accessories.",
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
    loadingWallet: "Loading wallet…",
    walletUnknown: "Wallet unavailable",
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
  accessoryNeedsHold: {
    title: "Hold required",
    body: "Hold the accessory flat against your phone, then try again.",
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
  signerNeedsRelogin: {
    title: "Sign in again",
    body: "This phone’s wallet isn’t available here. Sign in again, then retry.",
  },
  signerPolicyRejected: {
    title: "Not allowed",
    body: "This phone can’t approve that transaction. Try again from settings.",
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
