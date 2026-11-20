export function safeNumber(value) {
    const numeric = Number(value ?? 0);
    return Number.isFinite(numeric) ? numeric : 0;
}
export function formatMoney(value, digits = 2) {
    return safeNumber(value).toFixed(digits);
}
export function formatWholeMoney(value) {
    return safeNumber(value).toFixed(0);
}
//# sourceMappingURL=format.js.map