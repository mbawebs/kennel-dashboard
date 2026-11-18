import { createPhotoOrderEditor } from "./photo-order.js";
import { SUPABASE_URL, supabase } from "./supabase.js";

/*
Studs module storage model.

This module intentionally keeps using the existing public.dogs table for now.
The UI no longer writes breed, sex, gender, date_of_birth, status, or
pedigree_image_url.

Needed schema updates for the existing dogs table:

alter table public.dogs
  add column if not exists age integer,
  add column if not exists photos text[] not null default '{}',
  add column if not exists pedigree_url text,
  add column if not exists stud_fee text;

If your previous dogs table made breed or gender required, loosen those old
columns because the Studs form no longer sends them:

alter table public.dogs
  alter column breed drop not null,
  alter column gender drop not null;

Optional cleanup only after confirming nothing else depends on the old columns:

alter table public.dogs
  drop column if exists sex,
  drop column if exists pedigree_image_url;

Recommended policies for the existing dogs table:

alter table public.dogs enable row level security;

drop policy if exists "Authenticated users can read dogs" on public.dogs;
drop policy if exists "Authenticated users can create dogs" on public.dogs;
drop policy if exists "Authenticated users can update dogs" on public.dogs;
drop policy if exists "Authenticated users can delete dogs" on public.dogs;

create policy "Authenticated users can read dogs"
on public.dogs for select
to authenticated
using (true);

create policy "Authenticated users can create dogs"
on public.dogs for insert
to authenticated
with check (true);

create policy "Authenticated users can update dogs"
on public.dogs for update
to authenticated
using (true)
with check (true);

create policy "Authenticated users can delete dogs"
on public.dogs for delete
to authenticated
using (true);

The existing Supabase Storage bucket remains dog-photos. A pedigree image or
banner can be uploaded as part of the regular stud photo gallery.
*/

const STUD_PHOTOS_BUCKET = "dog-photos";
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
let studs = [];
let isInitialized = false;
let draggedStudId = "";

