import { apiClient } from "../api/client";

export function createUploadStatus() {
  const section = document.createElement("section");
  section.className = "upload-section";

  const title = document.createElement("h2");
  title.textContent = "Documents";

  const status = document.createElement("p");
  status.className = "status-message";

  const controls = document.createElement("div");
  controls.className = "document-controls";

  const uploadForm = document.createElement("form");
  uploadForm.className = "upload-form";

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*,application/pdf";

  const uploadButton = document.createElement("button");
  uploadButton.type = "submit";
  uploadButton.textContent = "Upload";

  uploadForm.append(fileInput, uploadButton);

  const refreshButton = document.createElement("button");
  refreshButton.type = "button";
  refreshButton.className = "secondary";
  refreshButton.textContent = "Refresh";

  controls.append(uploadForm, refreshButton);

  const table = document.createElement("table");
  table.className = "document-table";
  const thead = document.createElement("thead");
  thead.innerHTML = "<tr><th>Filename</th><th>Actions</th></tr>";
  const tbody = document.createElement("tbody");
  table.append(thead, tbody);

  section.append(title, status, controls, table);

  let currentTokens = null;
  let documents = [];
  let isLoading = false;

  function setStatus(message, variant = "info") {
    status.textContent = message;
    status.className = `status-message status-${variant}`;
  }

  function createActionButton(label, handler, variant) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.className = `table-action${variant ? ` ${variant}` : ""}`;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      handler();
    });
    return button;
  }

  function renderDocuments() {
    tbody.innerHTML = "";

    if (!documents.length) {
      const emptyRow = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 2;
      cell.textContent = currentTokens
        ? "No documents uploaded yet."
        : "Authenticate to view documents.";
      emptyRow.appendChild(cell);
      tbody.appendChild(emptyRow);
      return;
    }

    documents.forEach((doc) => {
      const row = document.createElement("tr");

      const filenameCell = document.createElement("td");
      filenameCell.textContent = doc.filename;

      const actionsCell = document.createElement("td");
      actionsCell.append(
        createActionButton("Delete", () => deleteDocument(doc.id), "danger"),
      );

      row.append(filenameCell, actionsCell);
      tbody.appendChild(row);
    });
  }

  async function fetchDocuments() {
    if (!currentTokens) {
      documents = [];
      renderDocuments();
      setStatus("Authenticate to manage documents.", "info");
      return;
    }

    if (isLoading) {
      return;
    }

    isLoading = true;
    refreshButton.disabled = true;
    setStatus("Loading documents...", "info");
    try {
      const response = await apiClient.get("/documents");
      documents = Array.isArray(response) ? response : [];
      renderDocuments();
      if (documents.length) {
        setStatus(`Loaded ${documents.length} document${documents.length === 1 ? "" : "s"}.`, "success");
      } else {
        setStatus("No documents uploaded yet.", "info");
      }
    } catch (error) {
      setStatus(error.message || "Failed to load documents.", "error");
    } finally {
      isLoading = false;
      refreshButton.disabled = !currentTokens;
    }
  }

  async function deleteDocument(documentId) {
    if (!window.confirm("Delete this document permanently?")) {
      return;
    }
    try {
      await apiClient.delete(`/documents/${documentId}`);
      setStatus("Document deleted.", "success");
      await fetchDocuments();
    } catch (error) {
      setStatus(error.message || "Failed to delete document.", "error");
    }
  }

  uploadForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentTokens) {
      setStatus("Login to upload documents.", "error");
      return;
    }

    const file = fileInput.files?.[0];
    if (!file) {
      setStatus("Select a file before uploading.", "error");
      return;
    }

    uploadButton.disabled = true;
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await apiClient.postForm("/documents", formData);
      const document = result?.document || result;
      setStatus(`Uploaded ${document.filename}.`, "success");
      fileInput.value = "";
      await fetchDocuments();
      
      // Notify other components that a new document was uploaded
      window.dispatchEvent(new CustomEvent('documentUploaded', { detail: document }));
    } catch (error) {
      setStatus(error.message || "Upload failed.", "error");
    } finally {
      uploadButton.disabled = false;
    }
  });

  refreshButton.addEventListener("click", () => {
    if (!isLoading) {
      fetchDocuments();
    }
  });

  function setTokens(tokens) {
    currentTokens = tokens;
    const hasAuth = Boolean(tokens?.accessToken);
    fileInput.disabled = !hasAuth;
    uploadButton.disabled = !hasAuth;
    refreshButton.disabled = !hasAuth;
    section.classList.toggle("requires-auth", !hasAuth);
    if (hasAuth) {
      fetchDocuments();
    } else {
      documents = [];
      renderDocuments();
      setStatus("Authenticate to manage documents.", "info");
    }
  }

  setStatus("Authenticate to manage documents.", "info");

  return { element: section, setTokens };
}
