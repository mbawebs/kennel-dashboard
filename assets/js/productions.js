import { SUPABASE_URL, supabase } from "./supabase.js";

/*
Productions module storage model.

This module intentionally keeps using the existing public.productions table for now.
The UI writes only the production fields listed below.

Needed schema updates for the existing productions table:

alter table public.productions
  add column if not exists name text,
  add column if not exists photos text[] not null default '{}',
  add column if not exists lineage text,
  add column if not exists description text,
  add column if not exists pedigree_url text,
  add column if not exists display_order integer default 100,
  add column if not exists status text default 'active';

Recommended policies for the existing productions table:

alter table public.productions enable row level security;

drop policy if exists "Authenticated users can read productions" on public.productions;
drop policy if exists "Authenticated users can create productions" on public.productions;
drop policy if exists "Authenticated users can update productions" on public.productions;
drop policy if exists "Authenticated users can delete productions" on public.productions;

create policy "Authenticated users can read productions"
on public.productions for select
to authenticated
using (true);

create policy "Authenticated users can create productions"
on public.productions for insert
to authenticated
with check (true);

create policy "Authenticated users can update productions"
on public.productions for update
to authenticated
using (true)
with check (true);

create policy "Authenticated users can delete productions"
on public.productions for delete
to authenticated
using (true);

The existing Supabase Storage bucket remains dog-photos. A pedigree image or
banner can be uploaded as part of the regular Production photo gallery.
*/

const PRODUCTION_PHOTOS_BUCKET = "dog-photos";
let productions = [];
let isInitialized = false;
let draggedProductionId = "";

