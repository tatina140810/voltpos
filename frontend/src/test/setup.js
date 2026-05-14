import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
// Между тестами чистим DOM и localStorage. IndexedDB изолируется в каждом тесте,
// которому это нужно (см. afterEach в offline.test.ts) — глобально пересоздавать
// FDBFactory нельзя, иначе компоненты и axios теряют ссылки.
afterEach(() => {
    cleanup();
    localStorage.clear();
});
