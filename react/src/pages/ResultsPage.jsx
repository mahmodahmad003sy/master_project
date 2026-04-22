// src/pages/ResultsPage.jsx
import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "antd";
import ResultsView from "../components/ResultsView";

export default function ResultsPage() {
  const navigate = useNavigate();
  const data = JSON.parse(sessionStorage.getItem("lastResult") || "{}");
  if (!data.results) {
    return (
      <Button onClick={() => navigate("/upload")}>No results – go back</Button>
    );
  }

  return (
    <>
      <ResultsView results={data} />
      <Button style={{ marginTop: 24 }} onClick={() => navigate("/upload")}>
        New Detection
      </Button>
    </>
  );
}
