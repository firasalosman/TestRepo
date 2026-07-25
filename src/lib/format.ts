export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function formatDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export const CATEGORY_LABELS: Record<string, string> = {
  HOTEL: "Hotel",
  CAR_RENTAL: "Car Rental",
  TORONTO_CONDO_RENTAL: "Toronto Condo Rental",
  GROUND_TRANSPORTATION_UBER: "Ground Transportation – Uber",
  RAIL_TRANSPORTATION: "Rail Transportation",
  OTHER_POTENTIAL: "Other Potential Business Expense",
};

export const STATUS_LABELS: Record<string, string> = {
  CONFIRMED: "Confirmed",
  NEEDS_REVIEW: "Needs Review",
  REJECTED: "Rejected",
  PERSONAL: "Personal",
  DUPLICATE: "Duplicate",
};
