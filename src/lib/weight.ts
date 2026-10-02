const WEIGHT_WITH_TWO_DECIMALS = /^\d+(?:[.,]\d{1,2})?$/;

export function parseWeight(value: string): number | null {
  const normalizedValue = value.trim();
  if (!WEIGHT_WITH_TWO_DECIMALS.test(normalizedValue)) return null;

  const weight = Number(normalizedValue.replace(',', '.'));
  return Number.isFinite(weight) ? weight : null;
}

export function formatWeight(value: number): string {
  return value.toLocaleString('es-CO', { maximumFractionDigits: 2 });
}
