import UploadPage from "./pages/UploadPage";
import ResultsPage from "./pages/ResultsPage";

export const routes = [
  { path: "/", element: UploadPage },
  { path: "/results/:runId", element: ResultsPage },
];
