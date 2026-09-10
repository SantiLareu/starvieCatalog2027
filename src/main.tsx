import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

// StPageFlip owns and restructures its host DOM, so it is mounted once rather
// than intentionally remounted by React StrictMode's development probe.
createRoot(document.getElementById("root")!).render(<App />);
