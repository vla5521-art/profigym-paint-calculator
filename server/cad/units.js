const PREFIX_TO_MM = {
  EXA: 1e21,
  PETA: 1e18,
  TERA: 1e15,
  GIGA: 1e12,
  MEGA: 1e9,
  KILO: 1e6,
  HECTO: 1e5,
  DECA: 1e4,
  DECI: 100,
  CENTI: 10,
  MILLI: 1,
  MICRO: 1e-3,
  NANO: 1e-6,
  PICO: 1e-9,
  FEMTO: 1e-12,
  ATTO: 1e-15,
};

const CONVERSION_UNITS = {
  INCH: { symbol: 'in', millimetersPerUnit: 25.4 },
  FOOT: { symbol: 'ft', millimetersPerUnit: 304.8 },
  YARD: { symbol: 'yd', millimetersPerUnit: 914.4 },
};

export function detectStepUnits(content) {
  const upper = content.toUpperCase();
  const conversion = upper.match(/CONVERSION_BASED_UNIT\s*\(\s*'([^']+)'/);
  if (conversion) {
    const known = CONVERSION_UNITS[conversion[1]];
    if (known) return { source: conversion[1].toLowerCase(), ...known, normalizedTo: 'mm' };
  }

  const si = upper.match(/SI_UNIT\s*\(\s*(?:\.([A-Z]+)\.|\$)\s*,\s*\.METRE\.\s*\)/);
  if (si) {
    const prefix = si[1] || '';
    const millimetersPerUnit = prefix ? PREFIX_TO_MM[prefix] : 1000;
    const symbol = prefix === 'MILLI' ? 'mm' : prefix === 'CENTI' ? 'cm' : prefix === '' ? 'm' : `${prefix.toLowerCase()}m`;
    return { source: symbol, symbol, millimetersPerUnit, normalizedTo: 'mm' };
  }

  return { source: 'unknown', symbol: 'mm', millimetersPerUnit: 1, normalizedTo: 'mm', assumed: true };
}

export function areaUnits(squareMillimeters) {
  return {
    mm2: squareMillimeters,
    cm2: squareMillimeters / 100,
    m2: squareMillimeters / 1_000_000,
  };
}
