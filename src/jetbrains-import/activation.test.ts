import { shouldOfferImport } from './activation';

describe('shouldOfferImport', () => {
  it('offers the import when configurations exist and no flag is set', () => {
    expect(shouldOfferImport({ hasConfigs: true, done: false, dismissed: false })).toBe(true);
  });

  it('does not offer once an import has already been completed', () => {
    expect(shouldOfferImport({ hasConfigs: true, done: true, dismissed: false })).toBe(false);
  });

  it('does not offer once the prompt was permanently dismissed', () => {
    expect(shouldOfferImport({ hasConfigs: true, done: false, dismissed: true })).toBe(false);
  });

  it('does not offer when no configurations were discovered', () => {
    expect(shouldOfferImport({ hasConfigs: false, done: false, dismissed: false })).toBe(false);
  });
});