function getElements() {
  return {
    module: document.querySelector("[data-module='productions']"),
    form: document.querySelector("#productionForm"),
    formTitle: document.querySelector("#productionFormTitle"),
    message: document.querySelector("#productionMessage"),
    photoInput: document.querySelector("#productionPhotos"),
    photoPreview: document.querySelector("#productionPhotoPreview"),
    tableBody: document.querySelector("#productionsTableBody"),
    count: document.querySelector("#productionsCount"),
    setupNote: document.querySelector("#productionsSetupNote")
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

function normalizePhotos(production) {
  if (Array.isArray(production.photos)) {
    return production.photos.filter(Boolean);
  }

  if (typeof production.photos === "string" && production.photos) {
    try {
      const parsed = JSON.parse(production.photos);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [production.photos];
    } catch {
      return [production.photos];
    }
  }

  return production.main_photo_url ? [production.main_photo_url] : [];
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
    .map((url) => `<img src="${escapeHtml(url)}" alt="Selected production photo preview" />`)
    .join("");
}

function getFormPayload(form, photoUrls, displayOrder = 100) {
  const formData = new FormData(form);
  const normalizedDisplayOrder = Number(displayOrder);
  const payload = {
    name: String(formData.get("name") || ""),
    description: String(formData.get("description") || "").trim() || null,
    lineage: String(formData.get("lineage") || "").trim() || null,
    display_order: Number.isFinite(normalizedDisplayOrder) ? normalizedDisplayOrder : 100,
    status: "active",
    photos: photoUrls
  };

  const pedigreeUrl = String(formData.get("pedigree_url") || "").trim();
  payload.pedigree_url = pedigreeUrl || null;

  return payload;
}

function setLoading(isLoading) {
  const { form, module } = getElements();
  const submitButton = form?.querySelector("button[type='submit']");

  if (submitButton) {
    submitButton.disabled = isLoading;
    submitButton.textContent = isLoading ? "Saving..." : "Save production";
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
    formTitle.textContent = "Add Production";
  }
  showPhotoPreview([]);
  setMessage("");
}

function renderProductions() {
  const { tableBody, count } = getElements();
  const visibleProductions = Array.isArray(productions) ? productions : [];

  if (!tableBody) {
    return;
  }

  if (count) {
    count.textContent = `${visibleProductions.length} ${visibleProductions.length === 1 ? "production" : "productions"}`;
  }

  if (!visibleProductions.length) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="3">No productions found. Add the first production from the form.</td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = visibleProductions.map((production) => {
    const photos = normalizePhotos(production);
    const firstPhoto = photos[0];
    const name = production.name || "Unnamed production";

    return `
      <tr data-production-row-id="${escapeHtml(production.id)}" draggable="true">
        <td>
          <button class="button compact ghost" type="button" data-production-drag-handle draggable="true" aria-label="Drag production to reorder" title="Drag to reorder" style="cursor: grab;">&#8942;&#8942;</button>
          <div class="stud-thumb">
            ${firstPhoto ? `<img src="${escapeHtml(firstPhoto)}" alt="${escapeHtml(name)} photo" />` : "<span>No photo</span>"}
          </div>
          <small>${photos.length} ${photos.length === 1 ? "photo" : "photos"}</small>
        </td>
        <td>
          <strong>${escapeHtml(name)}</strong>
          ${production.lineage ? `<small>${escapeHtml(production.lineage)}</small>` : ""}
          ${production.pedigree_url ? `<small>${escapeHtml(production.pedigree_url)}</small>` : ""}
        </td>
        <td>
          <div class="row-actions">
            <button class="button compact" type="button" data-production-action="edit" data-production-id="${escapeHtml(production.id)}">Edit</button>
            <button class="button compact danger" type="button" data-production-action="delete" data-production-id="${escapeHtml(production.id)}">Delete</button>
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
    console.error(`[Productions module] Supabase ${operation} failed`, payload);
    return;
  }

  console.info(`[Productions module] Supabase ${operation} succeeded`, payload);
}

function logProductionUploadStep(step, details = {}) {
  console.info(`[Productions module] ${step}`, {
    supabaseUrl: SUPABASE_URL,
    bucket: PRODUCTION_PHOTOS_BUCKET,
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
    message.includes("relation \"public.productions\" does not exist") ||
    message.includes("relation \"productions\" does not exist") ||
    message.includes("column") && message.includes("does not exist") ||
    message.includes("bucket not found") ||
    (statusCode === 404 && message.includes(PRODUCTION_PHOTOS_BUCKET))
  );
}

function handleSupabaseError(error, operation) {
  setSetupNote(isMissingSupabaseResource(error));
  return formatSupabaseError(error, operation);
}

async function loadProductions() {
  const { tableBody } = getElements();

  if (!tableBody) {
    return;
  }

  tableBody.innerHTML = `
    <tr>
      <td colspan="3">Loading productions...</td>
    </tr>
  `;
  setSetupNote(false);

  const result = await supabase
    .from("productions")
    .select("*")
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: false });
  const { data, error } = result;

  logSupabaseResult("productions select from productions", result);

  if (error) {
    productions = [];
    renderProductions();
    setMessage(handleSupabaseError(error, "productions select from productions"), "error");
    return;
  }

  productions = Array.isArray(data) ? data : [];
  renderProductions();
}

async function uploadProductionPhotos(files) {
  const uploads = Array.from(files || []);

  if (!uploads.length) {
    return [];
  }

  const uploadedUrls = [];

  logProductionUploadStep("starting production photo upload batch", {
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
    const path = `productions/${uniqueId}.${extension.toLowerCase()}`;

    logProductionUploadStep("calling storage.upload", {
      path,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size
    });

    const result = await supabase.storage
      .from(PRODUCTION_PHOTOS_BUCKET)
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false
      });
    const { error } = result;

    logSupabaseResult("production photo upload", result, {
      bucket: PRODUCTION_PHOTOS_BUCKET,
      path,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size
    });

    console.info("[Productions module] storage.upload raw response", {
      supabaseUrl: SUPABASE_URL,
      bucket: PRODUCTION_PHOTOS_BUCKET,
      path,
      uploadData: result.data,
      uploadError: result.error
    });

    if (error) {
      throw new Error(handleSupabaseError(error, "production photo upload"));
    }

    const publicPath = result.data?.path || path;

    const { data } = supabase.storage
      .from(PRODUCTION_PHOTOS_BUCKET)
      .getPublicUrl(publicPath);

    console.info("[Productions module] Supabase production photo public URL generated", {
      bucket: PRODUCTION_PHOTOS_BUCKET,
      path: publicPath,
      publicUrl: data.publicUrl
    });

    logProductionUploadStep("public URL generated", {
      path: publicPath,
      publicUrl: data.publicUrl
    });

    uploadedUrls.push(data.publicUrl);
  }

  return uploadedUrls;
}

async function saveProduction(event) {
  event.preventDefault();

  const { form, photoInput } = getElements();

  if (!form) {
    return;
  }

  const id = String(form.elements.id.value || "").trim();
  const existingProduction = productions.find((production) => production.id === id);
  const existingPhotos = existingProduction ? normalizePhotos(existingProduction) : [];
  const selectedFiles = photoInput?.files || [];

  logProductionUploadStep("saveProduction submit received", {
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
    setMessage("At least one photo is required for a new production.", "error");
    return;
  }

  setLoading(true);
  setMessage("");

  try {
    const uploadedPhotos = await uploadProductionPhotos(selectedFiles);
    const photoUrls = id
      ? (uploadedPhotos.length ? uploadedPhotos : existingPhotos)
      : uploadedPhotos;
    const payload = getFormPayload(form, photoUrls, existingProduction?.display_order ?? 100);

    console.info("[Productions module] payload before productions insert/update", {
      supabaseUrl: SUPABASE_URL,
      bucket: PRODUCTION_PHOTOS_BUCKET,
      uploadedPhotos,
      payloadPhotos: payload.photos,
      payload
    });

    const operation = id ? "productions update productions row" : "productions insert productions row";
    const request = id
      ? supabase.from("productions").update(payload).eq("id", id).select().single()
      : supabase.from("productions").insert(payload).select().single();

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
    setMessage(id ? "Production updated." : "Production added.", "info");
    await loadProductions();
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    setLoading(false);
  }
}

function editProduction(id) {
  const production = productions.find((item) => item.id === id);
  const { form, formTitle, photoInput } = getElements();

  if (!production || !form) {
    return;
  }

  form.elements.id.value = production.id;
  form.elements.name.value = production.name || "";
  form.elements.description.value = production.description || "";
  form.elements.pedigree_url.value = production.pedigree_url || "";
  form.elements.lineage.value = production.lineage || "";

  if (photoInput) {
    photoInput.value = "";
  }

  if (formTitle) {
    formTitle.textContent = "Edit Production";
  }

  showPhotoPreview(normalizePhotos(production));
  setMessage("Editing production. Add photos only if you want to replace the current gallery.", "info");
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function deleteProduction(id) {
  const production = productions.find((item) => item.id === id);

  if (!production) {
    return;
  }

  const confirmed = window.confirm(`Delete ${production.name}? This removes the production record from Supabase.`);

  if (!confirmed) {
    return;
  }

  const result = await supabase
    .from("productions")
    .delete()
    .eq("id", id);
  const { error } = result;

  logSupabaseResult("productions delete productions row", result, { id });

  if (error) {
    setMessage(handleSupabaseError(error, "productions delete productions row"), "error");
    return;
  }

  await deletePhotosByUrls(normalizePhotos(production));

  setMessage("Production deleted.", "info");
  await loadProductions();
}

async function deletePhotosByUrls(urls) {
  const paths = urls
    .map((url) => {
      const marker = `/${PRODUCTION_PHOTOS_BUCKET}/`;
      const markerIndex = url.indexOf(marker);
      return markerIndex === -1 ? null : decodeURIComponent(url.slice(markerIndex + marker.length));
    })
    .filter(Boolean);

  if (!paths.length) {
    return;
  }

  const result = await supabase.storage.from(PRODUCTION_PHOTOS_BUCKET).remove(paths);
  logSupabaseResult("Production photos delete", result, {
    bucket: PRODUCTION_PHOTOS_BUCKET,
    paths
  });
}

async function saveProductionOrder(draggedId, targetId, placeAfterTarget = false) {
  if (!draggedId || !targetId || draggedId === targetId) {
    return;
  }

  const movedProduction = productions.find((production) => production.id === draggedId);
  const targetIndex = productions.findIndex((production) => production.id === targetId);

  if (!movedProduction || targetIndex === -1) {
    return;
  }

  const reorderedProductions = productions.filter((production) => production.id !== draggedId);
  const targetIndexAfterRemoval = reorderedProductions.findIndex((production) => production.id === targetId);
  const insertIndex = placeAfterTarget ? targetIndexAfterRemoval + 1 : targetIndexAfterRemoval;
  reorderedProductions.splice(insertIndex, 0, movedProduction);
  productions = reorderedProductions;
  renderProductions();

  setMessage("Saving production order...", "info");

  try {
    const results = await Promise.all(
      reorderedProductions.map((production, index) =>
        supabase
          .from("productions")
          .update({ display_order: index + 1 })
          .eq("id", production.id)
      )
    );

    results.forEach((result, index) => {
      logSupabaseResult("productions update display_order", result, {
        id: reorderedProductions[index].id,
        display_order: index + 1
      });
    });

    const failedResult = results.find((result) => result.error);

    if (failedResult) {
      throw new Error(handleSupabaseError(failedResult.error, "productions update display_order"));
    }

    setMessage("Production order updated.", "info");
    await loadProductions();
  } catch (error) {
    setMessage(error.message, "error");
  }
}

function handleProductionDragStart(event) {
  const handle = event.target.closest("[data-production-drag-handle]");
  const row = event.target.closest("[data-production-row-id]");

  if (!handle || !row) {
    event.preventDefault();
    return;
  }

  draggedProductionId = row.dataset.productionRowId;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", draggedProductionId);
}

function handleProductionDragOver(event) {
  if (!draggedProductionId || !event.target.closest("[data-production-row-id]")) {
    return;
  }

  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
}

function handleProductionDrop(event) {
  const row = event.target.closest("[data-production-row-id]");

  if (!draggedProductionId || !row) {
    return;
  }

  event.preventDefault();
  const rowBounds = row.getBoundingClientRect();
  const placeAfterTarget = event.clientY > rowBounds.top + rowBounds.height / 2;
  saveProductionOrder(draggedProductionId, row.dataset.productionRowId, placeAfterTarget);
  draggedProductionId = "";
}

function handleProductionDragEnd() {
  draggedProductionId = "";
}

function handleModuleClick(event) {
  const actionButton = event.target.closest("[data-production-action]");

  if (!actionButton) {
    return;
  }

  const action = actionButton.dataset.productionAction;
  const productionId = actionButton.dataset.productionId;

  if (action === "reset") {
    resetForm();
  }

  if (action === "refresh") {
    loadProductions();
  }

  if (action === "edit" && productionId) {
    editProduction(productionId);
  }

  if (action === "delete" && productionId) {
    deleteProduction(productionId);
  }
}

function handlePhotoPreview(event) {
  const urls = Array.from(event.target.files || []).map((file) => URL.createObjectURL(file));
  showPhotoPreview(urls);
}

function initProductionsModule() {
  const { module, form, photoInput, tableBody } = getElements();

  if (!module || isInitialized) {
    return;
  }

  isInitialized = true;
  form?.addEventListener("submit", saveProduction);
  module.addEventListener("click", handleModuleClick);
  photoInput?.addEventListener("change", handlePhotoPreview);
  tableBody?.addEventListener("dragstart", handleProductionDragStart);
  tableBody?.addEventListener("dragover", handleProductionDragOver);
  tableBody?.addEventListener("drop", handleProductionDrop);
  tableBody?.addEventListener("dragend", handleProductionDragEnd);
  loadProductions();
}

window.addEventListener("dashboard:route-change", (event) => {
  if (event.detail.route === "productions") {
    isInitialized = false;
    initProductionsModule();
  }
});

if (window.location.hash === "#productions") {
  initProductionsModule();
}

