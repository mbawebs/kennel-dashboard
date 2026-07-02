import { supabase } from "./supabase.js";

/*
Breeder content modules.

This file implements:
- breedings
- available
- gallery

All modules use the existing Supabase client and the existing dog-photos bucket.
Each table stores multiple photo URLs in a text[] column named photos.

Required SQL:

create table if not exists public.females (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  age integer not null,
  color text not null,
  description text not null,
  pedigree_url text,
  photos text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.breedings (
  id uuid primary key default gen_random_uuid(),
  photos text[] not null default '{}',
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.available (
  id uuid primary key default gen_random_uuid(),
  photos text[] not null default '{}',
  price text not null,
  color text not null,
  age integer,
  name text,
  description text,
  pedigree_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.gallery (
  id uuid primary key default gen_random_uuid(),
  photos text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.females enable row level security;
alter table public.breedings enable row level security;
alter table public.available enable row level security;
alter table public.gallery enable row level security;

For each table above, create authenticated select/insert/update/delete policies.
Example for public.females; repeat with each table name:

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

Storage:

Use the existing public bucket named dog-photos. These modules upload into
folder paths such as females/, breedings/, available/, gallery/.

If the bucket does not exist yet:

insert into storage.buckets (id, name, public)
values ('dog-photos', 'dog-photos', true)
on conflict (id) do nothing;

Recommended storage policies for authenticated dashboard users:

create policy "Authenticated users can upload breeder photos"
on storage.objects for insert
to authenticated
with check (bucket_id = 'dog-photos');

create policy "Authenticated users can update breeder photos"
on storage.objects for update
to authenticated
using (bucket_id = 'dog-photos')
with check (bucket_id = 'dog-photos');

create policy "Authenticated users can delete breeder photos"
on storage.objects for delete
to authenticated
using (bucket_id = 'dog-photos');

create policy "Breeder photos are publicly readable"
on storage.objects for select
to public
using (bucket_id = 'dog-photos');
*/

const PHOTO_BUCKET = "dog-photos";

const MODULES = {
  breedings: {
    table: "breedings",
    title: "Breedings",
    required: [],
    optional: ["description"],
    fields: [
      { name: "description", type: "text" }
    ]
  },
  available: {
    table: "available",
    title: "Available",
    required: ["price", "color"],
    optional: ["age", "name", "description", "pedigree_url"],
    fields: [
      { name: "price", type: "text" },
      { name: "color", type: "text" },
      { name: "age", type: "number" },
      { name: "name", type: "text" },
      { name: "description", type: "text" },
      { name: "pedigree_url", type: "text" }
    ]
  },
  gallery: {
    table: "gallery",
    title: "Gallery",
    required: [],
    optional: [],
    fields: []
  }
};

const state = {};

function getModuleState(route) {
  if (!state[route]) {
    state[route] = {
      records: [],
      initialized: false
    };
  }

  return state[route];
}

