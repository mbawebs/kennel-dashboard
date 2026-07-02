const routes = {
  dashboard: {
    title: "Dashboard",
    eyebrow: "Kennel operations",
    render: () => `
      <section class="hero-panel" aria-label="Dashboard overview">
        <div class="summary-card">
          <p class="eyebrow">Command center</p>
          <h2>Premium kennel management, ready for real data.</h2>
          <p>Track studs, females, productions, breedings, availability, galleries, and website inquiries from one focused operating dashboard.</p>
          <div class="quick-row">
            <div class="quick-stat"><strong>24</strong><span>Active records</span></div>
            <div class="quick-stat"><strong>6</strong><span>Upcoming breedings</span></div>
            <div class="quick-stat"><strong>11</strong><span>Available puppies</span></div>
            <div class="quick-stat"><strong>18</strong><span>Open leads</span></div>
          </div>
        </div>
        <aside class="panel">
          <h3>Today</h3>
          <div class="activity-list">
            <div class="activity-item"><div><strong>Health checks</strong><span>Review vaccination status for the current litter.</span></div></div>
            <div class="activity-item"><div><strong>Customer follow-up</strong><span>Three inquiries are waiting for a response.</span></div></div>
            <div class="activity-item"><div><strong>Website queue</strong><span>New gallery updates are staged as placeholders.</span></div></div>
            <div class="activity-item"><div><strong>Production notes</strong><span>Log outcomes once CRUD is introduced.</span></div></div>
          </div>
        </aside>
      </section>

      <section class="metric-grid" aria-label="Kennel metrics">
        <div class="metric-card"><strong>92%</strong><span>Record readiness</span><em>Prototype metric</em></div>
        <div class="metric-card"><strong>4</strong><span>Litters planned</span><em>Next 90 days</em></div>
        <div class="metric-card"><strong>31</strong><span>Customer profiles</span><em>Placeholder data</em></div>
        <div class="metric-card"><strong>8</strong><span>Website tasks</span><em>Needs content</em></div>
      </section>

      <section class="split-grid">
        <div class="panel table-shell">
          <h3>Recent activity</h3>
          <table class="data-table">
            <thead>
              <tr>
                <th>Area</th>
                <th>Item</th>
                <th>Status</th>
                <th>Owner</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Studs</td>
                <td>Featured profile cleanup</td>
                <td><span class="tag">Ready</span></td>
                <td>Admin</td>
              </tr>
              <tr>
                <td>Available</td>
                <td>Availability draft</td>
                <td><span class="tag">Queued</span></td>
                <td>Admin</td>
              </tr>
              <tr>
                <td>Website</td>
                <td>Homepage feature section</td>
                <td><span class="tag">Draft</span></td>
                <td>Admin</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="panel">
          <h3>Next build phases</h3>
          <div class="activity-list">
            <div class="activity-item"><div><strong>Authentication</strong><span>Supabase email/password sign-in now protects the dashboard shell.</span></div></div>
            <div class="activity-item"><div><strong>CRUD modules</strong><span>Placeholder screens are ready for future forms and tables.</span></div></div>
            <div class="activity-item"><div><strong>Database</strong><span>Supabase can be wired later without changing the shell.</span></div></div>
          </div>
        </div>
      </section>
    `
  },
  studs: {
    title: "Studs",
    eyebrow: "Stud roster",
    render: () => `
      <section class="module-shell studs-module" data-module="studs">
        <div class="module-header">
          <div>
            <p class="eyebrow">Stud database</p>
            <h2>Manage studs</h2>
            <p>Add, edit, delete, and upload gallery photos for studs stored in the existing Supabase dogs table.</p>
          </div>
          <button class="button" type="button" data-stud-action="refresh">Refresh</button>
        </div>

        <div class="module-grid">
          <form class="panel stud-form" id="studForm">
            <input type="hidden" id="studId" name="id" />
            <div class="form-heading">
              <h3 id="studFormTitle">Add Stud</h3>
              <button class="button ghost" type="button" data-stud-action="reset">Clear</button>
            </div>

            <div class="form-grid">
              <label>
                Name
                <textarea name="name" rows="2" required></textarea>
              </label>
              <label>
                Age <span class="optional-label">Optional</span>
                <input name="age" type="number" min="0" step="1" />
              </label>
              <label>
                Color <span class="optional-label">Optional</span>
                <input name="color" type="text" />
              </label>
              <label>
                Stud fee <span class="optional-label">Optional</span>
                <input name="stud_fee" type="text" />
              </label>
              <label>
                Lineage / Parents <span class="optional-label">Optional</span>
                <input name="lineage" type="text" placeholder="PBK Hellboy × GB Mystic" />
              </label>
              <label>
                Pedigree URL <span class="optional-label">Optional</span>
                <input name="pedigree_url" type="url" placeholder="https://example.com/pedigree" />
              </label>
            </div>

            <label>
              Description
              <textarea name="description" rows="4" required></textarea>
            </label>

            <label>
              Photos
              <input id="studPhotos" name="photos" type="file" accept="image/*" multiple />
            </label>

            <div class="photo-preview photo-grid-preview" id="studPhotoPreview">
              <span>No photos selected</span>
            </div>

            <p class="auth-message" id="studMessage" hidden></p>

            <div class="form-actions">
              <button class="button primary" type="submit">Save stud</button>
              <button class="button" type="button" data-stud-action="reset">Cancel</button>
            </div>
          </form>

          <section class="panel studs-list-panel">
            <div class="form-heading">
              <h3>Studs list</h3>
              <span class="tag" id="studsCount">0 studs</span>
            </div>

            <div class="setup-note" id="studsSetupNote" hidden>
              <strong>Supabase schema update required</strong>
              <span>The Studs UI still uses the existing <code>dogs</code> table. See comments in <code>assets/js/studs.js</code> for the needed columns and policies.</span>
            </div>

            <div class="table-shell">
              <table class="data-table studs-table">
                <thead>
                  <tr>
                    <th>Photos</th>
                    <th>Name</th>
                    <th>Age</th>
                    <th>Color</th>
                    <th>Stud fee</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody id="studsTableBody">
                  <tr>
                    <td colspan="6">Loading studs...</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>
    `
  },
  females: {
    title: "Females",
    eyebrow: "Female roster",
    render: () => `
      <section class="module-shell females-module" data-module="females">
        <div class="module-header">
          <div>
            <p class="eyebrow">Female database</p>
            <h2>Manage females</h2>
            <p>Add, edit, delete, reorder, and upload gallery photos for females stored in the Supabase females table.</p>
          </div>
          <button class="button" type="button" data-female-action="refresh">Refresh</button>
        </div>

        <div class="module-grid">
          <form class="panel stud-form" id="femaleForm">
            <input type="hidden" id="femaleId" name="id" />
            <div class="form-heading">
              <h3 id="femaleFormTitle">Add Female</h3>
              <button class="button ghost" type="button" data-female-action="reset">Clear</button>
            </div>

            <div class="form-grid">
              <label>
                Name
                <textarea name="name" rows="2" required></textarea>
              </label>
              <label>
                Age <span class="optional-label">Optional</span>
                <input name="age" type="number" min="0" step="1" />
              </label>
              <label>
                Color <span class="optional-label">Optional</span>
                <input name="color" type="text" />
              </label>
              <label>
                Lineage / Parents <span class="optional-label">Optional</span>
                <input name="lineage" type="text" placeholder="PBK Hellboy × GB Mystic" />
              </label>
              <label>
                Pedigree URL <span class="optional-label">Optional</span>
                <input name="pedigree_url" type="url" placeholder="https://example.com/pedigree" />
              </label>
            </div>

            <label>
              Description
              <textarea name="description" rows="4" required></textarea>
            </label>

            <label>
              Photos
              <input id="femalePhotos" name="photos" type="file" accept="image/*" multiple />
            </label>

            <div class="photo-preview photo-grid-preview" id="femalePhotoPreview">
              <span>No photos selected</span>
            </div>

            <p class="auth-message" id="femaleMessage" hidden></p>

            <div class="form-actions">
              <button class="button primary" type="submit">Save female</button>
              <button class="button" type="button" data-female-action="reset">Cancel</button>
            </div>
          </form>

          <section class="panel studs-list-panel">
            <div class="form-heading">
              <h3>Females list</h3>
              <span class="tag" id="femalesCount">0 females</span>
            </div>

            <div class="setup-note" id="femalesSetupNote" hidden>
              <strong>Supabase schema update required</strong>
              <span>The Females UI uses the existing <code>females</code> table.</span>
            </div>

            <div class="table-shell">
              <table class="data-table studs-table">
                <thead>
                  <tr>
                    <th>Photo</th>
                    <th>Female</th>
                    <th>Age</th>
                    <th>Color</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody id="femalesTableBody">
                  <tr>
                    <td colspan="5">Loading females...</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>
    `
  },
  productions: {
    title: "Productions",
    eyebrow: "Production history",
    render: () => `
      <section class="module-shell productions-module" data-module="productions">
        <div class="module-header">
          <div>
            <p class="eyebrow">Production database</p>
            <h2>Manage productions</h2>
            <p>Add, edit, delete, reorder, and upload gallery photos for productions stored in the Supabase productions table.</p>
          </div>
          <button class="button" type="button" data-production-action="refresh">Refresh</button>
        </div>

        <div class="module-grid">
          <form class="panel stud-form" id="productionForm">
            <input type="hidden" id="productionId" name="id" />
            <div class="form-heading">
              <h3 id="productionFormTitle">Add Production</h3>
              <button class="button ghost" type="button" data-production-action="reset">Clear</button>
            </div>

            <div class="form-grid">
              <label>
                Name
                <textarea name="name" rows="2" required></textarea>
              </label>
              <label>
                Lineage / Parents <span class="optional-label">Optional</span>
                <input name="lineage" type="text" placeholder="PBK Hellboy × GB Mystic" />
              </label>
              <label>
                Pedigree URL <span class="optional-label">Optional</span>
                <input name="pedigree_url" type="url" placeholder="https://example.com/pedigree" />
              </label>
            </div>

            <label>
              Description <span class="optional-label">Optional</span>
              <textarea name="description" rows="4"></textarea>
            </label>

            <label>
              Photos
              <input id="productionPhotos" name="photos" type="file" accept="image/*" multiple />
            </label>

            <div class="photo-preview photo-grid-preview" id="productionPhotoPreview">
              <span>No photos selected</span>
            </div>

            <p class="auth-message" id="productionMessage" hidden></p>

            <div class="form-actions">
              <button class="button primary" type="submit">Save production</button>
              <button class="button" type="button" data-production-action="reset">Cancel</button>
            </div>
          </form>

          <section class="panel studs-list-panel">
            <div class="form-heading">
              <h3>Productions list</h3>
              <span class="tag" id="productionsCount">0 productions</span>
            </div>

            <div class="setup-note" id="productionsSetupNote" hidden>
              <strong>Supabase schema update required</strong>
              <span>The Productions UI uses the existing <code>productions</code> table.</span>
            </div>

            <div class="table-shell">
              <table class="data-table studs-table">
                <thead>
                  <tr>
                    <th>Photo</th>
                    <th>Production</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody id="productionsTableBody">
                  <tr>
                    <td colspan="3">Loading productions...</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>
    `
  },
  breedings: {
    title: "Breedings",
    eyebrow: "Pairing planner",
    render: () => renderBreederModule({
      route: "breedings",
      title: "Breedings",
      eyebrow: "Breeding database",
      description: "Add breeding records with photos and an optional description.",
      fields: [
        { name: "description", label: "Description", type: "textarea", optional: true }
      ]
    })
  },
  available: {
    title: "Available",
    eyebrow: "Available dogs",
    render: () => renderBreederModule({
      route: "available",
      title: "Available",
      eyebrow: "Available database",
      description: "Add available listings with photos, price, color, and optional details.",
      fields: [
        { name: "price", label: "Price", type: "text", required: true },
        { name: "color", label: "Color", type: "text", required: true },
        { name: "age", label: "Age", type: "number", optional: true, attrs: 'min="0" step="1"' },
        { name: "name", label: "Name", type: "text", optional: true },
        { name: "description", label: "Description", type: "textarea", optional: true },
        { name: "pedigree_url", label: "Pedigree URL", type: "url", optional: true, attrs: 'placeholder="https://example.com/pedigree"' }
      ]
    })
  },
  gallery: {
    title: "Gallery",
    eyebrow: "Media library",
    render: () => renderBreederModule({
      route: "gallery",
      title: "Gallery",
      eyebrow: "Gallery database",
      description: "Upload and manage gallery photo sets.",
      fields: []
    })
  },
  website: page("Website", "Public website", "Coordinate homepage content, dog galleries, puppy listings, and inquiry flow from this section later.", ["Hero content", "Gallery queue", "Inquiry funnel"]),
  settings: page("Settings", "System preferences", "Configure business details, notification preferences, team roles, and future integrations from here.", ["Kennel profile", "Team access", "Integrations"])
};

