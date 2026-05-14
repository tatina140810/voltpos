import { describe, expect, it } from "vitest";

import { useAuthStore } from "../auth";


function makeJwt(role: string): string {
  // Минимальный JWT (без подписи — store читает payload, не проверяет signature).
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = btoa(JSON.stringify({ sub: "1", role, org_id: "1", org_code: "TEST", exp: 9999999999 }));
  return `${header}.${payload}.signature`;
}


describe("useAuthStore", () => {
  it("default role is seller when no token", () => {
    expect(useAuthStore.getState().role).toBe("seller");
  });

  it("setAuth(owner-token) parses role from JWT and persists token", () => {
    const token = makeJwt("owner");
    useAuthStore.getState().setAuth(token);
    expect(useAuthStore.getState().role).toBe("owner");
    expect(localStorage.getItem("voltpos_token")).toBe(token);
  });

  it("setAuth(warehouse-token) sets warehouse role", () => {
    useAuthStore.getState().setAuth(makeJwt("warehouse"));
    expect(useAuthStore.getState().role).toBe("warehouse");
  });

  it("setAuth(null) clears token and falls back to seller", () => {
    useAuthStore.getState().setAuth(makeJwt("owner"));
    useAuthStore.getState().setAuth(null);
    expect(useAuthStore.getState().role).toBe("seller");
    expect(localStorage.getItem("voltpos_token")).toBeNull();
  });

  it("PIN keypad: append → backspace → clear", () => {
    const { appendPin, backspacePin, clearPin } = useAuthStore.getState();
    appendPin("1");
    appendPin("2");
    appendPin("3");
    expect(useAuthStore.getState().pinCode).toBe("123");
    backspacePin();
    expect(useAuthStore.getState().pinCode).toBe("12");
    clearPin();
    expect(useAuthStore.getState().pinCode).toBe("");
  });

  it("PIN не больше 6 символов", () => {
    const { appendPin } = useAuthStore.getState();
    "1234567890".split("").forEach((d) => appendPin(d));
    expect(useAuthStore.getState().pinCode).toHaveLength(6);
  });
});
