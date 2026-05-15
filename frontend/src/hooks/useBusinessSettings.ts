import { useQuery } from "@tanstack/react-query";

import { api } from "../lib/api";

type OrgMe = {
  id: number;
  name?: string;
  business_type: string | null;
  business_settings: {
    modules?: Record<string, boolean>;
    units?: string[];
  };
};

export type BusinessSettings = {
  type: string | null;
  orgName: string | null;
  units: string[];
  hasModule: (name: string) => boolean;
  hasDelivery: boolean;
  hasWarranty: boolean;
  hasSerialNumbers: boolean;
  hasRepairs: boolean;
  hasExpiryDate: boolean;
  hasWeightScale: boolean;
  hasSizesColors: boolean;
  hasInstallment: boolean;
  hasBulkUnits: boolean;
  hasFastCheckout: boolean;
  hasFittingRoom: boolean;
  hasAgeGroups: boolean;
  hasPetTypes: boolean;
  hasPrescription: boolean;
  hasBatchTracking: boolean;
  hasMinOrderQty: boolean;
  hasInvoiceScan: boolean;
};

/**
 * Хук возвращает флаги модулей текущего магазина. Если шаблон не выбран
 * (business_type=null) или модуль не указан в settings — считаем включённым,
 * чтобы существующие магазины («Огонёк») не потеряли функционал.
 */
export function useBusinessSettings(): BusinessSettings {
  const { data } = useQuery({
    queryKey: ["org-me"],
    queryFn: async () => {
      const response = await api.get("/org/me");
      const org = response.data as OrgMe;
      if (org?.name) {
        try {
          localStorage.setItem("voltpos_last_org_name", org.name);
        } catch {
          // localStorage может быть недоступен (приватный режим) — игнорируем.
        }
      }
      return org;
    },
    staleTime: 5 * 60 * 1000,
  });

  const modules = data?.business_settings?.modules ?? {};
  const type = data?.business_type ?? null;
  const orgName = data?.name ?? null;
  const units = data?.business_settings?.units ?? ["шт"];

  const hasModule = (name: string): boolean => {
    if (type === null) return true; // legacy магазин — всё включено
    const value = modules[name];
    return value === undefined ? true : value; // неизвестные ключи = включены
  };

  return {
    type,
    orgName,
    units,
    hasModule,
    hasDelivery: hasModule("delivery"),
    hasWarranty: hasModule("warranty"),
    hasSerialNumbers: hasModule("serial_numbers"),
    hasRepairs: hasModule("repairs"),
    hasExpiryDate: hasModule("expiry_date"),
    hasWeightScale: hasModule("weight_scale"),
    hasSizesColors: hasModule("sizes_colors"),
    hasInstallment: hasModule("installment"),
    hasBulkUnits: hasModule("bulk_units"),
    hasFastCheckout: hasModule("fast_checkout"),
    hasFittingRoom: hasModule("fitting_room"),
    hasAgeGroups: hasModule("age_groups"),
    hasPetTypes: hasModule("pet_types"),
    hasPrescription: hasModule("prescription"),
    hasBatchTracking: hasModule("batch_tracking"),
    hasMinOrderQty: hasModule("min_order_qty"),
    // Платная фича распознавания накладных. Без явного включения супер-админом — выключена.
    hasInvoiceScan: Boolean((data as unknown as { has_invoice_scan?: boolean })?.has_invoice_scan),
  };
}