function renderBreederModule({ route, title: moduleTitle, eyebrow: moduleEyebrow, description, fields }) {
  const formFields = fields.map((field) => {
    const optional = field.optional ? ' <span class="optional-label">Optional</span>' : "";
    const required = field.required ? "required" : "";
    const attrs = field.attrs || "";

    if (field.type === "textarea") {
      return `
        <label>
          ${field.label}${optional}
          <textarea name="${field.name}" rows="4" ${required}></textarea>
        </label>
      `;
    }

    return `
      <label>
        ${field.label}${optional}
        <input name="${field.name}" type="${field.type}" ${attrs} ${required} />
      </label>
    `;
  }).join("");

  const tableColumns = fields.map((field) => `<th>${field.label}</th>`).join("");
  const tableColspan = fields.length + 2;

  return `
    <section class="module-shell content-module" data-module="${route}">
      <div class="module-header">
        <div>
          <p class="eyebrow">${moduleEyebrow}</p>
          <h2>Manage ${moduleTitle.toLowerCase()}</h2>
          <p>${description}</p>
        </div>
        <button class="button" type="button" data-content-action="refresh">Refresh</button>
      </div>

      <div class="module-grid">
        <form class="panel content-form" id="${route}Form">
          <input type="hidden" name="id" />
          <div class="form-heading">
            <h3 id="${route}FormTitle">Add ${moduleTitle}</h3>
            <button class="button ghost" type="button" data-content-action="reset">Clear</button>
          </div>

          ${fields.length ? `<div class="form-grid">${formFields}</div>` : ""}

          <label>
            Photos
            <input id="${route}Photos" name="photos" type="file" accept="image/*" multiple />
          </label>

          <div class="photo-preview photo-grid-preview" id="${route}PhotoPreview">
            <span>No photos selected</span>
          </div>

          <p class="auth-message" id="${route}Message" hidden></p>

          <div class="form-actions">
            <button class="button primary" type="submit">Save ${moduleTitle.toLowerCase()}</button>
            <button class="button" type="button" data-content-action="reset">Cancel</button>
          </div>
        </form>

        <section class="panel content-list-panel">
          <div class="form-heading">
            <h3>${moduleTitle} list</h3>
            <span class="tag" id="${route}Count">0 records</span>
          </div>

          <div class="setup-note" id="${route}SetupNote" hidden>
            <strong>Supabase schema setup required</strong>
            <span>See comments in <code>assets/js/breeder-modules.js</code> for the required table and storage setup.</span>
          </div>

          <div class="table-shell">
            <table class="data-table content-table">
              <thead>
                <tr>
                  <th>Photos</th>
                  ${tableColumns}
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody id="${route}TableBody">
                <tr>
                  <td colspan="${tableColspan}">Loading ${moduleTitle.toLowerCase()}...</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </section>
  `;
}

