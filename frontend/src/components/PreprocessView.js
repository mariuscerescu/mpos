import { apiClient } from "../api/client";

export function createPreprocessView() {
  const section = document.createElement("section");
  section.className = "preprocess-section";

  const title = document.createElement("h2");
  title.textContent = "Image Preprocessing";
  
  const status = document.createElement("p");
  status.className = "status-message";

  const controls = document.createElement("div");
  controls.className = "preprocess-controls";
  
  // Container pentru lista de documente în loc de <select>
  const documentListContainer = document.createElement("div");
  documentListContainer.className = "document-list-container";

  const preprocessButton = document.createElement("button");
  preprocessButton.textContent = "Preprocess Selected Images";
  preprocessButton.disabled = true;

  controls.append(preprocessButton);

  const viewer = document.createElement("div");
  viewer.className = "preprocess-viewer";
  
  const originalPanel = document.createElement("div");
  originalPanel.className = "image-panel";
  originalPanel.innerHTML = "<h3>Original</h3><div class='image-container'><p>Select a document to preview</p></div>";
  
  const processedPanel = document.createElement("div");
  processedPanel.className = "image-panel";
  processedPanel.innerHTML = "<h3>Preprocessed</h3><div class='image-container'><p>Preview of processed image</p></div>";
  
  viewer.append(originalPanel, processedPanel);

  section.append(title, status, controls, documentListContainer, viewer);

  let currentTokens = null;
  let documents = [];
  let selectedDocumentIds = new Set(); // Folosim un Set pentru a stoca ID-urile selectate
  let pollingInterval = null;
  let isLoading = false;

  function setStatus(message, variant = "info") {
    status.textContent = message;
    status.className = `status-message status-${variant}`;
  }

  function stopPolling() {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
  }
  
  // Auto-refresh pentru a actualiza statusul documentelor
  function startAutoRefresh() {
    stopPolling();
    pollingInterval = setInterval(async () => {
      if (isLoading) return; // Nu face refresh dacă este deja în curs
      
      try {
        const docs = await apiClient.get("/documents");
        const imageDocs = docs.filter(d => d.content_type.startsWith('image/'));
        
        // Verifică dacă s-au schimbat statusurile
        let hasChanges = false;
        imageDocs.forEach(newDoc => {
          const oldDoc = documents.find(d => d.id === newDoc.id);
          if (oldDoc && oldDoc.status !== newDoc.status) {
            hasChanges = true;
          }
        });
        
        if (hasChanges || imageDocs.length !== documents.length) {
          documents = imageDocs;
          renderDocumentList();
          
          // Actualizează previzualizarea dacă documentul curent este afectat
          const previewDoc = Array.from(selectedDocumentIds).length === 1 
            ? documents.find(d => d.id === Array.from(selectedDocumentIds)[0])
            : null;
          if (previewDoc) {
            await previewImage(previewDoc.id);
          }
        }
      } catch (error) {
        console.error("Auto-refresh error:", error);
      }
    }, 3000); // Refresh la fiecare 3 secunde
  }
  
  // Funcție pentru a afișa o previzualizare a unei imagini
  async function previewImage(docId) {
    const doc = documents.find(d => d.id === docId);
    if (!doc) return;

    // Afișează imaginea originală
    const originalBlob = await fetchImageBlob(doc.id, "original");
    renderImage(originalPanel, originalBlob, "Original image unavailable.");

    // Afișează imaginea procesată dacă există
    const isProcessed = ["queued_ocr", "ocr", "completed"].includes(doc.status);
    if (isProcessed) {
      const processedBlob = await fetchImageBlob(doc.id, "preprocessed");
      renderImage(processedPanel, processedBlob, "Preprocessed image unavailable.");
    } else {
      renderImage(processedPanel, null, "Not processed yet.");
    }
  }
  
  // Funcție pentru a gestiona selecția checkbox-urilor
  function handleCheckboxChange(event, docId) {
    if (event.target.checked) {
      selectedDocumentIds.add(docId);
    } else {
      selectedDocumentIds.delete(docId);
    }
    preprocessButton.disabled = selectedDocumentIds.size === 0 || isLoading;
    // Previzualizează ultima imagine selectată
    if (event.target.checked) {
      previewImage(docId);
    }
  }

  // Funcție pentru a randa lista de documente cu checkbox-uri
  function renderDocumentList() {
    documentListContainer.innerHTML = ""; // Golește containerul
    if (documents.length === 0) {
      documentListContainer.textContent = "No images available for preprocessing.";
      return;
    }

    documents.forEach(doc => {
      const item = document.createElement("div");
      item.className = "document-list-item";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = `doc-${doc.id}`;
      checkbox.value = doc.id;
      checkbox.checked = selectedDocumentIds.has(doc.id);
      checkbox.disabled = isLoading;
      checkbox.addEventListener('change', (e) => handleCheckboxChange(e, doc.id));
      
      const label = document.createElement("label");
      label.htmlFor = `doc-${doc.id}`;
      label.textContent = ` ${doc.filename} (${doc.status})`;
      
      // Adaugă un span clickabil pentru previzualizare
      const previewSpan = document.createElement("span");
      previewSpan.textContent = " 👁️";
      previewSpan.style.cursor = "pointer";
      previewSpan.style.marginLeft = "0.5rem";
      previewSpan.title = "Preview image";
      previewSpan.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        previewImage(doc.id);
      });
      label.appendChild(previewSpan);

      item.append(checkbox, label);
      documentListContainer.append(item);
    });
  }

  // Funcția care trimite cererea de procesare în batch
  async function onPreprocessClick() {
    if (selectedDocumentIds.size === 0 || isLoading) return;
    
    isLoading = true;
    preprocessButton.disabled = true;
    preprocessButton.textContent = "⏳ Processing...";
    setStatus(`Starting preprocessing for ${selectedDocumentIds.size} images...`, "info");

    try {
      const ids = Array.from(selectedDocumentIds);
      // Apelăm noul endpoint de batch
      const response = await apiClient.post("/documents/process-batch", { document_ids: ids });
      
      setStatus(`${response.processed_ids.length} images queued for preprocessing. Auto-refreshing...`, "success");
      selectedDocumentIds.clear();
      
      // Notify OCR component that preprocessing has started
      window.dispatchEvent(new CustomEvent('documentPreprocessed'));
      
      // Auto-refresh va actualiza lista automat
    } catch (error) {
      setStatus(error.message || "Failed to start batch preprocessing.", "error");
    } finally {
      isLoading = false;
      preprocessButton.disabled = false;
      preprocessButton.textContent = "Preprocess Selected Images";
    }
  }

  async function fetchDocuments() {
    if (!currentTokens) return;
    try {
      isLoading = true;
      setStatus("Loading documents...", "info");
      const docs = await apiClient.get("/documents");
      documents = docs.filter(d => d.content_type.startsWith('image/'));
      setStatus(`Loaded ${documents.length} image documents.`, "success");
      
      // Start auto-refresh
      startAutoRefresh();
    } catch (error) {
      setStatus("Failed to load documents.", "error");
    } finally {
      isLoading = false;
      renderDocumentList(); // Randează lista DUPĂ ce isLoading = false
    }
  }

  async function fetchImageBlob(documentId, variant) {
    try {
      const response = await fetch(`${apiClient.baseUrl}/documents/${documentId}/binary?variant=${variant}`, {
        headers: { 
          'Authorization': `Bearer ${currentTokens.accessToken}`,
          'Accept': 'image/*'
        }
      });
      if (!response.ok) throw new Error(`Failed to fetch ${variant} image`);
      return await response.blob();
    } catch (error) {
      console.error(`Failed to fetch ${variant} image:`, error);
      return null;
    }
  }
  
  function renderImage(panel, blob, defaultMessage) {
    const container = panel.querySelector('.image-container');
    container.innerHTML = "";
    if (blob) {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(blob);
      container.appendChild(img);
    } else {
      container.innerHTML = `<p>${defaultMessage}</p>`;
    }
  }

  function setTokens(tokens) {
    currentTokens = tokens;
    if (tokens) {
      fetchDocuments();
    } else {
      stopPolling();
    }
  }
  
  const handleDocumentUploaded = () => {
    if (currentTokens) fetchDocuments();
  };
  
  window.addEventListener('documentUploaded', handleDocumentUploaded);
  preprocessButton.addEventListener("click", onPreprocessClick);
  
  setStatus("Select documents to preprocess.", "info");

  return { element: section, setTokens };
}
