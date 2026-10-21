/** EAN-8 / UPC-A / EAN-13: preserve leading zeros and verify the GS1 check digit. */
export function validBarcode(value: string): boolean {
  if (!/^(?:\d{8}|\d{12}|\d{13})$/.test(value)) return false;
  const sum = [...value].reverse().reduce((sum, digit, index) => sum + Number(digit) * (index % 2 ? 3 : 1), 0);
  return sum % 10 === 0;
}
