import "./styles/main.css";
import { createApp } from "./components/App";

document.addEventListener("DOMContentLoaded", () => {
  const appRoot = document.getElementById("app");
  if (!appRoot) {
    throw new Error("Missing root element");
  }
  appRoot.appendChild(createApp());
});
