import { apiClient } from "../api/client";
import { createAuthForm, getStoredProfile } from "./AuthForm";
import { createUploadStatus } from "./UploadStatus";

const dashboardSections = [
  { id: "upload", label: "Upload", description: "Manage incoming documents" },
  { id: "preprocess", label: "Preprocess", description: "Review enhancement pipeline" },
  { id: "ocr", label: "OCR", description: "Inspect extracted content" },
];

function createSectionPlaceholder(title, lead, body) {
  const section = document.createElement("section");
  section.className = "placeholder-panel";

  const heading = document.createElement("h2");
  heading.textContent = title;

  const leadText = document.createElement("p");
  leadText.className = "placeholder-lead";
  leadText.textContent = lead;

  const bodyText = document.createElement("p");
  bodyText.textContent = body;

  section.append(heading, leadText, bodyText);
  return section;
}

export function createApp() {
  const container = document.createElement("div");
  container.className = "app-container";

  const header = document.createElement("header");
  header.className = "app-header";
  header.innerHTML = "<h1>OCR Platform</h1>";

  const main = document.createElement("main");
  main.className = "app-main";

  const uploadUi = createUploadStatus();
  const preprocessPanel = createSectionPlaceholder(
    "Preprocessing",
    "Enhance scans before OCR",
    "Track and configure image cleanup, denoising, and layout normalization tasks. Pipeline controls will appear here as the service is integrated.",
  );
  const ocrPanel = createSectionPlaceholder(
    "OCR Output",
    "Validate extracted text",
    "Inspect OCR runs, compare revisions, and export structured data once documents have been processed.",
  );

  let currentProfile = getStoredProfile();
  let activeSection = "upload";

  const authForm = createAuthForm({
    onAuthChange: (tokens, profile) => {
      if (tokens) {
        currentProfile = profile ?? currentProfile ?? null;
        showDashboard(tokens, currentProfile);
      }
    },
  });

  const shell = document.createElement("div");
  shell.className = "app-shell";

  const sidebar = document.createElement("aside");
  sidebar.className = "app-sidebar";

  const brand = document.createElement("div");
  brand.className = "sidebar-brand";
  const brandBadge = document.createElement("div");
  brandBadge.className = "brand-badge";
  brandBadge.textContent = "OCR";
  const brandTitle = document.createElement("div");
  brandTitle.className = "brand-title";
  brandTitle.textContent = "Control Center";
  const brandSubtitle = document.createElement("p");
  brandSubtitle.className = "brand-subtitle";
  brandSubtitle.textContent = "Document intelligence workflows";
  brand.append(brandBadge, brandTitle, brandSubtitle);

  const nav = document.createElement("nav");
  nav.className = "sidebar-nav";
  const navButtons = new Map();

  function setActiveSection(sectionId) {
    activeSection = sectionId;
    navButtons.forEach((btn, id) => btn.classList.toggle("active", id === sectionId));
    renderSection(sectionId);
  }

  dashboardSections.forEach((section) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "nav-item";
    button.textContent = section.label;
    button.title = section.description;
    button.addEventListener("click", () => {
      if (activeSection !== section.id) {
        setActiveSection(section.id);
      }
    });
    navButtons.set(section.id, button);
    nav.appendChild(button);
  });

  const sidebarFooter = document.createElement("div");
  sidebarFooter.className = "sidebar-footer";
  sidebarFooter.textContent = "Tip: Upload PDFs or high-resolution images for best OCR accuracy.";

  sidebar.append(brand, nav, sidebarFooter);

  const stage = document.createElement("div");
  stage.className = "app-stage";

  const topbar = document.createElement("div");
  topbar.className = "stage-topbar";

  const userBlock = document.createElement("div");
  userBlock.className = "stage-user";

  const userAvatar = document.createElement("div");
  userAvatar.className = "user-avatar";

  const userMeta = document.createElement("div");
  userMeta.className = "user-meta";

  const userName = document.createElement("span");
  userName.className = "user-name";

  const userEmail = document.createElement("span");
  userEmail.className = "user-email";

  userMeta.append(userName, userEmail);
  userBlock.append(userAvatar, userMeta);

  const logoutButton = document.createElement("button");
  logoutButton.type = "button";
  logoutButton.className = "danger";
  logoutButton.textContent = "Logout";
  logoutButton.addEventListener("click", () => {
    apiClient.logout();
    uploadUi.setTokens(null);
    showAuth();
  });

  topbar.append(userBlock, logoutButton);

  const content = document.createElement("div");
  content.className = "stage-content";

  stage.append(topbar, content);
  shell.append(sidebar, stage);

  function renderSection(sectionId) {
    content.innerHTML = "";
    switch (sectionId) {
      case "upload":
        content.append(uploadUi.element);
        break;
      case "preprocess":
        content.append(preprocessPanel);
        break;
      case "ocr":
        content.append(ocrPanel);
        break;
      default:
        content.append(uploadUi.element);
        break;
    }
  }

  function updateUser(profile) {
    const email = profile?.email?.trim() ?? "";
    const fullName = profile?.fullName?.trim() ?? "";
    const display = fullName || (email ? email.split("@")[0] : "Authenticated user");
    const avatarLetter = display.charAt(0).toUpperCase() || "U";

    userAvatar.textContent = avatarLetter;
    userName.textContent = display;
    userEmail.textContent = email ? `Logged in as ${email}` : "Session active";
  }

  function showAuth() {
    main.className = "app-main auth-mode";
    main.innerHTML = "";
    authForm.reset();
    uploadUi.setTokens(null);
    main.append(authForm.element);
  }

  function showDashboard(tokens, profile) {
    main.className = "app-main dashboard-mode";
    main.innerHTML = "";
    updateUser(profile ?? currentProfile ?? {});
    uploadUi.setTokens(tokens);
    activeSection = "";
    setActiveSection("upload");
    main.append(shell);
  }

  const initialTokens = apiClient.getTokens();

  if (initialTokens) {
    showDashboard(initialTokens, currentProfile);
  } else {
    showAuth();
  }

  container.append(header, main);

  return container;
}
