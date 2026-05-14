import axios from "axios";
/**
 * Безопасное извлечение текста ошибки из axios-ответа.
 * FastAPI/Pydantic при 422 возвращает detail как массив объектов:
 *   [{ loc: [...], msg: "...", type: "..." }]
 * При других ошибках — обычно строка.
 * Возвращает всегда строку, чтобы было безопасно класть в setState.
 */
export function extractError(err, fallback) {
    if (!axios.isAxiosError(err))
        return fallback;
    const detail = err.response?.data?.detail;
    if (typeof detail === "string")
        return detail;
    if (Array.isArray(detail)) {
        return detail
            .map((item) => {
            if (typeof item === "string")
                return item;
            if (item && typeof item === "object" && "msg" in item) {
                const loc = Array.isArray(item.loc) ? item.loc.join(".") : "";
                return loc ? `${loc}: ${item.msg}` : String(item.msg);
            }
            return JSON.stringify(item);
        })
            .join("; ");
    }
    if (detail && typeof detail === "object")
        return JSON.stringify(detail);
    return fallback;
}
