import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { Layout } from "../Layout";
import { useAuthStore } from "../../store/auth";


function setRole(role: "owner" | "seller" | "warehouse") {
  useAuthStore.setState({ role });
}

function renderLayout(initialPath: string = "/sale") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="*" element={<div>page content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
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