function page(title, eyebrow, description, cards) {
  return {
    title,
    eyebrow,
    render: () => `
      <section class="placeholder-card">
        <p class="eyebrow">${eyebrow}</p>
        <h2>${title}</h2>
        <p>${description}</p>
        <div class="placeholder-grid">
          ${cards.map((card) => `
            <div class="placeholder-item">
              <strong>${card}</strong>
              <span>This area is intentionally reserved for the next application phase.</span>
            </div>
          `).join("")}
        </div>
      </section>
    `
  };
}

const content = document.querySelector("#appContent");
const title = document.querySelector("#pageTitle");
const eyebrow = document.querySelector("#pageEyebrow");
const navItems = document.querySelectorAll("[data-route]");
const menuToggle = document.querySelector(".menu-toggle");

function setRoute(routeName) {
  const normalizedRoute = routes[routeName] ? routeName : "dashboard";
  const route = routes[normalizedRoute];

  title.textContent = route.title;
  eyebrow.textContent = route.eyebrow;
  content.innerHTML = route.render();

  navItems.forEach((item) => {
    const isActive = item.dataset.route === normalizedRoute;
    item.classList.toggle("is-active", isActive);
    if (item.tagName === "BUTTON") {
      item.setAttribute("aria-current", isActive ? "page" : "false");
    }
  });

  if (window.location.hash !== `#${normalizedRoute}`) {
    history.replaceState(null, "", `#${normalizedRoute}`);
  }

  document.body.classList.remove("nav-open");
  menuToggle?.setAttribute("aria-expanded", "false");
  window.dispatchEvent(new CustomEvent("dashboard:route-change", {
    detail: { route: normalizedRoute }
  }));
}

navItems.forEach((item) => {
  item.addEventListener("click", (event) => {
    event.preventDefault();
    setRoute(item.dataset.route);
  });
});

menuToggle?.addEventListener("click", () => {
  const isOpen = document.body.classList.toggle("nav-open");
  menuToggle.setAttribute("aria-expanded", String(isOpen));
});

window.addEventListener("hashchange", () => {
  setRoute(window.location.hash.replace("#", "") || "dashboard");
});

setRoute(window.location.hash.replace("#", "") || "dashboard");
