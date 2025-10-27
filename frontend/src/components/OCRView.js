import { apiClient } from "../api/client";

export function createOCRView() {
  const section = document.createElement("section");
  section.className = "ocr-section";

  const title = document.createElement("h2");
  title.textContent = "OCR Text Extraction";
  
  const status = document.createElement("p");
  status.className = "status-message";

  const controls = document.createElement("div");
  controls.className = "ocr-controls";
  
  // Container pentru lista de documente în loc de <select>
  const documentListContainer = document.createElement("div");
  documentListContainer.className = "document-list-container";

  const extractButton = document.createElement("button");
  extractButton.textContent = "Extract Text from Selected Images";
  extractButton.disabled = true;

  controls.append(extractButton);

  const viewer = document.createElement("div");
  viewer.className = "ocr-viewer";
  
  const imagePanel = document.createElement("div");
  imagePanel.className = "ocr-image-panel";
  imagePanel.innerHTML = "<h3>Preprocessed Image</h3><div class='ocr-image-container'><p>Select a document to preview</p></div>";
  
  const textPanel = document.createElement("div");
  textPanel.className = "ocr-text-panel";
  const textPanelTitle = document.createElement("h3");
  textPanelTitle.textContent = "Extracted Text";
  const textArea = document.createElement("textarea");
  textArea.className = "ocr-text-area";
  textArea.placeholder = 'Select images and click "Extract Text" to start OCR extraction...';
  textArea.readOnly = false;
  textPanel.append(textPanelTitle, textArea);
  
  viewer.append(imagePanel, textPanel);

  section.append(title, status, controls, documentListContainer, viewer);

  let currentTokens = null;
  let documents = [];
  let selectedDocumentIds = new Set();
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
        const preprocessedDocs = docs.filter(d => 
          d.content_type.startsWith('image/') && 
          ["queued_ocr", "ocr", "completed", "failed"].includes(d.status)
        );
        
        // Verifică dacă s-au schimbat statusurile
        let hasChanges = false;
        preprocessedDocs.forEach(newDoc => {
          const oldDoc = documents.find(d => d.id === newDoc.id);
          if (oldDoc && oldDoc.status !== newDoc.status) {
            hasChanges = true;
          }
        });
        
        if (hasChanges || preprocessedDocs.length !== documents.length) {
          documents = preprocessedDocs;
          renderDocumentList();
          
          // Actualizează previzualizarea dacă documentul curent este afectat
          const previewDoc = Array.from(selectedDocumentIds).length === 1 
            ? documents.find(d => d.id === Array.from(selectedDocumentIds)[0])
            : null;
          if (previewDoc) {
            await previewDocument(previewDoc.id);
          }
        }
      } catch (error) {
        console.error("Auto-refresh error:", error);
      }
    }, 3000); // Refresh la fiecare 3 secunde
  }
  
  // Funcție pentru a afișa o previzualizare a unui document
  async function previewDocument(docId) {
    const doc = documents.find(d => d.id === docId);
    if (!doc) return;

    // Afișează imaginea preprocesată
    const hasPreprocessed = ["queued_ocr", "ocr", "completed"].includes(doc.status);
    if (hasPreprocessed) {
      const processedBlob = await fetchImageBlob(doc.id, "preprocessed");
      renderImage(processedBlob, "Preprocessed image unavailable.");
    } else {
      const originalBlob = await fetchImageBlob(doc.id, "original");
      renderImage(originalBlob, "Image not preprocessed yet.");
    }

    // Afișează textul OCR dacă documentul este completed
    if (doc.status === "completed" && doc.ocr_text) {
      textArea.value = doc.ocr_text;
      textArea.placeholder = "Edit extracted text...";
    } else {
      textArea.value = "";
      textArea.placeholder = `Click "Extract Text" to start OCR extraction...`;
    }
  }
  
  // Funcție pentru a gestiona selecția checkbox-urilor
  function handleCheckboxChange(event, docId) {
    if (event.target.checked) {
      selectedDocumentIds.add(docId);
    } else {
      selectedDocumentIds.delete(docId);
    }
    extractButton.disabled = selectedDocumentIds.size === 0 || isLoading;
    
    // Previzualizează documentul selectat (doar dacă este unul singur)
    if (event.target.checked && selectedDocumentIds.size === 1) {
      previewDocument(docId);
    }
  }

  // Funcție pentru a randa lista de documente cu checkbox-uri
  function renderDocumentList() {
    documentListContainer.innerHTML = "";
    if (documents.length === 0) {
      documentListContainer.textContent = "No preprocessed images available. Preprocess images first.";
      return;
    }

    documents.forEach(doc => {
      const item = document.createElement("div");
      item.className = "document-list-item";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = `ocr-doc-${doc.id}`;
      checkbox.value = doc.id;
      checkbox.checked = selectedDocumentIds.has(doc.id);
      checkbox.disabled = isLoading;
      checkbox.addEventListener('change', (e) => handleCheckboxChange(e, doc.id));
      
      const label = document.createElement("label");
      label.htmlFor = `ocr-doc-${doc.id}`;
      label.textContent = ` ${doc.filename} (${doc.status})`;
      
      // Adaugă un span clickabil pentru previzualizare
      const previewSpan = document.createElement("span");
      previewSpan.textContent = " 👁️";
      previewSpan.style.cursor = "pointer";
      previewSpan.style.marginLeft = "0.5rem";
      previewSpan.title = "Preview document";
      previewSpan.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        previewDocument(doc.id);
      });
      label.appendChild(previewSpan);

      item.append(checkbox, label);
      documentListContainer.append(item);
    });
  }

  // Funcția care trimite cererea de OCR în batch
  async function onExtractClick() {
    if (selectedDocumentIds.size === 0 || isLoading) return;
    
    isLoading = true;
    extractButton.disabled = true;
    extractButton.textContent = "⏳ Processing...";
    setStatus(`Starting OCR extraction for ${selectedDocumentIds.size} images...`, "info");

    try {
      const ids = Array.from(selectedDocumentIds);
      // Apelăm noul endpoint de batch OCR
      const response = await apiClient.post("/documents/process-batch-ocr", { document_ids: ids });
      
      setStatus(`${response.processed_ids.length} images queued for OCR. Auto-refreshing...`, "success");
      selectedDocumentIds.clear();
      
      // Auto-refresh va actualiza lista automat
    } catch (error) {
      setStatus(error.message || "Failed to start batch OCR extraction.", "error");
    } finally {
      isLoading = false;
      extractButton.disabled = false;
      extractButton.textContent = "Extract Text from Selected Images";
    }
  }

  async function fetchDocuments() {
    if (!currentTokens) return;
    try {
      isLoading = true;
      setStatus("Loading documents...", "info");
      const docs = await apiClient.get("/documents");
      documents = docs.filter(d => 
        d.content_type.startsWith('image/') && 
        ["queued_ocr", "ocr", "completed", "failed"].includes(d.status)
      );
      
      if (documents.length === 0) {
        setStatus("No preprocessed documents available. Preprocess images first.", "info");
      } else {
        setStatus(`Loaded ${documents.length} preprocessed document(s).`, "success");
      }
      
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
  
  function renderImage(blob, defaultMessage) {
    const container = imagePanel.querySelector('.ocr-image-container');
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
  
  const handleDocumentPreprocessed = () => {
    if (currentTokens) fetchDocuments();
  };
  
  window.addEventListener('documentUploaded', handleDocumentUploaded);
  window.addEventListener('documentPreprocessed', handleDocumentPreprocessed);
  extractButton.addEventListener("click", onExtractClick);
  
  setStatus("Select preprocessed documents to extract text.", "info");

  return { element: section, setTokens };
}
