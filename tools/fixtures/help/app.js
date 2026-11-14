// Fixture for tools/check-conformance.mjs: the one-origin pattern.
// The Mesonet host for the dashboard and the API. At the cutover this becomes
// 'https://mesonet.climate.umt.edu'. Change it here, and in the CSP and README.
const MESONET_ORIGIN = 'https://mesonet2.climate.umt.edu';
// A comment naming the old form is not code: mesonet.climate.umt.edu/dash/next/
export const dashUrl = (id) => `${MESONET_ORIGIN}/dash/?s=${encodeURIComponent(id)}`;
export const API = `${MESONET_ORIGIN}/api/v2`;
