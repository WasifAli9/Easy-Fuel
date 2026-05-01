import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { registerServiceWorker } from "./lib/registerServiceWorker";
import { installGlobalFetchCaseNormalization } from "./lib/case-normalize";

registerServiceWorker();
installGlobalFetchCaseNormalization();

createRoot(document.getElementById("root")!).render(<App />);
