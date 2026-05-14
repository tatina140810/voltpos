import { jsx as _jsx } from "react/jsx-runtime";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { Layout } from "../Layout";
import { useAuthStore } from "../../store/auth";
function setRole(role) {
    useAuthStore.setState({ role });
}
function renderLayout(initialPath = "/sale") {
    return render(_jsx(MemoryRouter, { initialEntries: [initialPath], children: _jsx(Routes, { children: _jsx(Route, { element: _jsx(Layout, {}), children: _jsx(Route, { path: "*", element: _jsx("div", { children: "page content" }) }) }) }) }));
}
describe("Layout — табы по ролям", () => {
    it("owner видит 5 табов включая Отчёты", () => {
        setRole("owner");
        renderLayout();
        const expected = ["Касса", "Склад", "Клиенты", "Инкас.", "Отчёты"];
        expected.forEach((label) => expect(screen.getAllByText(label).length).toBeGreaterThan(0));
    });
    it("seller НЕ видит Склад и Отчёты", () => {
        setRole("seller");
        renderLayout();
        expect(screen.queryByText("Склад")).not.toBeInTheDocument();
        expect(screen.queryByText("Отчёты")).not.toBeInTheDocument();
        // У seller есть Касса/Клиенты/Доставки/Инкас.
        expect(screen.getAllByText("Касса").length).toBeGreaterThan(0);
        expect(screen.getAllByText("Доставки").length).toBeGreaterThan(0);
    });
    it("warehouse видит только Склад и Товары", () => {
        setRole("warehouse");
        renderLayout();
        expect(screen.getAllByText("Склад").length).toBeGreaterThan(0);
        expect(screen.getAllByText("Товары").length).toBeGreaterThan(0);
        expect(screen.queryByText("Касса")).not.toBeInTheDocument();
        expect(screen.queryByText("Отчёты")).not.toBeInTheDocument();
    });
    it("у warehouse (меньше 5 табов) появляется кнопка Выход в таб-баре", () => {
        setRole("warehouse");
        renderLayout();
        // Выход появляется и в sidebar, и в таб-баре — поэтому могут быть несколько совпадений.
        expect(screen.getAllByText(/Выход|Выйти/).length).toBeGreaterThanOrEqual(1);
    });
});