function getElements() {
  return {
    module: document.querySelector("[data-module='studs']"),
    form: document.querySelector("#studForm"),
    formTitle: document.querySelector("#studFormTitle"),
    message: document.querySelector("#studMessage"),
    photoInput: document.querySelector("#studPhotos"),
    photoPreview: document.querySelector("#studPhotoPreview"),
    tableBody: document.querySelector("#studsTableBody"),
    count: document.querySelector("#studsCount"),
    setupNote: document.querySelector("#studsSetupNote")
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

function normalizePhotos(stud) {
  if (Array.isArray(stud.photos)) {
    return stud.photos.filter(Boolean);
  }

  if (typeof stud.photos === "string" && stud.photos) {
    try {
      const parsed = JSON.parse(stud.photos);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [stud.photos];
    } catch {
      return [stud.photos];
    }
  }

  return stud.main_photo_url ? [stud.main_photo_url] : [];
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
    photos: photoUrls
  };

  const pedigreeUrl = String(formData.get("pedigree_url") || "").trim();
  const studFee = String(formData.get("stud_fee") || "").trim();
  payload.pedigree_url = pedigreeUrl || null;
  payload.stud_fee = studFee || null;

  return payload;
}

function setLoading(isLoading) {
  const { form, module } = getElements();
  const submitButton = form?.querySelector("button[type='submit']");

  if (submitButton) {
    submitButton.disabled = isLoading;
    submitButton.textContent = isLoading ? "Saving..." : "Save stud";
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
    formTitle.textContent = "Add Stud";
  }
  showPhotoPreview([]);
  setMessage("");
}

function renderStuds() {
  const { tableBody, count } = getElements();

  if (!tableBody) {
    return;
  }

  if (count) {
    count.textContent = `${studs.length} ${studs.length === 1 ? "stud" : "studs"}`;
  }

  if (!studs.length) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="6">No studs found. Add the first stud from the form.</td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = studs.map((stud) => {
    const photos = normalizePhotos(stud);
    const firstPhoto = photos[0];
    const fee = stud.stud_fee || "Not listed";
    const homeBadge = stud.show_on_home ? '<span class="tag">HOME</span>' : "";

    return `
      <tr data-stud-row-id="${escapeHtml(stud.id)}" draggable="true">
        <td>
          <button class="button compact ghost" type="button" data-stud-drag-handle draggable="true" aria-label="Drag stud to reorder" title="Drag to reorder" style="cursor: grab;">&#8942;&#8942;</button>
          <div class="stud-thumb">
            ${firstPhoto ? `<img src="${escapeHtml(getDisplayPhotoUrl(firstPhoto))}" alt="${escapeHtml(stud.name)} photo" />` : "<span>No photo</span>"}
          </div>
          <small>${photos.length} ${photos.length === 1 ? "photo" : "photos"}</small>
        </td>
        <td>
          <strong>${escapeHtml(stud.name)}</strong>
          ${homeBadge}
          ${stud.lineage ? `<small>${escapeHtml(stud.lineage)}</small>` : ""}
          <small>${escapeHtml(stud.pedigree_url || "No pedigree URL")}</small>
        </td>
        <td>${escapeHtml(stud.age ?? "")}</td>
        <td>${escapeHtml(stud.color || "")}</td>
        <td>${escapeHtml(fee)}</td>
        <td>
          <div class="row-actions">
            <button class="button compact" type="button" data-stud-action="edit" data-stud-id="${escapeHtml(stud.id)}">Edit</button>
            <button class="button compact danger" type="button" data-stud-action="delete" data-stud-id="${escapeHtml(stud.id)}">Delete</button>
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
    console.error(`[Studs module] Supabase ${operation} failed`, payload);
    return;
  }

  console.info(`[Studs module] Supabase ${operation} succeeded`, payload);
}

function logStudUploadStep(step, details = {}) {
  console.info(`[Studs module] ${step}`, {
    supabaseUrl: SUPABASE_URL,
    bucket: STUD_PHOTOS_BUCKET,
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
    message.includes("relation \"public.dogs\" does not exist") ||
    message.includes("relation \"dogs\" does not exist") ||
    message.includes("column") && message.includes("does not exist") ||
    message.includes("bucket not found") ||
    (statusCode === 404 && message.includes(STUD_PHOTOS_BUCKET))
  );
}

function handleSupabaseError(error, operation) {
  setSetupNote(isMissingSupabaseResource(error));
  return formatSupabaseError(error, operation);
}

async function loadStuds() {
  const { tableBody } = getElements();

  if (!tableBody) {
    return;
  }

  tableBody.innerHTML = `
    <tr>
      <td colspan="6">Loading studs...</td>
    </tr>
  `;
  setSetupNote(false);

  const result = await supabase
    .from("dogs")
    .select("*")
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: false });
  const { data, error } = result;

  logSupabaseResult("studs select from dogs", result);

  if (error) {
    studs = [];
    renderStuds();
    setMessage(handleSupabaseError(error, "studs select from dogs"), "error");
    return;
  }

  studs = data || [];
  renderStuds();
}

async function uploadStudPhotos(files) {
  const uploads = Array.from(files || []);

  if (!uploads.length) {
    return [];
  }

  const uploadedUrls = [];

  logStudUploadStep("starting stud photo upload batch", {
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
    const path = `studs/${uniqueId}.${extension.toLowerCase()}`;

    logStudUploadStep("calling storage.upload", {
      path,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size
    });

    const result = await supabase.storage
      .from(STUD_PHOTOS_BUCKET)
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false
      });
    const { error } = result;

    logSupabaseResult("stud photo upload", result, {
      bucket: STUD_PHOTOS_BUCKET,
      path,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size
    });

    console.info("[Studs module] storage.upload raw response", {
      supabaseUrl: SUPABASE_URL,
      bucket: STUD_PHOTOS_BUCKET,
      path,
      uploadData: result.data,
      uploadError: result.error
    });

    if (error) {
      throw new Error(handleSupabaseError(error, "stud photo upload"));
    }

    const publicPath = result.data?.path || path;

    const { data } = supabase.storage
      .from(STUD_PHOTOS_BUCKET)
      .getPublicUrl(publicPath);

    console.info("[Studs module] Supabase stud photo public URL generated", {
      bucket: STUD_PHOTOS_BUCKET,
      path: publicPath,
      publicUrl: data.publicUrl
    });

    logStudUploadStep("public URL generated", {
      path: publicPath,
      publicUrl: data.publicUrl
    });

    uploadedUrls.push(data.publicUrl);
  }

  return uploadedUrls;
}

async function saveStud(event) {
  event.preventDefault();

  const { form, photoInput } = getElements();

  if (!form) {
    return;
  }

  const id = String(form.elements.id.value || "").trim();
  const existingStud = studs.find((stud) => stud.id === id);
  const existingPhotos = existingStud ? normalizePhotos(existingStud) : [];
  const selectedFiles = photoInput?.files || [];

  logStudUploadStep("saveStud submit received", {
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
    setMessage("At least one photo is required for a new stud.", "error");
    return;
  }

  setLoading(true);
  setMessage("");

  try {
    const uploadedPhotos = await uploadStudPhotos(selectedFiles);
    const photoUrls = [...(id ? photoOrderEditor.getExisting() : []), ...uploadedPhotos];
    const payload = getFormPayload(form, photoUrls, existingStud?.display_order ?? 100, existingStud?.home_order ?? 100);

    console.info("[Studs module] payload before dogs insert/update", {
      supabaseUrl: SUPABASE_URL,
      bucket: STUD_PHOTOS_BUCKET,
      uploadedPhotos,
      payloadPhotos: payload.photos,
      payload
    });

    const operation = id ? "studs update dogs row" : "studs insert dogs row";
    const request = id
      ? supabase.from("dogs").update(payload).eq("id", id).select().single()
      : supabase.from("dogs").insert(payload).select().single();

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
    setMessage(id ? "Stud updated." : "Stud added.", "info");
    await loadStuds();
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    setLoading(false);
  }
}

function editStud(id) {
  const stud = studs.find((item) => item.id === id);
  const { form, formTitle, photoInput } = getElements();

  if (!stud || !form) {
    return;
  }

  form.elements.id.value = stud.id;
  form.elements.name.value = stud.name || "";
  form.elements.age.value = stud.age ?? "";
  form.elements.color.value = stud.color || "";
  form.elements.description.value = stud.description || "";
  form.elements.pedigree_url.value = stud.pedigree_url || "";
  form.elements.stud_fee.value = stud.stud_fee ?? "";
  form.elements.lineage.value = stud.lineage || "";
  form.elements.show_on_home.checked = Boolean(stud.show_on_home);

  if (photoInput) {
    photoInput.value = "";
  }

  if (formTitle) {
    formTitle.textContent = "Edit Stud";
  }

  showPhotoPreview(normalizePhotos(stud));
  setMessage("Editing stud. Add photos only if you want to append to the current gallery.", "info");
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function deleteStud(id) {
  const stud = studs.find((item) => item.id === id);

  if (!stud) {
    return;
  }

  const confirmed = window.confirm(`Delete ${stud.name}? This removes the stud record from Supabase.`);

  if (!confirmed) {
    return;
  }

  const result = await supabase
    .from("dogs")
    .delete()
    .eq("id", id);
  const { error } = result;

  logSupabaseResult("studs delete dogs row", result, { id });

  if (error) {
    setMessage(handleSupabaseError(error, "studs delete dogs row"), "error");
    return;
  }

  await deletePhotosByUrls(normalizePhotos(stud));

  setMessage("Stud deleted.", "info");
  await loadStuds();
}

async function deletePhotosByUrls(urls) {
  const paths = urls
    .map((url) => {
      const marker = `/${STUD_PHOTOS_BUCKET}/`;
      const markerIndex = url.indexOf(marker);
      return markerIndex === -1 ? null : decodeURIComponent(url.slice(markerIndex + marker.length));
    })
    .filter(Boolean);

  if (!paths.length) {
    return;
  }

  const result = await supabase.storage.from(STUD_PHOTOS_BUCKET).remove(paths);
  logSupabaseResult("stud photos delete", result, {
    bucket: STUD_PHOTOS_BUCKET,
    paths
  });
}

async function saveStudOrder(draggedId, targetId, placeAfterTarget = false) {
  if (!draggedId || !targetId || draggedId === targetId) {
    return;
  }

  const movedStud = studs.find((stud) => stud.id === draggedId);
  const targetIndex = studs.findIndex((stud) => stud.id === targetId);

  if (!movedStud || targetIndex === -1) {
    return;
  }

  const reorderedStuds = studs.filter((stud) => stud.id !== draggedId);
  const targetIndexAfterRemoval = reorderedStuds.findIndex((stud) => stud.id === targetId);
  const insertIndex = placeAfterTarget ? targetIndexAfterRemoval + 1 : targetIndexAfterRemoval;
  reorderedStuds.splice(insertIndex, 0, movedStud);
  studs = reorderedStuds;
  renderStuds();

  setMessage("Saving stud order...", "info");

  try {
    const results = await Promise.all(
      reorderedStuds.map((stud, index) =>
        supabase
          .from("dogs")
          .update({ display_order: index + 1 })
          .eq("id", stud.id)
      )
    );

    results.forEach((result, index) => {
      logSupabaseResult("studs update display_order", result, {
        id: reorderedStuds[index].id,
        display_order: index + 1
      });
    });

    const failedResult = results.find((result) => result.error);

    if (failedResult) {
      throw new Error(handleSupabaseError(failedResult.error, "studs update display_order"));
    }

    setMessage("Stud order updated.", "info");
    await loadStuds();
  } catch (error) {
    setMessage(error.message, "error");
  }
}

function handleStudDragStart(event) {
  const handle = event.target.closest("[data-stud-drag-handle]");
  const row = event.target.closest("[data-stud-row-id]");

  if (!handle || !row) {
    event.preventDefault();
    return;
  }

  draggedStudId = row.dataset.studRowId;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", draggedStudId);
}

function handleStudDragOver(event) {
  if (!draggedStudId || !event.target.closest("[data-stud-row-id]")) {
    return;
  }

  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
}

function handleStudDrop(event) {
  const row = event.target.closest("[data-stud-row-id]");

  if (!draggedStudId || !row) {
    return;
  }

  event.preventDefault();
  const rowBounds = row.getBoundingClientRect();
  const placeAfterTarget = event.clientY > rowBounds.top + rowBounds.height / 2;
  saveStudOrder(draggedStudId, row.dataset.studRowId, placeAfterTarget);
  draggedStudId = "";
}

function handleStudDragEnd() {
  draggedStudId = "";
}

function handleModuleClick(event) {
  const actionButton = event.target.closest("[data-stud-action]");

  if (!actionButton) {
    return;
  }

  const action = actionButton.dataset.studAction;
  const studId = actionButton.dataset.studId;

  if (action === "reset") {
    resetForm();
  }

  if (action === "refresh") {
    loadStuds();
  }

  if (action === "edit" && studId) {
    editStud(studId);
  }

  if (action === "delete" && studId) {
    deleteStud(studId);
  }
}

function handlePhotoPreview(event) {
  photoOrderEditor.setPending(event.target.files);
}

function initStudsModule() {
  const { module, form, photoInput, tableBody } = getElements();

  if (!module || isInitialized) {
    return;
  }

  isInitialized = true;
  form?.addEventListener("submit", saveStud);
  module.addEventListener("click", handleModuleClick);
  photoInput?.addEventListener("change", handlePhotoPreview);
  tableBody?.addEventListener("dragstart", handleStudDragStart);
  tableBody?.addEventListener("dragover", handleStudDragOver);
  tableBody?.addEventListener("drop", handleStudDrop);
  tableBody?.addEventListener("dragend", handleStudDragEnd);
  loadStuds();
}

window.addEventListener("dashboard:route-change", (event) => {
  if (event.detail.route === "studs") {
    isInitialized = false;
    initStudsModule();
  }
});

if (window.location.hash === "#studs") {
  initStudsModule();
}

