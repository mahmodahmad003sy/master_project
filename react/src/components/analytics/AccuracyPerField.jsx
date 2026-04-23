import React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export default function AccuracyPerField({ data }) {
  const rows = data.map((item) => ({
    field: item.field,
    classical: item.classical == null ? 0 : Math.round(item.classical * 100),
    vlm: item.vlm == null ? 0 : Math.round(item.vlm * 100),
    hybrid: item.hybrid == null ? 0 : Math.round(item.hybrid * 100),
  }));

  return (
    <div style={{ width: "100%", height: 380 }}>
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="field" />
          <YAxis unit="%" domain={[0, 100]} />
          <Tooltip formatter={(value) => `${value}%`} />
          <Legend />
          <Bar dataKey="classical" fill="#1677ff" radius={[4, 4, 0, 0]} />
          <Bar dataKey="vlm" fill="#fa8c16" radius={[4, 4, 0, 0]} />
          <Bar dataKey="hybrid" fill="#52c41a" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
