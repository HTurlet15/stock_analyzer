const BASE_URL = "http://localhost:5000/api";

export const fetchAllData = async (symbol) => {
  const res = await fetch(`${BASE_URL}/stock/${symbol}`);
  if (!res.ok) throw new Error(`Backend error ${res.status}`);
  return res.json();
};
