// Contract-address gate. Accepts any 32-44 character base58 string; never rejects on shape beyond that.
export const BASE58_CA = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export const isCa = (v) => typeof v === 'string' && BASE58_CA.test(v.trim());

/** Pure view model for the CA slot. Both branches are live; the record decides. */
export function caView(rec) {
  const state = rec && rec.state;
  const value = rec && typeof rec.value === 'string' ? rec.value.trim() : '';
  if (state === 'stated' && isCa(value)) return { branch: 'stated', value, copyable: true, text: value };
  if (state === 'unconfirmed') return { branch: 'unconfirmed', value: null, copyable: false, text: 'Address awaiting confirmation' };
  if (state === 'stated') return { branch: 'malformed', value: null, copyable: false, text: 'Address on record is not valid base58' };
  return { branch: 'absent', value: null, copyable: false, text: 'Address not stated yet' };
}
