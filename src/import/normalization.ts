export function cleanDisplayName(value: string): string {
  return value.normalize("NFKC").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}
export function normalizeName(value: string): string { return cleanDisplayName(value).toLocaleLowerCase("ru-RU"); }
const transliteration: Readonly<Record<string, string>> = {а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"e",ж:"zh",з:"z",и:"i",й:"y",к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"h",ц:"c",ч:"ch",ш:"sh",щ:"sch",ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya"};
export function slugify(value: string): string {
  const normalized = normalizeName(value);
  let result = "";
  for (const char of normalized) result += transliteration[char] ?? char;
  return result.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48) || "item";
}
export function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 0x01000193); }
  return (hash >>> 0).toString(36).padStart(7, "0").slice(0, 7);
}
export function splitSubstrates(value: string | null): string[] {
  if (!value) return [];
  const seen = new Set<string>(); const result: string[] = [];
  for (const part of value.split(";")) { const display = cleanDisplayName(part); const key = normalizeName(display); if (display && !seen.has(key)) { seen.add(key); result.push(display); } }
  return result;
}
