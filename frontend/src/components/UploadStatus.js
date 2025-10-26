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
  thead.innerHTML = "<tr><th>Filename</th><th>Status</th><th>Updated</th><th>Actions</th></tr>";
  const tbody = document.createElement("tbody");
  table.append(thead, tbody);

  const detail = document.createElement("div");
  detail.className = "document-detail";
  const detailTitle = document.createElement("h3");
  detailTitle.textContent = "Document Details";
  const detailMeta = document.createElement("div");
  detailMeta.className = "document-meta";
  const detailOutput = document.createElement("pre");
  detailOutput.className = "document-output";
  detailOutput.textContent = "Select a document to inspect its OCR output.";
  detail.append(detailTitle, detailMeta, detailOutput);

  section.append(title, status, controls, table, detail);

  let currentTokens = null;
  let documents = [];
  let selectedId = null;
  let isLoading = false;

  function setStatus(message, variant = "info") {
    status.textContent = message;
    status.className = `status-message status-${variant}`;
  }

  function createStatusLabel(doc) {
    const span = document.createElement("span");
    const statusClass = doc.status.replace(/_/g, "-");
    span.className = `status-label status-${statusClass}`;
    span.textContent = doc.status.replace(/_/g, " ");
    if (doc.status === "failed" && doc.error_message) {
      span.title = doc.error_message;
    }
    return span;
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

  function renderDetail(doc) {
    if (!doc) {
      detailMeta.innerHTML = "<p>Select a document to see metadata and OCR output.</p>";
      detailOutput.textContent = "OCR text will appear here once processing completes.";
      return;
    }
    const updated = doc.updated_at ? new Date(doc.updated_at) : null;
    const sizeKb =
      typeof doc.size_bytes === "number" ? `${(doc.size_bytes / 1024).toFixed(1)} KB` : "Unknown";
    detailMeta.innerHTML = `
      <p><strong>Filename:</strong> ${doc.filename}</p>
      <p><strong>Status:</strong> ${doc.status}</p>
      <p><strong>Updated:</strong> ${updated ? updated.toLocaleString() : "Unknown"}</p>
      <p><strong>Size:</strong> ${sizeKb}</p>
      ${doc.error_message ? `<p class="error">Error: ${doc.error_message}</p>` : ""}
    `;
    detailOutput.textContent = doc.ocr_text || "[OCR text not available yet]";
  }

  function renderDocuments() {
    tbody.innerHTML = "";

    if (!documents.length) {
      const emptyRow = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 4;
      cell.textContent = currentTokens
        ? "No documents uploaded yet."
        : "Authenticate to view documents.";
      emptyRow.appendChild(cell);
      tbody.appendChild(emptyRow);
      return;
    }

    documents.forEach((doc) => {
      const row = document.createElement("tr");
      if (doc.id === selectedId) {
        row.classList.add("selected");
      }
      row.addEventListener("click", () => selectDocument(doc.id));

      const filenameCell = document.createElement("td");
      filenameCell.textContent = doc.filename;

      const statusCell = document.createElement("td");
      statusCell.appendChild(createStatusLabel(doc));

      const updatedCell = document.createElement("td");
      updatedCell.textContent = doc.updated_at ? new Date(doc.updated_at).toLocaleString() : "—";

      const actionsCell = document.createElement("td");
      actionsCell.append(
        createActionButton("View", () => selectDocument(doc.id)),
        createActionButton("Requeue", () => requeueDocument(doc.id), "secondary"),
        createActionButton("Delete", () => deleteDocument(doc.id), "danger"),
      );

      row.append(filenameCell, statusCell, updatedCell, actionsCell);
      tbody.appendChild(row);
    });
  }

  async function fetchDocuments() {
    if (!currentTokens) {
      documents = [];
      renderDocuments();
      renderDetail(null);
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
      if (selectedId) {
        const match = documents.find((item) => item.id === selectedId);
        renderDetail(match || null);
      }
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

  async function selectDocument(documentId) {
    if (!currentTokens) {
      return;
    }
    try {
      const document = await apiClient.get(`/documents/${documentId}`);
      selectedId = document.id;
      const index = documents.findIndex((item) => item.id === document.id);
      if (index >= 0) {
        documents[index] = document;
      }
      renderDocuments();
      renderDetail(document);
      setStatus(`Viewing ${document.filename}.`, "info");
    } catch (error) {
      setStatus(error.message || "Failed to load document details.", "error");
    }
  }

  async function requeueDocument(documentId) {
    try {
      await apiClient.post(`/documents/${documentId}/process`, {});
      setStatus("Document requeued for processing.", "success");
      await fetchDocuments();
    } catch (error) {
      setStatus(error.message || "Failed to requeue document.", "error");
    }
  }

  async function deleteDocument(documentId) {
    if (!window.confirm("Delete this document permanently?")) {
      return;
    }
    try {
      await apiClient.delete(`/documents/${documentId}`);
      setStatus("Document deleted.", "success");
      if (selectedId === documentId) {
        selectedId = null;
        renderDetail(null);
      }
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
      selectedId = document.id;
      setStatus(`Uploaded ${document.filename}.`, "success");
      fileInput.value = "";
      await fetchDocuments();
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
      selectedId = null;
      renderDocuments();
      renderDetail(null);
      setStatus("Authenticate to manage documents.", "info");
    }
  }

  renderDetail(null);
  setStatus("Authenticate to manage documents.", "info");

  return { element: section, setTokens };
}
