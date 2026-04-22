// src/api/detect.js
const BASE = process.env.REACT_APP_API_URL;

export async function runDetection(file, modelId) {
  const token = localStorage.getItem("token");
  if (!token) {
    throw new Error("No auth token found – please log in.");
  }
  console.log({ token });

  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${BASE}/detect?ids=${modelId}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Detection failed (${res.status}): ${text}`);
  }

  return res.json();
}
