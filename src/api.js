const BASE_URL = "http://localhost:5000/api";

export const fetchAllData = async (symbol, { force = false } = {}) => {
  const url = force
    ? `${BASE_URL}/stock/${symbol}?force=1`
    : `${BASE_URL}/stock/${symbol}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Backend error ${res.status}`);
  return res.json();
};
