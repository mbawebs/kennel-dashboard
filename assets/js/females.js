import { createPhotoOrderEditor } from "./photo-order.js";
import { SUPABASE_URL, supabase } from "./supabase.js";

/*
Females module storage model.

This module intentionally keeps using the existing public.females table for now.
The UI no longer writes breed, sex, gender, date_of_birth, status, or
pedigree_image_url.

Needed schema updates for the existing females table:

alter table public.females
  add column if not exists age integer,
  add column if not exists photos text[] not null default '{}',
  add column if not exists pedigree_url text,
  add column if not exists lineage text,
  add column if not exists display_order integer default 100,
  add column if not exists status text default 'active';

If your previous females table made breed or gender required, loosen those old
columns because the Females form no longer sends them:

alter table public.females
  alter column breed drop not null,
  alter column gender drop not null;

Optional cleanup only after confirming nothing else depends on the old columns:

alter table public.females
  drop column if exists sex,
  drop column if exists pedigree_image_url;

Recommended policies for the existing females table:

alter table public.females enable row level security;

drop policy if exists "Authenticated users can read females" on public.females;
drop policy if exists "Authenticated users can create females" on public.females;
drop policy if exists "Authenticated users can update females" on public.females;
drop policy if exists "Authenticated users can delete females" on public.females;

create policy "Authenticated users can read females"
on public.females for select
to authenticated
using (true);

create policy "Authenticated users can create females"
on public.females for insert
to authenticated
with check (true);

create policy "Authenticated users can update females"
on public.females for update
to authenticated
using (true)
with check (true);

create policy "Authenticated users can delete females"
on public.females for delete
to authenticated
using (true);

The existing Supabase Storage bucket remains dog-photos. A pedigree image or
banner can be uploaded as part of the regular Female photo gallery.
*/

const FEMALE_PHOTOS_BUCKET = "dog-photos";
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
let females = [];
let isInitialized = false;
let draggedFemaleId = "";

