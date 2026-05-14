import { jsx as _jsx } from "react/jsx-runtime";
/**
 * Numeric input that:
 * - shows a numeric keyboard on mobile (inputMode="decimal")
 * - clears a leading "0" when the user focuses the field, so они могут сразу набрать число
 *   without having to delete the placeholder zero first
 *
 * Always pass string values via useState — empty string represents "no input".
 */
export function NumberInput({ value, onChange, onFocus, ...props }) {
    return (_jsx("input", { ...props, type: "text", inputMode: "decimal", value: value, onChange: (e) => onChange(e.target.value), onFocus: (e) => {
            if (e.target.value === "0")
                onChange("");
            onFocus?.(e);
        } }));
}
