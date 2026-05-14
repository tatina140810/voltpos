import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
/**
 * Хук возвращает флаги модулей текущего магазина. Если шаблон не выбран
 * (business_type=null) или модуль не указан в settings — считаем включённым,
 * чтобы существующие магазины («Огонёк») не потеряли функционал.
 */
export function useBusinessSettings() {
    const { data } = useQuery({
        queryKey: ["org-me"],
        queryFn: async () => {
            const response = await api.get("/org/me");
            const org = response.data;
            if (org?.name) {
                try {
                    localStorage.setItem("voltpos_last_org_name", org.name);
                }
                catch {
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
    const hasModule = (name) => {
        if (type === null)
            return true; // legacy магазин — всё включено
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
    };
}
