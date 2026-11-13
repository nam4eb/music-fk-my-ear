/** One private owner: never reassign an existing music library on login. */
export type GoogleOwnerIdentity = { email: string; sub: string };
export type ExistingOwner = { email: string; google_sub: string | null };
export function ownerDenial(identity: GoogleOwnerIdentity, configuredEmail: string, current: ExistingOwner | null): 'unapproved-email' | 'existing-owner-mismatch' | null {
  if (identity.email !== configuredEmail.toLowerCase()) return 'unapproved-email';
  if (current && (current.email.toLowerCase() !== identity.email || (current.google_sub !== null && current.google_sub !== identity.sub))) return 'existing-owner-mismatch';
  return null;
}