function getElements(route) {
  return {
    module: document.querySelector(`[data-module='${route}']`),
    form: document.querySelector(`#${route}Form`),
    formTitle: document.querySelector(`#${route}FormTitle`),
    message: document.querySelector(`#${route}Message`),
    photoInput: document.querySelector(`#${route}Photos`),
    photoPreview: document.querySelector(`#${route}PhotoPreview`),
    tableBody: document.querySelector(`#${route}TableBody`),
    count: document.querySelector(`#${route}Count`),
    setupNote: document.querySelector(`#${route}SetupNote`)
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

function labelFromName(name) {
  return name
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizePhotos(record) {
  if (Array.isArray(record.photos)) {
    return record.photos.filter(Boolean);
  }

  if (typeof record.photos === "string" && record.photos) {
    try {
      const parsed = JSON.parse(record.photos);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [record.photos];
    } catch {
      return [record.photos];
    }
  }

  return [];
}

function setMessage(route, message, type = "info") {
  const { message: messageElement } = getElements(route);

  if (!messageElement) {
    return;
  }

  messageElement.textContent = message;
  messageElement.dataset.type = type;
  messageElement.hidden = !message;
}

function setSetupNote(route, isVisible) {
  const { setupNote } = getElements(route);

  if (setupNote) {
    setupNote.hidden = !isVisible;
  }
}

function showPhotoPreview(route, urls = []) {
  const { photoPreview } = getElements(route);

  if (!photoPreview) {
    return;
  }

  if (!urls.length) {
    photoPreview.innerHTML = "<span>No photos selected</span>";
    return;
  }

  photoPreview.innerHTML = urls
    .map((url) => `<img src="${escapeHtml(url)}" alt="Selected photo preview" />`)
    .join("");
}

function setLoading(route, isLoading) {
  const config = MODULES[route];
  const { form, module } = getElements(route);
  const submitButton = form?.querySelector("button[type='submit']");

  if (submitButton) {
    submitButton.disabled = isLoading;
    submitButton.textContent = isLoading ? "Saving..." : `Save ${config.title.toLowerCase()}`;
  }

  module?.classList.toggle("is-loading", isLoading);
}

function coerceValue(value, type) {
  if (type === "number") {
    return Number(value);
  }

  return String(value || "").trim();
}

function getPayload(route, form, photoUrls) {
  const config = MODULES[route];
  const formData = new FormData(form);
  const payload = {
    photos: photoUrls
  };

  config.fields.forEach((field) => {
    const rawValue = formData.get(field.name);
    const stringValue = String(rawValue || "").trim();

    if (!stringValue && config.optional.includes(field.name)) {
      return;
    }

    payload[field.name] = coerceValue(rawValue, field.type);
  });

  return payload;
}

function validateRequired(route, form, selectedFiles, isEditing) {
  const config = MODULES[route];
  const missing = config.required.filter((fieldName) => {
    const value = String(form.elements[fieldName]?.value || "").trim();
    return !value;
  });

  if (missing.length) {
    return `${missing.map(labelFromName).join(", ")} ${missing.length === 1 ? "is" : "are"} required.`;
  }

  if (!isEditing && !selectedFiles.length) {
    return "At least one photo is required.";
  }

  return "";
}

function resetForm(route) {
  const config = MODULES[route];
  const { form, formTitle, photoInput } = getElements(route);

  form?.reset();
  if (form?.elements.id) {
    form.elements.id.value = "";
  }
  if (photoInput) {
    photoInput.value = "";
  }
  if (formTitle) {
    formTitle.textContent = `Add ${config.title}`;
  }
  showPhotoPreview(route, []);
  setMessage(route, "");
}

function renderRecords(route) {
  const config = MODULES[route];
  const moduleState = getModuleState(route);
  const { tableBody, count } = getElements(route);

  if (!tableBody) {
    return;
  }

  if (count) {
    count.textContent = `${moduleState.records.length} ${moduleState.records.length === 1 ? "record" : "records"}`;
  }

  if (!moduleState.records.length) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="${config.fields.length + 2}">No records found. Add the first record from the form.</td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = moduleState.records.map((record) => {
    const photos = normalizePhotos(record);
    const firstPhoto = photos[0];
    const fieldCells = config.fields.map((field) => {
      const value = field.type === "number" && record[field.name] != null
        ? Number(record[field.name]).toLocaleString()
        : record[field.name] || "";

      return `<td>${escapeHtml(value)}</td>`;
    }).join("");

    return `
      <tr>
        <td>
          <div class="content-thumb">
            ${firstPhoto ? `<img src="${escapeHtml(firstPhoto)}" alt="${escapeHtml(config.title)} photo" />` : "<span>No photo</span>"}
          </div>
          <small>${photos.length} ${photos.length === 1 ? "photo" : "photos"}</small>
        </td>
        ${fieldCells}
        <td>
          <div class="row-actions">
            <button class="button compact" type="button" data-content-action="edit" data-record-id="${escapeHtml(record.id)}">Edit</button>
            <button class="button compact danger" type="button" data-content-action="delete" data-record-id="${escapeHtml(record.id)}">Delete</button>
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
    console.error(`[Breeder modules] Supabase ${operation} failed`, payload);
    return;
  }

  console.info(`[Breeder modules] Supabase ${operation} succeeded`, payload);
}

function isMissingSupabaseResource(route, error) {
  const config = MODULES[route];
  const message = getSupabaseErrorMessage(error).toLowerCase();
  const code = String(error?.code || "");
  const statusCode = Number(error?.statusCode || error?.status || 0);

  return (
    code === "42P01" ||
    code === "PGRST205" ||
    message.includes("could not find the table") ||
    message.includes(`relation "public.${config.table}" does not exist`) ||
    message.includes(`relation "${config.table}" does not exist`) ||
    message.includes("column") && message.includes("does not exist") ||
    message.includes("bucket not found") ||
    (statusCode === 404 && message.includes(PHOTO_BUCKET))
  );
}

function handleSupabaseError(route, error, operation) {
  setSetupNote(route, isMissingSupabaseResource(route, error));
  return formatSupabaseError(error, operation);
}

async function loadRecords(route) {
  const config = MODULES[route];
  const { tableBody } = getElements(route);

  if (!tableBody) {
    return;
  }

  tableBody.innerHTML = `
    <tr>
      <td colspan="${config.fields.length + 2}">Loading ${config.title.toLowerCase()}...</td>
    </tr>
  `;
  setSetupNote(route, false);

  const result = await supabase
    .from(config.table)
    .select("*")
    .order("created_at", { ascending: false });
  const { data, error } = result;

  logSupabaseResult(`${route} select`, result);

  if (error) {
    getModuleState(route).records = [];
    renderRecords(route);
    setMessage(route, handleSupabaseError(route, error, `${route} select`), "error");
    return;
  }

  getModuleState(route).records = data || [];
  renderRecords(route);
}

async function uploadPhotos(route, files) {
  const uploads = Array.from(files || []);

  if (!uploads.length) {
    return [];
  }

  const uploadedUrls = [];

  for (const file of uploads) {
    const extension = file.name.split(".").pop() || "jpg";
    const uniqueId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.round(Math.random() * 100000)}`;
    const path = `${route}/${uniqueId}.${extension.toLowerCase()}`;
    const result = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false
      });
    const { error } = result;

    logSupabaseResult(`${route} photo upload`, result, {
      bucket: PHOTO_BUCKET,
      path,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size
    });

    if (error) {
      throw new Error(handleSupabaseError(route, error, `${route} photo upload`));
    }

    const { data } = supabase.storage
      .from(PHOTO_BUCKET)
      .getPublicUrl(path);

    uploadedUrls.push(data.publicUrl);
  }

  return uploadedUrls;
}

async function saveRecord(route, event) {
  event.preventDefault();

  const config = MODULES[route];
  const moduleState = getModuleState(route);
  const { form, photoInput } = getElements(route);

  if (!form) {
    return;
  }

  const id = String(form.elements.id.value || "").trim();
  const existingRecord = moduleState.records.find((record) => record.id === id);
  const existingPhotos = existingRecord ? normalizePhotos(existingRecord) : [];
  const selectedFiles = photoInput?.files || [];
  const validationError = validateRequired(route, form, selectedFiles, Boolean(id));

  if (validationError) {
    setMessage(route, validationError, "error");
    return;
  }

  setLoading(route, true);
  setMessage(route, "");

  try {
    const uploadedPhotos = await uploadPhotos(route, selectedFiles);
    const photoUrls = [...existingPhotos, ...uploadedPhotos];
    const payload = getPayload(route, form, photoUrls);
    const operation = id ? `${route} update` : `${route} insert`;
    const request = id
      ? supabase.from(config.table).update(payload).eq("id", id).select().single()
      : supabase.from(config.table).insert(payload).select().single();

    const result = await request;
    const { error } = result;

    logSupabaseResult(operation, result, {
      id: id || null,
      payload
    });

    if (error) {
      throw new Error(handleSupabaseError(route, error, operation));
    }

    resetForm(route);
    setMessage(route, id ? "Record updated." : "Record added.", "info");
    await loadRecords(route);
  } catch (error) {
    setMessage(route, error.message, "error");
  } finally {
    setLoading(route, false);
  }
}

function editRecord(route, id) {
  const config = MODULES[route];
  const record = getModuleState(route).records.find((item) => item.id === id);
  const { form, formTitle, photoInput } = getElements(route);

  if (!record || !form) {
    return;
  }

  form.elements.id.value = record.id;
  config.fields.forEach((field) => {
    form.elements[field.name].value = record[field.name] ?? "";
  });

  if (photoInput) {
    photoInput.value = "";
  }

  if (formTitle) {
    formTitle.textContent = `Edit ${config.title}`;
  }

  showPhotoPreview(route, normalizePhotos(record));
  setMessage(route, "Editing record. Add photos only if you want to append to the current gallery.", "info");
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function deleteRecord(route, id) {
  const config = MODULES[route];
  const record = getModuleState(route).records.find((item) => item.id === id);

  if (!record) {
    return;
  }

  const confirmed = window.confirm(`Delete this ${config.title.toLowerCase()} record?`);

  if (!confirmed) {
    return;
  }

  const result = await supabase
    .from(config.table)
    .delete()
    .eq("id", id);
  const { error } = result;

  logSupabaseResult(`${route} delete`, result, { id });

  if (error) {
    setMessage(route, handleSupabaseError(route, error, `${route} delete`), "error");
    return;
  }

  await deletePhotos(route, normalizePhotos(record));
  setMessage(route, "Record deleted.", "info");
  await loadRecords(route);
}

async function deletePhotos(route, urls) {
  const paths = urls
    .map((url) => {
      const marker = `/${PHOTO_BUCKET}/`;
      const markerIndex = url.indexOf(marker);
      return markerIndex === -1 ? null : decodeURIComponent(url.slice(markerIndex + marker.length));
    })
    .filter(Boolean);

  if (!paths.length) {
    return;
  }

  const result = await supabase.storage.from(PHOTO_BUCKET).remove(paths);
  logSupabaseResult(`${route} photos delete`, result, {
    bucket: PHOTO_BUCKET,
    paths
  });
}

function handleModuleClick(route, event) {
  const actionButton = event.target.closest("[data-content-action]");

  if (!actionButton) {
    return;
  }

  const action = actionButton.dataset.contentAction;
  const recordId = actionButton.dataset.recordId;

  if (action === "reset") {
    resetForm(route);
  }

  if (action === "refresh") {
    loadRecords(route);
  }

  if (action === "edit" && recordId) {
    editRecord(route, recordId);
  }

  if (action === "delete" && recordId) {
    deleteRecord(route, recordId);
  }
}

function handlePhotoPreview(route, event) {
  const urls = Array.from(event.target.files || []).map((file) => URL.createObjectURL(file));
  showPhotoPreview(route, urls);
}

function initModule(route) {
  const config = MODULES[route];
  const moduleState = getModuleState(route);
  const { module, form, photoInput } = getElements(route);

  if (!config || !module || moduleState.initialized) {
    return;
  }

  moduleState.initialized = true;
  form?.addEventListener("submit", (event) => saveRecord(route, event));
  module.addEventListener("click", (event) => handleModuleClick(route, event));
  photoInput?.addEventListener("change", (event) => handlePhotoPreview(route, event));
  loadRecords(route);
}

window.addEventListener("dashboard:route-change", (event) => {
  if (MODULES[event.detail.route]) {
    getModuleState(event.detail.route).initialized = false;
    initModule(event.detail.route);
  }
});

const currentRoute = window.location.hash.replace("#", "");
if (MODULES[currentRoute]) {
  initModule(currentRoute);
}
