import { SUPABASE_URL, supabase } from "./supabase.js";

const BREEDING_PHOTOS_BUCKET = "dog-photos";
let breedings = [];
let isInitialized = false;
let draggedBreedingId = "";

function getElements() {
  return {
    module: document.querySelector("[data-module='breedings']"),
    form: document.querySelector("#breedingForm"),
    formTitle: document.querySelector("#breedingFormTitle"),
    message: document.querySelector("#breedingMessage"),
    photoInput: document.querySelector("#breedingPhotos"),
    photoPreview: document.querySelector("#breedingPhotoPreview"),
    tableBody: document.querySelector("#breedingsTableBody"),
    count: document.querySelector("#breedingsCount"),
    setupNote: document.querySelector("#breedingsSetupNote")
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizePhotos(breeding) {
  if (Array.isArray(breeding.photos)) {
    return breeding.photos.filter(Boolean);
  }

  if (typeof breeding.photos === "string" && breeding.photos) {
    try {
      const parsed = JSON.parse(breeding.photos);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [breeding.photos];
    } catch {
      return [breeding.photos];
    }
  }

  return breeding.main_photo_url ? [breeding.main_photo_url] : [];
}

function setMessage(message, type = "info") {
  const { message: messageElement } = getElements();

  if (!messageElement) {
    return;
  }

  messageElement.textContent = message;
  messageElement.dataset.type = type;
  messageElement.hidden = !message;
}

function setSetupNote(isVisible) {
  const { setupNote } = getElements();

  if (setupNote) {
    setupNote.hidden = !isVisible;
  }
}

function showPhotoPreview(urls = []) {
  const { photoPreview } = getElements();

  if (!photoPreview) {
    return;
  }

  if (!urls.length) {
    photoPreview.innerHTML = "<span>No photos selected</span>";
    return;
  }

  photoPreview.innerHTML = urls
    .map((url) => `<img src="${escapeHtml(url)}" alt="Selected breeding photo preview" />`)
    .join("");
}

function getFormPayload(form, photoUrls, displayOrder = 100, homeOrder = 100) {
  const formData = new FormData(form);
  const normalizedDisplayOrder = Number(displayOrder);
  const normalizedHomeOrder = Number(homeOrder);

  return {
    title: String(formData.get("title") || "").trim() || null,
    sire_name: null,
    dam_name: null,
    breeding_date: null,
    description: String(formData.get("description") || "").trim() || null,
    display_order: Number.isFinite(normalizedDisplayOrder) ? normalizedDisplayOrder : 100,
    show_on_home: formData.get("show_on_home") === "on",
    home_order: Number.isFinite(normalizedHomeOrder) ? normalizedHomeOrder : 100,
    status: "active",
    photos: photoUrls
  };
}

function setLoading(isLoading) {
  const { form, module } = getElements();
  const submitButton = form?.querySelector("button[type='submit']");

  if (submitButton) {
    submitButton.disabled = isLoading;
    submitButton.textContent = isLoading ? "Saving..." : "Save breeding";
  }

  module?.classList.toggle("is-loading", isLoading);
}

function resetForm() {
  const { form, formTitle, photoInput } = getElements();

  form?.reset();
  if (form?.elements.id) {
    form.elements.id.value = "";
  }
  if (photoInput) {
    photoInput.value = "";
  }
  if (formTitle) {
    formTitle.textContent = "Add Breeding";
  }
  showPhotoPreview([]);
  setMessage("");
}

function renderBreedings() {
  const { tableBody, count } = getElements();
  const visibleBreedings = Array.isArray(breedings) ? breedings : [];

  if (!tableBody) {
    return;
  }

  if (count) {
    count.textContent = `${visibleBreedings.length} ${visibleBreedings.length === 1 ? "breeding" : "breedings"}`;
  }

  if (!visibleBreedings.length) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="3">No breedings found. Add the first breeding from the form.</td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = visibleBreedings.map((breeding) => {
    const photos = normalizePhotos(breeding);
    const firstPhoto = photos[0];
    const title = breeding.title || "Untitled breeding";
    const homeBadge = breeding.show_on_home ? '<span class="tag">HOME</span>' : "";

    return `
      <tr data-breeding-row-id="${escapeHtml(breeding.id)}" draggable="true">
        <td>
          <button class="button compact ghost" type="button" data-breeding-drag-handle draggable="true" aria-label="Drag breeding to reorder" title="Drag to reorder" style="cursor: grab;">&#8942;&#8942;</button>
          <div class="stud-thumb">
            ${firstPhoto ? `<img src="${escapeHtml(firstPhoto)}" alt="${escapeHtml(title)} photo" />` : "<span>No photo</span>"}
          </div>
          <small>${photos.length} ${photos.length === 1 ? "photo" : "photos"}</small>
        </td>
        <td>
          <strong>${escapeHtml(title)}</strong>
          ${homeBadge}
          ${breeding.description ? `<small>${escapeHtml(breeding.description)}</small>` : ""}
        </td>
        <td>
          <div class="row-actions">
            <button class="button compact" type="button" data-breeding-action="edit" data-breeding-id="${escapeHtml(breeding.id)}">Edit</button>
            <button class="button compact danger" type="button" data-breeding-action="delete" data-breeding-id="${escapeHtml(breeding.id)}">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function getSupabaseErrorMessage(error) {
  return error?.message || error?.error_description || "Supabase request failed.";
}

function formatSupabaseError(error, operation) {
  const parts = [`${operation}: ${getSupabaseErrorMessage(error)}`];

  if (error?.code) {
    parts.push(`code ${error.code}`);
  }

  if (error?.status || error?.statusCode) {
    parts.push(`status ${error.status || error.statusCode}`);
  }

  if (error?.details) {
    parts.push(`details ${error.details}`);
  }

  if (error?.hint) {
    parts.push(`hint ${error.hint}`);
  }

  return parts.join(" | ");
}

function logSupabaseResult(operation, result, context = {}) {
  const payload = {
    operation,
    context,
    data: result?.data ?? null,
    error: result?.error ?? null
  };

  if (result?.error) {
    console.error(`[Breedings module] Supabase ${operation} failed`, payload);
    return;
  }

  console.info(`[Breedings module] Supabase ${operation} succeeded`, payload);
}

function logBreedingUploadStep(step, details = {}) {
  console.info(`[Breedings module] ${step}`, {
    supabaseUrl: SUPABASE_URL,
    bucket: BREEDING_PHOTOS_BUCKET,
    ...details
  });
}

function isMissingSupabaseResource(error) {
  const message = getSupabaseErrorMessage(error).toLowerCase();
  const code = String(error?.code || "");
  const statusCode = Number(error?.statusCode || error?.status || 0);

  return (
    code === "42P01" ||
    code === "PGRST205" ||
    message.includes("could not find the table") ||
    message.includes("relation \"public.breedings\" does not exist") ||
    message.includes("relation \"breedings\" does not exist") ||
    message.includes("column") && message.includes("does not exist") ||
    message.includes("bucket not found") ||
    (statusCode === 404 && message.includes(BREEDING_PHOTOS_BUCKET))
  );
}

function handleSupabaseError(error, operation) {
  setSetupNote(isMissingSupabaseResource(error));
  return formatSupabaseError(error, operation);
}

async function loadBreedings() {
  const { tableBody } = getElements();

  if (!tableBody) {
    return;
  }

  tableBody.innerHTML = `
    <tr>
      <td colspan="3">Loading breedings...</td>
    </tr>
  `;
  setSetupNote(false);

  const result = await supabase
    .from("breedings")
    .select("*")
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: false });
  const { data, error } = result;

  logSupabaseResult("breedings select from breedings", result);

  if (error) {
    breedings = [];
    renderBreedings();
    setMessage(handleSupabaseError(error, "breedings select from breedings"), "error");
    return;
  }

  breedings = Array.isArray(data) ? data : [];
  renderBreedings();
}

async function uploadBreedingPhotos(files) {
  const uploads = Array.from(files || []);

  if (!uploads.length) {
    return [];
  }

  const uploadedUrls = [];

  logBreedingUploadStep("starting breeding photo upload batch", {
    fileCount: uploads.length,
    files: uploads.map((file) => ({
      name: file.name,
      size: file.size,
      type: file.type
    }))
  });

  for (const file of uploads) {
    const extension = file.name.split(".").pop() || "jpg";
    const uniqueId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.round(Math.random() * 100000)}`;
    const path = `breedings/${uniqueId}.${extension.toLowerCase()}`;

    logBreedingUploadStep("calling storage.upload", {
      path,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size
    });

    const result = await supabase.storage
      .from(BREEDING_PHOTOS_BUCKET)
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false
      });
    const { error } = result;

    logSupabaseResult("breeding photo upload", result, {
      bucket: BREEDING_PHOTOS_BUCKET,
      path,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size
    });

    if (error) {
      throw new Error(handleSupabaseError(error, "breeding photo upload"));
    }

    const publicPath = result.data?.path || path;
    const { data } = supabase.storage
      .from(BREEDING_PHOTOS_BUCKET)
      .getPublicUrl(publicPath);

    logBreedingUploadStep("public URL generated", {
      path: publicPath,
      publicUrl: data.publicUrl
    });

    uploadedUrls.push(data.publicUrl);
  }

  return uploadedUrls;
}

async function saveBreeding(event) {
  event.preventDefault();

  const { form, photoInput } = getElements();

  if (!form) {
    return;
  }

  const id = String(form.elements.id.value || "").trim();
  const existingBreeding = breedings.find((breeding) => breeding.id === id);
  const existingPhotos = existingBreeding ? normalizePhotos(existingBreeding) : [];
  const selectedFiles = photoInput?.files || [];

  logBreedingUploadStep("saveBreeding submit received", {
    mode: id ? "update" : "insert",
    id: id || null,
    selectedFileCount: selectedFiles.length,
    existingPhotoCount: existingPhotos.length
  });

  if (!id && !selectedFiles.length) {
    setMessage("At least one photo is required for a new breeding.", "error");
    return;
  }

  setLoading(true);
  setMessage("");

  try {
    const uploadedPhotos = await uploadBreedingPhotos(selectedFiles);
    const photoUrls = id
      ? (uploadedPhotos.length ? uploadedPhotos : existingPhotos)
      : uploadedPhotos;
    const payload = getFormPayload(form, photoUrls, existingBreeding?.display_order ?? 100, existingBreeding?.home_order ?? 100);

    console.info("[Breedings module] payload before breedings insert/update", {
      supabaseUrl: SUPABASE_URL,
      bucket: BREEDING_PHOTOS_BUCKET,
      uploadedPhotos,
      payloadPhotos: payload.photos,
      payload
    });

    const operation = id ? "breedings update breedings row" : "breedings insert breedings row";
    const request = id
      ? supabase.from("breedings").update(payload).eq("id", id).select().single()
      : supabase.from("breedings").insert(payload).select().single();

    const result = await request;
    const { error } = result;

    logSupabaseResult(operation, result, {
      id: id || null,
      payload
    });

    if (error) {
      throw new Error(handleSupabaseError(error, operation));
    }

    resetForm();
    setMessage(id ? "Breeding updated." : "Breeding added.", "info");
    await loadBreedings();
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    setLoading(false);
  }
}

function editBreeding(id) {
  const breeding = breedings.find((item) => item.id === id);
  const { form, formTitle, photoInput } = getElements();

  if (!breeding || !form) {
    return;
  }

  form.elements.id.value = breeding.id;
  form.elements.title.value = breeding.title || "";
  form.elements.description.value = breeding.description || "";
  form.elements.show_on_home.checked = Boolean(breeding.show_on_home);

  if (photoInput) {
    photoInput.value = "";
  }

  if (formTitle) {
    formTitle.textContent = "Edit Breeding";
  }

  showPhotoPreview(normalizePhotos(breeding));
  setMessage("Editing breeding. Add photos only if you want to replace the current gallery.", "info");
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function deleteBreeding(id) {
  const breeding = breedings.find((item) => item.id === id);

  if (!breeding) {
    return;
  }

  const label = breeding.title || "this breeding";
  const confirmed = window.confirm(`Delete ${label}? This removes the breeding record from Supabase.`);

  if (!confirmed) {
    return;
  }

  const result = await supabase
    .from("breedings")
    .delete()
    .eq("id", id);
  const { error } = result;

  logSupabaseResult("breedings delete breedings row", result, { id });

  if (error) {
    setMessage(handleSupabaseError(error, "breedings delete breedings row"), "error");
    return;
  }

  await deletePhotosByUrls(normalizePhotos(breeding));

  setMessage("Breeding deleted.", "info");
  await loadBreedings();
}

async function deletePhotosByUrls(urls) {
  const paths = urls
    .map((url) => {
      const marker = `/${BREEDING_PHOTOS_BUCKET}/`;
      const markerIndex = url.indexOf(marker);
      return markerIndex === -1 ? null : decodeURIComponent(url.slice(markerIndex + marker.length));
    })
    .filter(Boolean);

  if (!paths.length) {
    return;
  }

  const result = await supabase.storage.from(BREEDING_PHOTOS_BUCKET).remove(paths);
  logSupabaseResult("breeding photos delete", result, {
    bucket: BREEDING_PHOTOS_BUCKET,
    paths
  });
}

async function saveBreedingOrder(draggedId, targetId, placeAfterTarget = false) {
  if (!draggedId || !targetId || draggedId === targetId) {
    return;
  }

  const movedBreeding = breedings.find((breeding) => breeding.id === draggedId);
  const targetIndex = breedings.findIndex((breeding) => breeding.id === targetId);

  if (!movedBreeding || targetIndex === -1) {
    return;
  }

  const reorderedBreedings = breedings.filter((breeding) => breeding.id !== draggedId);
  const targetIndexAfterRemoval = reorderedBreedings.findIndex((breeding) => breeding.id === targetId);
  const insertIndex = placeAfterTarget ? targetIndexAfterRemoval + 1 : targetIndexAfterRemoval;
  reorderedBreedings.splice(insertIndex, 0, movedBreeding);
  breedings = reorderedBreedings;
  renderBreedings();

  setMessage("Saving breeding order...", "info");

  try {
    const results = await Promise.all(
      reorderedBreedings.map((breeding, index) =>
        supabase
          .from("breedings")
          .update({ display_order: index + 1 })
          .eq("id", breeding.id)
      )
    );

    results.forEach((result, index) => {
      logSupabaseResult("breedings update display_order", result, {
        id: reorderedBreedings[index].id,
        display_order: index + 1
      });
    });

    const failedResult = results.find((result) => result.error);

    if (failedResult) {
      throw new Error(handleSupabaseError(failedResult.error, "breedings update display_order"));
    }

    setMessage("Breeding order updated.", "info");
    await loadBreedings();
  } catch (error) {
    setMessage(error.message, "error");
  }
}

function handleBreedingDragStart(event) {
  const handle = event.target.closest("[data-breeding-drag-handle]");
  const row = event.target.closest("[data-breeding-row-id]");

  if (!handle || !row) {
    event.preventDefault();
    return;
  }

  draggedBreedingId = row.dataset.breedingRowId;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", draggedBreedingId);
}

function handleBreedingDragOver(event) {
  if (!draggedBreedingId || !event.target.closest("[data-breeding-row-id]")) {
    return;
  }

  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
}

function handleBreedingDrop(event) {
  const row = event.target.closest("[data-breeding-row-id]");

  if (!draggedBreedingId || !row) {
    return;
  }

  event.preventDefault();
  const rowBounds = row.getBoundingClientRect();
  const placeAfterTarget = event.clientY > rowBounds.top + rowBounds.height / 2;
  saveBreedingOrder(draggedBreedingId, row.dataset.breedingRowId, placeAfterTarget);
  draggedBreedingId = "";
}

function handleBreedingDragEnd() {
  draggedBreedingId = "";
}

function handleModuleClick(event) {
  const actionButton = event.target.closest("[data-breeding-action]");

  if (!actionButton) {
    return;
  }

  const action = actionButton.dataset.breedingAction;
  const breedingId = actionButton.dataset.breedingId;

  if (action === "reset") {
    resetForm();
  }

  if (action === "refresh") {
    loadBreedings();
  }

  if (action === "edit" && breedingId) {
    editBreeding(breedingId);
  }

  if (action === "delete" && breedingId) {
    deleteBreeding(breedingId);
  }
}

function handlePhotoPreview(event) {
  const urls = Array.from(event.target.files || []).map((file) => URL.createObjectURL(file));
  showPhotoPreview(urls);
}

function initBreedingsModule() {
  const { module, form, photoInput, tableBody } = getElements();

  if (!module || isInitialized) {
    return;
  }

  isInitialized = true;
  form?.addEventListener("submit", saveBreeding);
  module.addEventListener("click", handleModuleClick);
  photoInput?.addEventListener("change", handlePhotoPreview);
  tableBody?.addEventListener("dragstart", handleBreedingDragStart);
  tableBody?.addEventListener("dragover", handleBreedingDragOver);
  tableBody?.addEventListener("drop", handleBreedingDrop);
  tableBody?.addEventListener("dragend", handleBreedingDragEnd);
  loadBreedings();
}

window.addEventListener("dashboard:route-change", (event) => {
  if (event.detail.route === "breedings") {
    isInitialized = false;
    initBreedingsModule();
  }
});

if (window.location.hash === "#breedings") {
  initBreedingsModule();
}