function getElements() {
  return {
    module: document.querySelector("[data-module='females']"),
    form: document.querySelector("#femaleForm"),
    formTitle: document.querySelector("#femaleFormTitle"),
    message: document.querySelector("#femaleMessage"),
    photoInput: document.querySelector("#femalePhotos"),
    photoPreview: document.querySelector("#femalePhotoPreview"),
    tableBody: document.querySelector("#femalesTableBody"),
    count: document.querySelector("#femalesCount"),
    setupNote: document.querySelector("#femalesSetupNote")
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

function normalizePhotos(female) {
  if (Array.isArray(female.photos)) {
    return female.photos.filter(Boolean);
  }

  if (typeof female.photos === "string" && female.photos) {
    try {
      const parsed = JSON.parse(female.photos);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [female.photos];
    } catch {
      return [female.photos];
    }
  }

  return female.main_photo_url ? [female.main_photo_url] : [];
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
  const age = String(formData.get("age") || "").trim();
  const normalizedDisplayOrder = Number(displayOrder);
  const normalizedHomeOrder = Number(homeOrder);
  const payload = {
    name: String(formData.get("name") || ""),
    age: age ? Number(age) : null,
    color: String(formData.get("color") || "").trim() || null,
    description: String(formData.get("description") || "").trim(),
    lineage: String(formData.get("lineage") || "").trim() || null,
    display_order: Number.isFinite(normalizedDisplayOrder) ? normalizedDisplayOrder : 100,
    show_on_home: formData.get("show_on_home") === "on",
    home_order: Number.isFinite(normalizedHomeOrder) ? normalizedHomeOrder : 100,
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
    submitButton.textContent = isLoading ? "Saving..." : "Save female";
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
    formTitle.textContent = "Add Female";
  }
  showPhotoPreview([]);
  setMessage("");
}

function renderFemales() {
  const { tableBody, count } = getElements();
  const visibleFemales = Array.isArray(females) ? females : [];

  if (!tableBody) {
    return;
  }

  if (count) {
    count.textContent = `${visibleFemales.length} ${visibleFemales.length === 1 ? "female" : "females"}`;
  }

  if (!visibleFemales.length) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="5">No females found. Add the first female from the form.</td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = visibleFemales.map((female) => {
    const photos = normalizePhotos(female);
    const firstPhoto = photos[0];
    const name = female.name || "Unnamed female";
    const homeBadge = female.show_on_home ? '<span class="tag">HOME</span>' : "";

    return `
      <tr data-female-row-id="${escapeHtml(female.id)}" draggable="true">
        <td>
          <button class="button compact ghost" type="button" data-female-drag-handle draggable="true" aria-label="Drag female to reorder" title="Drag to reorder" style="cursor: grab;">&#8942;&#8942;</button>
          <div class="stud-thumb">
            ${firstPhoto ? `<img src="${escapeHtml(getDisplayPhotoUrl(firstPhoto))}" alt="${escapeHtml(name)} photo" />` : "<span>No photo</span>"}
          </div>
          <small>${photos.length} ${photos.length === 1 ? "photo" : "photos"}</small>
        </td>
        <td>
          <strong>${escapeHtml(name)}</strong>
          ${homeBadge}
          ${female.lineage ? `<small>${escapeHtml(female.lineage)}</small>` : ""}
          ${female.pedigree_url ? `<small>${escapeHtml(female.pedigree_url)}</small>` : ""}
        </td>
        <td>${escapeHtml(female.age ?? "")}</td>
        <td>${escapeHtml(female.color || "")}</td>
        <td>
          <div class="row-actions">
            <button class="button compact" type="button" data-female-action="edit" data-female-id="${escapeHtml(female.id)}">Edit</button>
            <button class="button compact danger" type="button" data-female-action="delete" data-female-id="${escapeHtml(female.id)}">Delete</button>
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
    console.error(`[Females module] Supabase ${operation} failed`, payload);
    return;
  }

  console.info(`[Females module] Supabase ${operation} succeeded`, payload);
}

function logFemaleUploadStep(step, details = {}) {
  console.info(`[Females module] ${step}`, {
    supabaseUrl: SUPABASE_URL,
    bucket: FEMALE_PHOTOS_BUCKET,
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
    message.includes("relation \"public.females\" does not exist") ||
    message.includes("relation \"females\" does not exist") ||
    message.includes("column") && message.includes("does not exist") ||
    message.includes("bucket not found") ||
    (statusCode === 404 && message.includes(FEMALE_PHOTOS_BUCKET))
  );
}

function handleSupabaseError(error, operation) {
  setSetupNote(isMissingSupabaseResource(error));
  return formatSupabaseError(error, operation);
}

async function loadFemales() {
  const { tableBody } = getElements();

  if (!tableBody) {
    return;
  }

  tableBody.innerHTML = `
    <tr>
      <td colspan="5">Loading females...</td>
    </tr>
  `;
  setSetupNote(false);

  const result = await supabase
    .from("females")
    .select("*")
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: false });
  const { data, error } = result;

  logSupabaseResult("females select from females", result);

  if (error) {
    females = [];
    renderFemales();
    setMessage(handleSupabaseError(error, "females select from females"), "error");
    return;
  }

  females = Array.isArray(data) ? data : [];
  renderFemales();
}

async function uploadFemalePhotos(files) {
  const uploads = Array.from(files || []);

  if (!uploads.length) {
    return [];
  }

  const uploadedUrls = [];

  logFemaleUploadStep("starting female photo upload batch", {
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
    const path = `females/${uniqueId}.${extension.toLowerCase()}`;

    logFemaleUploadStep("calling storage.upload", {
      path,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size
    });

    const result = await supabase.storage
      .from(FEMALE_PHOTOS_BUCKET)
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false
      });
    const { error } = result;

    logSupabaseResult("female photo upload", result, {
      bucket: FEMALE_PHOTOS_BUCKET,
      path,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size
    });

    console.info("[Females module] storage.upload raw response", {
      supabaseUrl: SUPABASE_URL,
      bucket: FEMALE_PHOTOS_BUCKET,
      path,
      uploadData: result.data,
      uploadError: result.error
    });

    if (error) {
      throw new Error(handleSupabaseError(error, "female photo upload"));
    }

    const publicPath = result.data?.path || path;

    const { data } = supabase.storage
      .from(FEMALE_PHOTOS_BUCKET)
      .getPublicUrl(publicPath);

    console.info("[Females module] Supabase female photo public URL generated", {
      bucket: FEMALE_PHOTOS_BUCKET,
      path: publicPath,
      publicUrl: data.publicUrl
    });

    logFemaleUploadStep("public URL generated", {
      path: publicPath,
      publicUrl: data.publicUrl
    });

    uploadedUrls.push(data.publicUrl);
  }

  return uploadedUrls;
}

async function saveFemale(event) {
  event.preventDefault();

  const { form, photoInput } = getElements();

  if (!form) {
    return;
  }

  const id = String(form.elements.id.value || "").trim();
  const existingFemale = females.find((female) => female.id === id);
  const existingPhotos = existingFemale ? normalizePhotos(existingFemale) : [];
  const selectedFiles = photoInput?.files || [];

  logFemaleUploadStep("saveFemale submit received", {
    mode: id ? "update" : "insert",
    id: id || null,
    selectedFileCount: selectedFiles.length,
    existingPhotoCount: existingPhotos.length
  });

  if (!form.elements.name.value.trim() || !form.elements.description.value.trim()) {
    setMessage("Name and description are required.", "error");
    return;
  }

  if (!id && !selectedFiles.length) {
    setMessage("At least one photo is required for a new female.", "error");
    return;
  }

  setLoading(true);
  setMessage("");

  try {
    const uploadedPhotos = await uploadFemalePhotos(selectedFiles);
    const photoUrls = [...(id ? photoOrderEditor.getExisting() : []), ...uploadedPhotos];
    const payload = getFormPayload(form, photoUrls, existingFemale?.display_order ?? 100, existingFemale?.home_order ?? 100);

    console.info("[Females module] payload before females insert/update", {
      supabaseUrl: SUPABASE_URL,
      bucket: FEMALE_PHOTOS_BUCKET,
      uploadedPhotos,
      payloadPhotos: payload.photos,
      payload
    });

    const operation = id ? "females update females row" : "females insert females row";
    const request = id
      ? supabase.from("females").update(payload).eq("id", id).select().single()
      : supabase.from("females").insert(payload).select().single();

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
    setMessage(id ? "Female updated." : "Female added.", "info");
    await loadFemales();
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    setLoading(false);
  }
}

function editFemale(id) {
  const female = females.find((item) => item.id === id);
  const { form, formTitle, photoInput } = getElements();

  if (!female || !form) {
    return;
  }

  form.elements.id.value = female.id;
  form.elements.name.value = female.name || "";
  form.elements.age.value = female.age ?? "";
  form.elements.color.value = female.color || "";
  form.elements.description.value = female.description || "";
  form.elements.pedigree_url.value = female.pedigree_url || "";
  form.elements.lineage.value = female.lineage || "";
  form.elements.show_on_home.checked = Boolean(female.show_on_home);

  if (photoInput) {
    photoInput.value = "";
  }

  if (formTitle) {
    formTitle.textContent = "Edit Female";
  }

  showPhotoPreview(normalizePhotos(female));
  setMessage("Editing female. Add photos only if you want to replace the current gallery.", "info");
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function deleteFemale(id) {
  const female = females.find((item) => item.id === id);

  if (!female) {
    return;
  }

  const confirmed = window.confirm(`Delete ${female.name}? This removes the female record from Supabase.`);

  if (!confirmed) {
    return;
  }

  const result = await supabase
    .from("females")
    .delete()
    .eq("id", id);
  const { error } = result;

  logSupabaseResult("females delete females row", result, { id });

  if (error) {
    setMessage(handleSupabaseError(error, "females delete females row"), "error");
    return;
  }

  await deletePhotosByUrls(normalizePhotos(female));

  setMessage("Female deleted.", "info");
  await loadFemales();
}

async function deletePhotosByUrls(urls) {
  const paths = urls
    .map((url) => {
      const marker = `/${FEMALE_PHOTOS_BUCKET}/`;
      const markerIndex = url.indexOf(marker);
      return markerIndex === -1 ? null : decodeURIComponent(url.slice(markerIndex + marker.length));
    })
    .filter(Boolean);

  if (!paths.length) {
    return;
  }

  const result = await supabase.storage.from(FEMALE_PHOTOS_BUCKET).remove(paths);
  logSupabaseResult("Female photos delete", result, {
    bucket: FEMALE_PHOTOS_BUCKET,
    paths
  });
}

async function saveFemaleOrder(draggedId, targetId, placeAfterTarget = false) {
  if (!draggedId || !targetId || draggedId === targetId) {
    return;
  }

  const movedFemale = females.find((female) => female.id === draggedId);
  const targetIndex = females.findIndex((female) => female.id === targetId);

  if (!movedFemale || targetIndex === -1) {
    return;
  }

  const reorderedFemales = females.filter((female) => female.id !== draggedId);
  const targetIndexAfterRemoval = reorderedFemales.findIndex((female) => female.id === targetId);
  const insertIndex = placeAfterTarget ? targetIndexAfterRemoval + 1 : targetIndexAfterRemoval;
  reorderedFemales.splice(insertIndex, 0, movedFemale);
  females = reorderedFemales;
  renderFemales();

  setMessage("Saving female order...", "info");

  try {
    const results = await Promise.all(
      reorderedFemales.map((female, index) =>
        supabase
          .from("females")
          .update({ display_order: index + 1 })
          .eq("id", female.id)
      )
    );

    results.forEach((result, index) => {
      logSupabaseResult("females update display_order", result, {
        id: reorderedFemales[index].id,
        display_order: index + 1
      });
    });

    const failedResult = results.find((result) => result.error);

    if (failedResult) {
      throw new Error(handleSupabaseError(failedResult.error, "females update display_order"));
    }

    setMessage("Female order updated.", "info");
    await loadFemales();
  } catch (error) {
    setMessage(error.message, "error");
  }
}

function handleFemaleDragStart(event) {
  const handle = event.target.closest("[data-female-drag-handle]");
  const row = event.target.closest("[data-female-row-id]");

  if (!handle || !row) {
    event.preventDefault();
    return;
  }

  draggedFemaleId = row.dataset.femaleRowId;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", draggedFemaleId);
}

function handleFemaleDragOver(event) {
  if (!draggedFemaleId || !event.target.closest("[data-female-row-id]")) {
    return;
  }

  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
}

function handleFemaleDrop(event) {
  const row = event.target.closest("[data-female-row-id]");

  if (!draggedFemaleId || !row) {
    return;
  }

  event.preventDefault();
  const rowBounds = row.getBoundingClientRect();
  const placeAfterTarget = event.clientY > rowBounds.top + rowBounds.height / 2;
  saveFemaleOrder(draggedFemaleId, row.dataset.femaleRowId, placeAfterTarget);
  draggedFemaleId = "";
}

function handleFemaleDragEnd() {
  draggedFemaleId = "";
}

function handleModuleClick(event) {
  const actionButton = event.target.closest("[data-female-action]");

  if (!actionButton) {
    return;
  }

  const action = actionButton.dataset.femaleAction;
  const femaleId = actionButton.dataset.femaleId;

  if (action === "reset") {
    resetForm();
  }

  if (action === "refresh") {
    loadFemales();
  }

  if (action === "edit" && femaleId) {
    editFemale(femaleId);
  }

  if (action === "delete" && femaleId) {
    deleteFemale(femaleId);
  }
}

function handlePhotoPreview(event) {
  photoOrderEditor.setPending(event.target.files);
}

function initFemalesModule() {
  const { module, form, photoInput, tableBody } = getElements();

  if (!module || isInitialized) {
    return;
  }

  isInitialized = true;
  form?.addEventListener("submit", saveFemale);
  module.addEventListener("click", handleModuleClick);
  photoInput?.addEventListener("change", handlePhotoPreview);
  tableBody?.addEventListener("dragstart", handleFemaleDragStart);
  tableBody?.addEventListener("dragover", handleFemaleDragOver);
  tableBody?.addEventListener("drop", handleFemaleDrop);
  tableBody?.addEventListener("dragend", handleFemaleDragEnd);
  loadFemales();
}

window.addEventListener("dashboard:route-change", (event) => {
  if (event.detail.route === "females") {
    isInitialized = false;
    initFemalesModule();
  }
});

if (window.location.hash === "#females") {
  initFemalesModule();
}

