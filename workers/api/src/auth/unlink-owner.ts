/**
 * Owner unlink: drop the device link, then clear standing policy so the next
 * claim starts with limits Off.
 */
export async function unlinkOwnerAndResetPolicy(args: {
  deleteLink: () => Promise<boolean>;
  deletePolicy: () => Promise<void>;
}): Promise<boolean> {
  const ok = await args.deleteLink();
  if (!ok) return false;
  await args.deletePolicy();
  return true;
}
