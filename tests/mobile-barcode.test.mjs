import test from 'node:test';
import assert from 'node:assert/strict';
import { validBarcode } from '../apps/desktop/src/mobile/barcode.ts';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/desktop/package.json', import.meta.url));
const { BarcodeFormat, DecodeHintType, MultiFormatOneDReader, RGBLuminanceSource, HybridBinarizer, BinaryBitmap } = require('@zxing/library');

test('phone barcode validation preserves UPC leading zeroes and rejects invalid input', () => {
  for (const value of ['4006381333931', '036000291452', '0036000291452', '96385074']) assert.equal(validBarcode(value), true, value);
  for (const value of ['', '123', '4006381333932', '036000291452 ', '４００６３８１３３３９３１', '03600029145x']) assert.equal(validBarcode(value), false, value);
});

test('bundled one-dimensional decoder reads a complete UPC barcode image', () => {
  // Fixed UPC-A 036000291452 image: quiet zones, guards, six left and six right digits.
  const bits = '000000000000101' + '0001101' + '0111101' + '0101111' + '0001101' + '0001101' + '0001101'
    + '01010' + '1101100' + '1110100' + '1100110' + '1011100' + '1001110' + '1101100' + '101000000000000';
  const width = bits.length * 3, height = 100;
  const pixels = Uint8ClampedArray.from({ length: width * height }, (_, index) => bits[Math.floor(index % width / 3)] === '1' ? 0 : 255);
  const hints = new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.UPC_A, BarcodeFormat.EAN_8]], [DecodeHintType.TRY_HARDER, true]]);
  const reader = new MultiFormatOneDReader(hints);
  const result = reader.decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels, width, height))), hints);
  assert.equal(result.getText(), '036000291452');
  assert.equal(validBarcode(result.getText()), true);
});
