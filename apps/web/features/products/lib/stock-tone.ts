export function stockTone(stock: number | null | undefined, threshold = 5) {
  if (stock === null || stock === undefined) return "text-[#2c1647]";
  if (stock <= 0) return "text-[#d11d52]";
  if (stock <= threshold) return "text-[#d97706]";
  return "text-[#159a63]";
}
