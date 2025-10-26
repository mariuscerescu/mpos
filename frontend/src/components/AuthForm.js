import { apiClient } from "../api/client";

const PROFILE_STORAGE_KEY = "ocr-platform.profile";

function loadProfile() {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed) {
      return null;
    }
    return {
      email: parsed.email ?? parsed.username ?? "",
      fullName: parsed.fullName ?? parsed.full_name ?? "",
    };
  } catch (error) {
    console.warn("Failed to parse stored profile", error);
    return null;
  }
}

function persistProfile(profile) {
  if (typeof window === "undefined") {
    return;
  }
  if (profile) {
    window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } else {
    window.localStorage.removeItem(PROFILE_STORAGE_KEY);
  }
}

function extractErrorMessage(error) {
  if (!error) {
    return "Unexpected error.";
  }
  if (error.message) {
    try {
      const parsed = JSON.parse(error.message);
      if (parsed?.detail) {
        return typeof parsed.detail === "string" ? parsed.detail : JSON.stringify(parsed.detail);
      }
    } catch (_) {
      // Ignore JSON parse failures, we'll fall back to the raw message.
    }
    return error.message;
  }
  return String(error);
}

export function getStoredProfile() {
  return loadProfile();
}

export function clearStoredProfile() {
  persistProfile(null);
}

export function createAuthForm({ onAuthChange } = {}) {
  const storedProfile = loadProfile();
  let currentProfile = storedProfile;
  let mode = "login";
  let isSubmitting = false;

  const container = document.createElement("div");
  container.className = "auth-page";

  const card = document.createElement("section");
  card.className = "auth-card";

  const title = document.createElement("h2");

  const status = document.createElement("p");
  status.className = "status-message";
  status.hidden = true;

  const form = document.createElement("form");
  form.className = "auth-form";

  const fullNameGroup = document.createElement("label");
  fullNameGroup.className = "input-group";
  const fullNameLabel = document.createElement("span");
  fullNameLabel.textContent = "Full name";
  const fullNameInput = document.createElement("input");
  fullNameInput.type = "text";
  fullNameInput.placeholder = "Ada Lovelace";
  fullNameInput.autocomplete = "name";
  if (storedProfile?.fullName) {
    fullNameInput.value = storedProfile.fullName;
  }
  fullNameGroup.append(fullNameLabel, fullNameInput);

  const emailGroup = document.createElement("label");
  emailGroup.className = "input-group";
  const emailLabel = document.createElement("span");
  emailLabel.textContent = "Email";
  const emailInput = document.createElement("input");
  emailInput.type = "email";
  emailInput.placeholder = "user@example.com";
  emailInput.autocomplete = "email";
  if (storedProfile?.email) {
    emailInput.value = storedProfile.email;
  }
  emailGroup.append(emailLabel, emailInput);

  const passwordGroup = document.createElement("label");
  passwordGroup.className = "input-group";
  const passwordLabel = document.createElement("span");
  passwordLabel.textContent = "Password";
  const passwordInput = document.createElement("input");
  passwordInput.type = "password";
  passwordInput.placeholder = "••••••••";
  passwordInput.autocomplete = "current-password";
  passwordGroup.append(passwordLabel, passwordInput);

  const submitButton = document.createElement("button");
  submitButton.type = "submit";

  form.append(fullNameGroup, emailGroup, passwordGroup, submitButton);

  const togglePrompt = document.createElement("p");
  togglePrompt.className = "auth-toggle";
  const toggleText = document.createElement("span");
  const toggleButton = document.createElement("button");
  toggleButton.type = "button";
  toggleButton.className = "link-button";
  togglePrompt.append(toggleText, toggleButton);

  card.append(title, status, form, togglePrompt);
  container.append(card);

  function setStatus(message, variant = "info") {
    if (!message) {
      status.textContent = "";
      status.hidden = true;
      status.className = "status-message";
      return;
    }
    status.hidden = false;
    status.textContent = message;
    status.className = `status-message status-${variant}`;
  }

  function notifyAuthChange(nextTokens) {
    if (typeof onAuthChange === "function") {
      onAuthChange(nextTokens, currentProfile);
    }
    container.dispatchEvent(
      new CustomEvent("authchange", {
        detail: {
          tokens: nextTokens,
          profile: currentProfile,
        },
      }),
    );
  }

  function updateMode(nextMode) {
    mode = nextMode;
    const isLogin = mode === "login";
    fullNameGroup.hidden = isLogin;
    passwordInput.autocomplete = isLogin ? "current-password" : "new-password";
    submitButton.textContent = isLogin ? "Login" : "Create account";
    title.textContent = isLogin ? "Welcome back" : "Create your account";
    toggleText.textContent = isLogin ? "Don't have an account? " : "Already registered? ";
    toggleButton.textContent = isLogin ? "Create one" : "Back to login";
  }

  function startSubmit() {
    isSubmitting = true;
    submitButton.disabled = true;
  }

  function endSubmit() {
    isSubmitting = false;
    submitButton.disabled = false;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;
    const fullName = fullNameInput.value.trim();

    if (!email || !password) {
      setStatus("Email and password are required.", "error");
      return;
    }

    if (mode === "register" && !fullName) {
      setStatus("Please provide your full name to create an account.", "error");
      return;
    }

    startSubmit();

    try {
      if (mode === "login") {
        const tokenPair = await apiClient.login({ email, password });
        currentProfile = {
          email,
          fullName: currentProfile?.fullName ?? (fullName || ""),
        };
        persistProfile(currentProfile);
        passwordInput.value = "";
        setStatus(`Authenticated as ${email}.`, "success");
        notifyAuthChange(tokenPair);
      } else {
        const profile = await apiClient.register({
          email,
          password,
          full_name: fullName,
        });
        currentProfile = {
          email: profile.email ?? email,
          fullName: profile.full_name ?? profile.fullName ?? fullName,
        };
        persistProfile(currentProfile);
        setStatus("Account created. You can sign in now.", "success");
        updateMode("login");
        passwordInput.value = "";
        passwordInput.focus();
      }
    } catch (error) {
      const message = extractErrorMessage(error) || "Request failed.";
      setStatus(message, "error");
    } finally {
      endSubmit();
    }
  }

  toggleButton.addEventListener("click", () => {
    updateMode(mode === "login" ? "register" : "login");
    setStatus("", "info");
    passwordInput.value = "";
    if (mode === "register") {
      fullNameInput.focus();
    } else {
      passwordInput.focus();
    }
  });

  form.addEventListener("submit", handleSubmit);

  updateMode("login");
  setStatus("Sign in to manage your documents.", "info");

  return {
    element: container,
    reset() {
      updateMode("login");
      passwordInput.value = "";
      setStatus("Sign in to manage your documents.", "info");
      if (currentProfile?.email) {
        emailInput.value = currentProfile.email;
      }
      if (currentProfile?.fullName) {
        fullNameInput.value = currentProfile.fullName;
      }
    },
  };
}
