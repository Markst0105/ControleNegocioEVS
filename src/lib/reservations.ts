export type ReservationStatus = "open" | "confirmed" | "cancelled" | "converted";

export const RESERVATION_STATUSES: ReservationStatus[] = [
  "open",
  "confirmed",
  "cancelled",
  "converted",
];

export const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
  open: "Aberta",
  confirmed: "Confirmada",
  cancelled: "Cancelada",
  converted: "Convertida",
};

export function isReservationStatus(
  value: string | null | undefined,
): value is ReservationStatus {
  return RESERVATION_STATUSES.includes(value as ReservationStatus);
}

export function reservationCanCancel(status: string): boolean {
  return status === "open" || status === "confirmed";
}

export function reservationCanConfirm(status: string): boolean {
  return status === "open";
}

export function reservationCanConvert(status: string): boolean {
  return status === "open" || status === "confirmed";
}
