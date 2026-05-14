import { create } from "zustand";
export const useSaleStore = create((set) => ({
    items: [],
    addItem: (item) => set((state) => {
        const existing = state.items.find((i) => i.productId === item.productId);
        if (existing) {
            return {
                items: state.items.map((i) => i.productId === item.productId ? { ...i, quantity: i.quantity + 1 } : i),
            };
        }
        return { items: [...state.items, { ...item, quantity: 1 }] };
    }),
    removeItem: (productId) => set((state) => ({
        items: state.items.filter((item) => item.productId !== productId),
    })),
    clear: () => set({ items: [] }),
}));
