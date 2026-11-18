import { createPhotoOrderEditor } from "./photo-order.js";
import { SUPABASE_URL, supabase } from "./supabase.js";

const AVAILABLE_PHOTOS_BUCKET = "dog-photos";
const PUBLIC_SITE_ORIGIN = "https://onedongazabullie.com/";

function getDisplayPhotoUrl(url) {
  const value = String(url || "").trim();
  if (!value) return "";
  if (/^(https?:|data:|blob:)/i.test(value)) return value;
  return new URL(value.replace(/^\/+/, ""), PUBLIC_SITE_ORIGIN).href;
}
const photoOrderEditor = createPhotoOrderEditor(
  () => getElements().photoPreview,
  getDisplayPhotoUrl
);
let availableDogs = [];
let isInitialized = false;
let draggedAvailableId = "";

function getElements() {
  return {
    module: document.querySelector("[data-module='available']"),
    form: document.querySelector("#availableForm"),
    formTitle: document.querySelector("#availableFormTitle"),
    message: document.querySelector("#availableMessage"),
    photoInput: document.querySelector("#availablePhotos"),
    photoPreview: document.querySelector("#availablePhotoPreview"),
    tableBody: document.querySelector("#availableTableBody"),
    count: document.querySelector("#availableCount"),
    setupNote: document.querySelector("#availableSetupNote")
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

function normalizePhotos(availableDog) {
  if (Array.isArray(availableDog.photos)) {
    return availableDog.photos.filter(Boolean);
  }

  if (typeof availableDog.photos === "string" && availableDog.photos) {
    try {
      const parsed = JSON.parse(availableDog.photos);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [availableDog.photos];
    } catch {
      return [availableDog.photos];
    }
  }

  return availableDog.main_photo_url ? [availableDog.main_photo_url] : [];
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
  photoOrderEditor.setExisting(urls);
}

function getFormPayload(form, photoUrls, displayOrder = 100, homeOrder = 100) {
  const formData = new FormData(form);
  const normalizedDisplayOrder = Number(displayOrder);
  const normalizedHomeOrder = Number(homeOrder);

  return {
    name: String(formData.get("name") || "").trim(),
    gender: String(formData.get("gender") || "").trim() || null,
    price: String(formData.get("price") || "").trim() || null,
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
    submitButton.textContent = isLoading ? "Saving..." : "Save available dog";
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
    formTitle.textContent = "Add Available Dog";
  }
  showPhotoPreview([]);
  setMessage("");
}

function renderAvailable() {
  const { tableBody, count } = getElements();
  const visibleDogs = Array.isArray(availableDogs) ? availableDogs : [];

  if (!tableBody) {
    return;
  }

  if (count) {
    count.textContent = `${visibleDogs.length} ${visibleDogs.length === 1 ? "available dog" : "available dogs"}`;
  }

  if (!visibleDogs.length) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="5">No available dogs found. Add the first available dog from the form.</td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = visibleDogs.map((availableDog) => {
    const photos = normalizePhotos(availableDog);
    const firstPhoto = photos[0];
    const name = availableDog.name || "Unnamed available dog";
    const homeBadge = availableDog.show_on_home ? '<span class="tag">HOME</span>' : "";

    return `
      <tr data-available-row-id="${escapeHtml(availableDog.id)}" draggable="true">
        <td>
          <button class="button compact ghost" type="button" data-available-drag-handle draggable="true" aria-label="Drag available dog to reorder" title="Drag to reorder" style="cursor: grab;">&#8942;&#8942;</button>
          <div class="stud-thumb">
            ${firstPhoto ? `<img src="${escapeHtml(getDisplayPhotoUrl(firstPhoto))}" alt="${escapeHtml(name)} photo" />` : "<span>No photo</span>"}
          </div>
          <small>${photos.length} ${photos.length === 1 ? "photo" : "photos"}</small>
        </td>
        <td>
          <strong>${escapeHtml(name)}</strong>
          ${homeBadge}
          ${availableDog.description ? `<small>${escapeHtml(availableDog.description)}</small>` : ""}
        </td>
        <td>${availableDog.gender ? escapeHtml(availableDog.gender) : ""}</td>
        <td>${availableDog.price ? escapeHtml(availableDog.price) : ""}</td>
        <td>
          <div class="row-actions">
            <button class="button compact" type="button" data-available-action="edit" data-available-id="${escapeHtml(availableDog.id)}">Edit</button>
            <button class="button compact danger" type="button" data-available-action="delete" data-available-id="${escapeHtml(availableDog.id)}">Delete</button>
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
    console.error(`[Available module] Supabase ${operation} failed`, payload);
    return;
  }

  console.info(`[Available module] Supabase ${operation} succeeded`, payload);
}

function logAvailableUploadStep(step, details = {}) {
  console.info(`[Available module] ${step}`, {
    supabaseUrl: SUPABASE_URL,
    bucket: AVAILABLE_PHOTOS_BUCKET,
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
    message.includes("relation \"public.available\" does not exist") ||
    message.includes("relation \"available\" does not exist") ||
    message.includes("column") && message.includes("does not exist") ||
    message.includes("bucket not found") ||
    (statusCode === 404 && message.includes(AVAILABLE_PHOTOS_BUCKET))
  );
}

function handleSupabaseError(error, operation) {
  setSetupNote(isMissingSupabaseResource(error));
  return formatSupabaseError(error, operation);
}

async function loadAvailable() {
  const { tableBody } = getElements();

  if (!tableBody) {
    return;
  }

  tableBody.innerHTML = `
    <tr>
      <td colspan="5">Loading available dogs...</td>
    </tr>
  `;
  setSetupNote(false);

  const result = await supabase
    .from("available")
    .select("*")
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: false });
  const { data, error } = result;

  logSupabaseResult("available select from available", result);

  if (error) {
    availableDogs = [];
    renderAvailable();
    setMessage(handleSupabaseError(error, "available select from available"), "error");
    return;
  }

  availableDogs = Array.isArray(data) ? data : [];
  renderAvailable();
}

async function uploadAvailablePhotos(files) {
  const uploads = Array.from(files || []);

  if (!uploads.length) {
    return [];
  }

  const uploadedUrls = [];

  logAvailableUploadStep("starting available dog photo upload batch", {
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
    const path = `available/${uniqueId}.${extension.toLowerCase()}`;

    logAvailableUploadStep("calling storage.upload", {
      path,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size
    });

    const result = await supabase.storage
      .from(AVAILABLE_PHOTOS_BUCKET)
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false
      });
    const { error } = result;

    logSupabaseResult("available dog photo upload", result, {
      bucket: AVAILABLE_PHOTOS_BUCKET,
      path,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size
    });

    if (error) {
      throw new Error(handleSupabaseError(error, "available dog photo upload"));
    }

    const publicPath = result.data?.path || path;
    const { data } = supabase.storage
      .from(AVAILABLE_PHOTOS_BUCKET)
      .getPublicUrl(publicPath);

    logAvailableUploadStep("public URL generated", {
      path: publicPath,
      publicUrl: data.publicUrl
    });

    uploadedUrls.push(data.publicUrl);
  }

  return uploadedUrls;
}

async function saveAvailable(event) {
  event.preventDefault();

  const { form, photoInput } = getElements();

  if (!form) {
    return;
  }

  const id = String(form.elements.id.value || "").trim();
  const existingAvailable = availableDogs.find((availableDog) => availableDog.id === id);
  const existingPhotos = existingAvailable ? normalizePhotos(existingAvailable) : [];
  const selectedFiles = photoInput?.files || [];

  logAvailableUploadStep("saveAvailable submit received", {
    mode: id ? "update" : "insert",
    id: id || null,
    selectedFileCount: selectedFiles.length,
    existingPhotoCount: existingPhotos.length
  });

  if (!form.elements.name.value.trim()) {
    setMessage("Name is required.", "error");
    return;
  }

  if (!id && !selectedFiles.length) {
    setMessage("At least one photo is required for a new available dog.", "error");
    return;
  }

  setLoading(true);
  setMessage("");

  try {
    const uploadedPhotos = await uploadAvailablePhotos(selectedFiles);
    const photoUrls = [...(id ? photoOrderEditor.getExisting() : []), ...uploadedPhotos];
    const payload = getFormPayload(form, photoUrls, existingAvailable?.display_order ?? 100, existingAvailable?.home_order ?? 100);

    console.info("[Available module] payload before available insert/update", {
      supabaseUrl: SUPABASE_URL,
      bucket: AVAILABLE_PHOTOS_BUCKET,
      uploadedPhotos,
      payloadPhotos: payload.photos,
      payload
    });

    const operation = id ? "available update available row" : "available insert available row";
    const request = id
      ? supabase.from("available").update(payload).eq("id", id).select().single()
      : supabase.from("available").insert(payload).select().single();

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
    setMessage(id ? "Available dog updated." : "Available dog added.", "info");
    await loadAvailable();
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    setLoading(false);
  }
}

function editAvailable(id) {
  const availableDog = availableDogs.find((item) => item.id === id);
  const { form, formTitle, photoInput } = getElements();

  if (!availableDog || !form) {
    return;
  }

  form.elements.id.value = availableDog.id;
  form.elements.name.value = availableDog.name || "";
  form.elements.gender.value = availableDog.gender || "";
  form.elements.price.value = availableDog.price || "";
  form.elements.description.value = availableDog.description || "";
  form.elements.show_on_home.checked = Boolean(availableDog.show_on_home);

  if (photoInput) {
    photoInput.value = "";
  }

  if (formTitle) {
    formTitle.textContent = "Edit Available Dog";
  }

  showPhotoPreview(normalizePhotos(availableDog));
  setMessage("Editing available dog. Add photos only if you want to replace the current gallery.", "info");
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function deleteAvailable(id) {
  const availableDog = availableDogs.find((item) => item.id === id);

  if (!availableDog) {
    return;
  }

  const confirmed = window.confirm(`Delete ${availableDog.name}? This removes the available dog record from Supabase.`);

  if (!confirmed) {
    return;
  }

  const result = await supabase
    .from("available")
    .delete()
    .eq("id", id);
  const { error } = result;

  logSupabaseResult("available delete available row", result, { id });

  if (error) {
    setMessage(handleSupabaseError(error, "available delete available row"), "error");
    return;
  }

  await deletePhotosByUrls(normalizePhotos(availableDog));

  setMessage("Available dog deleted.", "info");
  await loadAvailable();
}

async function deletePhotosByUrls(urls) {
  const paths = urls
    .map((url) => {
      const marker = `/${AVAILABLE_PHOTOS_BUCKET}/`;
      const markerIndex = url.indexOf(marker);
      return markerIndex === -1 ? null : decodeURIComponent(url.slice(markerIndex + marker.length));
    })
    .filter(Boolean);

  if (!paths.length) {
    return;
  }

  const result = await supabase.storage.from(AVAILABLE_PHOTOS_BUCKET).remove(paths);
  logSupabaseResult("available dog photos delete", result, {
    bucket: AVAILABLE_PHOTOS_BUCKET,
    paths
  });
}

async function saveAvailableOrder(draggedId, targetId, placeAfterTarget = false) {
  if (!draggedId || !targetId || draggedId === targetId) {
    return;
  }

  const movedAvailable = availableDogs.find((availableDog) => availableDog.id === draggedId);
  const targetIndex = availableDogs.findIndex((availableDog) => availableDog.id === targetId);

  if (!movedAvailable || targetIndex === -1) {
    return;
  }

  const reorderedAvailable = availableDogs.filter((availableDog) => availableDog.id !== draggedId);
  const targetIndexAfterRemoval = reorderedAvailable.findIndex((availableDog) => availableDog.id === targetId);
  const insertIndex = placeAfterTarget ? targetIndexAfterRemoval + 1 : targetIndexAfterRemoval;
  reorderedAvailable.splice(insertIndex, 0, movedAvailable);
  availableDogs = reorderedAvailable;
  renderAvailable();

  setMessage("Saving available dog order...", "info");

  try {
    const results = await Promise.all(
      reorderedAvailable.map((availableDog, index) =>
        supabase
          .from("available")
          .update({ display_order: index + 1 })
          .eq("id", availableDog.id)
      )
    );

    results.forEach((result, index) => {
      logSupabaseResult("available update display_order", result, {
        id: reorderedAvailable[index].id,
        display_order: index + 1
      });
    });

    const failedResult = results.find((result) => result.error);

    if (failedResult) {
      throw new Error(handleSupabaseError(failedResult.error, "available update display_order"));
    }

    setMessage("Available dog order updated.", "info");
    await loadAvailable();
  } catch (error) {
    setMessage(error.message, "error");
  }
}

function handleAvailableDragStart(event) {
  const handle = event.target.closest("[data-available-drag-handle]");
  const row = event.target.closest("[data-available-row-id]");

  if (!handle || !row) {
    event.preventDefault();
    return;
  }

  draggedAvailableId = row.dataset.availableRowId;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", draggedAvailableId);
}

function handleAvailableDragOver(event) {
  if (!draggedAvailableId || !event.target.closest("[data-available-row-id]")) {
    return;
  }

  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
}

function handleAvailableDrop(event) {
  const row = event.target.closest("[data-available-row-id]");

  if (!draggedAvailableId || !row) {
    return;
  }

  event.preventDefault();
  const rowBounds = row.getBoundingClientRect();
  const placeAfterTarget = event.clientY > rowBounds.top + rowBounds.height / 2;
  saveAvailableOrder(draggedAvailableId, row.dataset.availableRowId, placeAfterTarget);
  draggedAvailableId = "";
}

function handleAvailableDragEnd() {
  draggedAvailableId = "";
}

function handleModuleClick(event) {
  const actionButton = event.target.closest("[data-available-action]");

  if (!actionButton) {
    return;
  }

  const action = actionButton.dataset.availableAction;
  const availableId = actionButton.dataset.availableId;

  if (action === "reset") {
    resetForm();
  }

  if (action === "refresh") {
    loadAvailable();
  }

  if (action === "edit" && availableId) {
    editAvailable(availableId);
  }

  if (action === "delete" && availableId) {
    deleteAvailable(availableId);
  }
}

function handlePhotoPreview(event) {
  photoOrderEditor.setPending(event.target.files);
}

function initAvailableModule() {
  const { module, form, photoInput, tableBody } = getElements();

  if (!module || isInitialized) {
    return;
  }

  isInitialized = true;
  form?.addEventListener("submit", saveAvailable);
  module.addEventListener("click", handleModuleClick);
  photoInput?.addEventListener("change", handlePhotoPreview);
  tableBody?.addEventListener("dragstart", handleAvailableDragStart);
  tableBody?.addEventListener("dragover", handleAvailableDragOver);
  tableBody?.addEventListener("drop", handleAvailableDrop);
  tableBody?.addEventListener("dragend", handleAvailableDragEnd);
  loadAvailable();
}

window.addEventListener("dashboard:route-change", (event) => {
  if (event.detail.route === "available") {
    isInitialized = false;
    initAvailableModule();
  }
});

if (window.location.hash === "#available") {
  initAvailableModule();
}

