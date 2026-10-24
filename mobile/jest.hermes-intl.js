/**
 * Every mobile test runs with the Intl the iPhone actually has, not Node's.
 *
 * Hermes, the engine the app runs on, implements only Intl.Collator,
 * Intl.DateTimeFormat and Intl.NumberFormat (plus getCanonicalLocales), and
 * on iOS no NumberFormat.prototype.formatToParts. Node ships the full ICU set,
 * so code calling anything else passed every test here and then crashed on
 * the phone: TestFlight 0.1.0 (1) died on People and Today in
 * `new Intl.RelativeTimeFormat(...)`.
 *
 * Source: facebook/hermes at hermes-v250829098.0.17, the Hermes V1 that React
 * Native 0.86 ships by default:
 * - lib/VM/JSLib/Intl.cpp, createIntlObject, defines the three constructors;
 * - lib/Platform/Intl/PlatformIntlApple.mm leaves NumberFormat.formatToParts
 *   unimplemented.
 * DateTimeFormat.prototype.formatToParts exists on iOS and stays.
 */

const KEEP = new Set(['Collator', 'DateTimeFormat', 'NumberFormat', 'getCanonicalLocales'])

for (const name of Object.getOwnPropertyNames(Intl)) {
  if (!KEEP.has(name)) delete Intl[name]
}
delete Intl.NumberFormat.prototype.formatToParts
delete Intl.NumberFormat.prototype.formatRange
delete Intl.NumberFormat.prototype.formatRangeToParts
delete Intl.DateTimeFormat.prototype.formatRange
delete Intl.DateTimeFormat.prototype.formatRangeToParts
